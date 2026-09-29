"""
MockAIProvider — fully deterministic, rule-based reasoning. No external API
calls, no invented facts: every sentence it produces is templated from data
that already exists in the database (compliance report, discrepancies,
forensic/behavioral signals). This is the default and, per this build,
the only wired AI provider.
"""
from typing import Any

from app.providers.ai.base import AIProvider

DISCLAIMER = "AI recommendation is decision-support only. Final decision rests with the Procurement Officer."


class MockAIProvider(AIProvider):
    def build_recommendation(self, context: dict[str, Any]) -> dict[str, Any]:
        score = context["overall_score"]
        risk_level = context["risk_level"]
        failed = context["failed_requirements"]
        requires_review = context["requires_review_requirements"]
        pending = context["pending_requirements"]
        discrepancies = context.get("discrepancies", [])
        forensic_risk_level = context.get("forensic_risk_level", "LOW")
        behavioral_risk_level = context.get("behavioral_risk_level", "LOW")
        debarment_flagged = context.get("debarment_flagged", False)

        high_severity_discrepancies = [d for d in discrepancies if d.get("severity") == "HIGH"]

        critical_issues = []
        for f in failed:
            critical_issues.append(f"Mandatory requirement '{f}' is not satisfied.")
        for d in high_severity_discrepancies:
            critical_issues.append(d.get("description", "High severity discrepancy detected."))
        if debarment_flagged:
            critical_issues.append("Debarment/blacklisting registry check requires manual review.")

        reasons = []
        reasons.append(f"Overall compliance score is {score}/100 ({risk_level} risk).")
        if failed:
            reasons.append(f"{len(failed)} mandatory requirement(s) failed verification: {', '.join(failed)}.")
        if requires_review:
            reasons.append(f"{len(requires_review)} requirement(s) require manual review: {', '.join(requires_review)}.")
        if pending:
            reasons.append(f"{len(pending)} requirement(s) are pending evidence: {', '.join(pending)}.")
        if forensic_risk_level != "LOW":
            reasons.append(f"Document forensics indicate {forensic_risk_level.lower()} integrity risk on one or more submitted documents.")
        if behavioral_risk_level != "LOW":
            reasons.append(f"Behavioral analysis surfaced {behavioral_risk_level.lower()}-level indicators warranting review.")
        if not reasons[1:]:
            reasons.append("No mandatory requirement failures, unresolved reviews, or elevated risk signals were found.")

        # Decision logic — conservative by design; ties default to REQUIRES_REVIEW.
        if failed and risk_level == "HIGH":
            recommendation = "NON_COMPLIANT"
            confidence = round(min(0.95, 0.6 + 0.35 * (len(failed) / max(1, len(failed) + 1))), 2)
        elif (
            requires_review
            or high_severity_discrepancies
            or debarment_flagged
            or forensic_risk_level == "HIGH"
            or behavioral_risk_level == "HIGH"
            or risk_level == "MEDIUM"
        ):
            recommendation = "REQUIRES_REVIEW"
            confidence = round(min(0.9, 0.5 + score / 300), 2)
        elif risk_level == "LOW" and not failed and not pending:
            recommendation = "COMPLIANT"
            confidence = round(min(0.98, 0.7 + score / 400), 2)
        else:
            recommendation = "REQUIRES_REVIEW"
            confidence = 0.6

        recommended_actions = []
        for f in failed:
            recommended_actions.append(f"Request clarification or updated documentation for the failed '{f}' requirement.")
        for d in high_severity_discrepancies:
            recommended_actions.append(f"Manually verify: {d.get('description')}")
        if pending:
            recommended_actions.append(f"Follow up with bidder to submit missing evidence for: {', '.join(pending)}.")
        if forensic_risk_level != "LOW":
            recommended_actions.append("Inspect flagged document(s) in the Forensics module before relying on them as evidence.")
        if behavioral_risk_level != "LOW":
            recommended_actions.append("Review behavioral risk flags and, if warranted, cross-bidder relationships before deciding.")
        if not recommended_actions:
            recommended_actions.append("No further action required based on current evidence; proceed with standard review.")

        return {
            "recommendation": recommendation,
            "confidence": confidence,
            "reasons": reasons,
            "critical_issues": critical_issues,
            "missing_requirements": pending,
            "recommended_actions": recommended_actions,
            "disclaimer": DISCLAIMER,
        }

    def explain_anomaly(self, signal: dict[str, Any]) -> str:
        kind = signal.get("kind", "anomaly")
        detail = signal.get("detail", "")
        return f"Potential {kind.replace('_', ' ').lower()} detected. {detail} Manual verification recommended.".strip()

    def answer_copilot_question(self, question: str, evidence: dict[str, Any]) -> dict[str, Any]:
        """Very small templated intent matcher over already-computed evidence.
        Never invents facts — every answer cites data already in `evidence`."""
        q = question.lower()

        def cite(items):
            return items if items else ["No supporting evidence found in the current record."]

        if "why" in q and "high risk" in q or "why is" in q and "risk" in q:
            report = evidence.get("compliance_report", {})
            reasons = evidence.get("ai_recommendation", {}).get("reasons", [])
            answer = (
                f"Bidder is classified {report.get('risk_level', 'UNKNOWN')} risk with an overall compliance score of "
                f"{report.get('overall_score', 'N/A')}/100. " + " ".join(reasons)
            )
            return {"answer": answer, "evidence": cite(reasons)}

        if "which requirements failed" in q or "failed requirement" in q:
            failed = evidence.get("failed_requirements", [])
            if failed:
                answer = f"The following mandatory requirements failed verification: {', '.join(failed)}."
            else:
                answer = "No requirements are currently marked as failed."
            return {"answer": answer, "evidence": cite(failed)}

        if "evidence" in q and "flag" in q:
            flags = evidence.get("behavioral_flags", [])
            answer = f"{len(flags)} behavioral flag(s) are on record." if flags else "No behavioral flags are on record."
            return {"answer": answer, "evidence": cite([f.get("indicator") for f in flags])}

        if "which documents need manual verification" in q or "manual verification" in q:
            docs = evidence.get("documents_requiring_review", [])
            answer = f"{len(docs)} document(s) require manual verification." if docs else "No documents currently require manual verification."
            return {"answer": answer, "evidence": cite(docs)}

        if "why did" in q and "score higher" in q:
            comparison = evidence.get("comparison", {})
            answer = comparison.get("summary", "Comparison data was not provided for this question.")
            return {"answer": answer, "evidence": cite(comparison.get("details", []))}

        if "what changed" in q:
            timeline = evidence.get("recent_audit_events", [])
            answer = "Recent activity: " + "; ".join(timeline) if timeline else "No recent activity is on record for this bidder."
            return {"answer": answer, "evidence": cite(timeline)}

        # Generic fallback grounded strictly in the compliance report.
        report = evidence.get("compliance_report", {})
        answer = (
            f"Based on the current record: overall score {report.get('overall_score', 'N/A')}/100, "
            f"risk level {report.get('risk_level', 'UNKNOWN')}, "
            f"{report.get('failed_count', 0)} failed, {report.get('requires_review_count', 0)} requiring review, "
            f"{report.get('pending_count', 0)} pending requirement(s)."
        )
        return {"answer": answer, "evidence": cite([])}
