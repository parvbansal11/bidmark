"""
Ask Bidmark: a deterministic case assistant.

No language model and no external service. A question is mapped to one intent by
keyword rules, and the answer is composed from records already on the case:
findings and their rulings, the compliance report, registry results, documents,
bidder links, the decision gate and the audit trail. Every sentence is built from
those values, and each answer carries citations that point at the records used.
A question that maps to no intent gets an honest "I can answer questions about ..."
reply, never a guess.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.engines.cartel_engine import analyse_tender
from app.models.audit import AuditLog
from app.models.bidder import Bidder
from app.models.case import BidCase
from app.models.compliance import ComplianceReport, RequirementEvaluation
from app.models.document import Document
from app.models.tender import Requirement, Tender
from app.models.verification import VerificationResult
from app.services import case_service

PROVIDER = "bidmark:deterministic"

SUGGESTIONS = [
    "Why was this bidder flagged?",
    "What compliance checks failed?",
    "Which high findings are unresolved?",
    "Show evidence for the OEM finding.",
    "Why are these bidders linked?",
    "What is blocking the final decision?",
    "Summarise this bidder for officer review.",
]

UNKNOWN = ("I can answer questions about this bidder's compliance checks, findings, evidence, linked bidders, "
           "decision status and audit history.")

CATEGORY = {
    "GST": "GST registration", "PAN": "PAN", "MCA": "certificate of incorporation", "UDYAM": "Udyam registration",
    "INCOME_TAX": "income tax return", "EPFO": "EPFO registration", "ESIC": "ESIC registration", "NSIC": "NSIC registration",
    "STARTUP_INDIA": "Startup India recognition", "OEM_AUTHORIZATION": "OEM authorisation", "LOCAL_CONTENT": "local content declaration",
    "EXPERIENCE_CERTIFICATE": "experience certificate", "FINANCIAL": "CA turnover certificate", "TURNOVER": "turnover requirement",
    "DEBARMENT": "debarment check", "DIGILOCKER": "DigiLocker record", "OTHER": "supporting document",
}

PLAIN = {
    "OVERLAPPING_TEXT": "a value is typed over the original", "FIELD_FONT_OUTLIER": "a field is printed in a different font",
    "MODIFIED_AFTER_SIGNING": "the document was changed after digital signing", "SIGNATURE_BROKEN": "the digital signature is broken",
    "INCREMENTAL_UPDATES": "the document was edited after creation", "EDITOR_TOOL": "the file was last saved by an editing tool",
    "TIMESTAMP_INVERSION": "the document dates are inconsistent", "CATEGORY_MISMATCH": "the file was uploaded under the wrong heading",
    "IDENTICAL_FILE_REUSE_CROSS_BIDDER": "the same file was submitted by another bidder", "COMPRESSION_HOTSPOT": "an image region was pasted in",
    "IMAGE_EDITOR": "the image was edited in software", "NAME_LOOKALIKE": "the submitted name does not match the registry",
    "NAME_MISMATCH": "the submitted name does not match the registry", "EXPIRED_AT_BID_DATE": "it had expired before the bid date",
    "GSTIN_CHECKSUM": "the GSTIN check digit is invalid", "GSTIN_PAN_MISMATCH": "the GSTIN does not contain the PAN",
    "PAN_HOLDER_TYPE": "the PAN holder type does not match the entity", "CIN_YEAR_VS_INCORPORATION": "the CIN year does not match the incorporation date",
    "REQUIREMENT_NOT_MET": "a mandatory requirement is not met", "LINKED_BIDDER_RING": "it is linked to another bidder on this tender",
    "POSSIBLE_COVER_BID": "its price fits a possible cover-bid pattern",
}

LINK = {
    "SHARED_DEVICE": "same device", "SHARED_IP": "same IP address", "SHARED_NETWORK": "same network", "SHARED_DIRECTOR": "common director",
    "SHARED_PHONE": "same phone number", "SHARED_EMAIL": "same email address", "SHARED_EMAIL_DOMAIN": "same private mail domain",
    "SHARED_ADDRESS": "same registered address", "SHARED_DOCUMENT_AUTHOR": "same PDF author", "IDENTICAL_FILE": "identical file",
    "SYNCHRONIZED_SUBMISSION": "bids submitted minutes apart",
}

# Words a question may use to name a document or finding type.
ENTITY_WORDS = {
    "OEM_AUTHORIZATION": ("oem", "authoris", "authoriz", "manufacturer"), "GST": ("gst",), "PAN": ("pan",),
    "MCA": ("mca", "cin", "incorporation"), "FINANCIAL": ("turnover", "financial", "ca certificate"), "UDYAM": ("udyam", "msme"),
    "EXPERIENCE_CERTIFICATE": ("experience",), "LOCAL_CONTENT": ("local content", "make in india"), "EPFO": ("epfo",),
    "ESIC": ("esic",), "NSIC": ("nsic",), "INCOME_TAX": ("income tax", "itr"),
}

# Order matters: the first rule whose words appear wins.
RULES: list[tuple[str, tuple[str, ...]]] = [
    ("BIDDER_SUMMARY", ("summar", "overview", "brief me", "tell me about", "at a glance")),
    ("DEBARMENT_STATUS", ("debar", "blacklist", "black list", "banned")),
    ("LINKED_BIDDERS", ("link", "related", "collu", "cartel", "ring", "connected", "cover bid", "shared")),
    ("RISK_REASON", ("risk",)),
    ("COMPLIANCE_SCORE", ("score",)),
    ("DECISION_BLOCKERS", ("block", "decision", "decide", "qualif", "locked", "gate", "stopping")),
    ("AUDIT_SUMMARY", ("changed", "ruling", "ruled", "audit", "history", "happened", "timeline", "upheld", "dismissed")),
    ("PENDING_CHECKS", ("pending", "missing", "not checked", "outstanding", "yet to", "statutory")),
    ("FAILED_CHECKS", ("fail", "non compliant", "noncompliant", "not met", "compliance check", "checks")),
    ("FINDING_EVIDENCE", ("evidence", "show", "where", "which page", "proof")),
    ("DOCUMENT_FINDINGS", ("document", "certificate", "file", "tamper", "altered", "modified", "forged")),
    ("HIGH_FINDINGS", ("high", "unresolved", "open finding", "severe", "serious")),
    ("FLAG_REASON", ("why", "flag", "review", "escalat", "concern", "problem", "wrong")),
]


def normalise(q: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", q.lower().replace("-", " "))).strip()


def classify(question: str) -> str | None:
    q = f" {normalise(question)} "
    for intent, words in RULES:
        if any(w in q for w in words):
            return intent
    return None


@dataclass
class Context:
    bidder_id: str
    tender_id: str
    bidder_name: str
    tender_number: str
    case: dict | None
    report: ComplianceReport | None
    evaluations: list[RequirementEvaluation]
    mandatory: dict[str, bool]
    registry: dict[str, VerificationResult]
    documents: dict[str, Document]
    links: list[dict]
    rings: list[dict]
    names: dict[str, str]
    audit: list[AuditLog]
    findings: list[dict] = field(default_factory=list)


def build_context(db: Session, bidder_id: str, tender_id: str) -> Context:
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    case = db.query(BidCase).filter(BidCase.bidder_id == bidder_id, BidCase.tender_id == tender_id).first()
    view = case_service.view(db, case) if case else None
    report = (db.query(ComplianceReport).filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
              .order_by(ComplianceReport.created_at.desc()).first())
    evaluations = db.query(RequirementEvaluation).filter(RequirementEvaluation.report_id == report.id).all() if report else []
    mandatory = {r.requirement_type: bool(r.is_mandatory) for r in db.query(Requirement).filter(Requirement.tender_id == tender_id)}
    docs = {d.id: d for d in db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False)}  # noqa: E712
    registry: dict[str, VerificationResult] = {}
    if docs:
        for v in (db.query(VerificationResult).filter(VerificationResult.document_id.in_(list(docs)))
                  .order_by(VerificationResult.created_at.asc())):
            registry[v.verification_type] = v
    try:
        intel = analyse_tender(db, tender_id)
    except ValueError:
        intel = {"links": [], "rings": [], "bidder_names": {}}
    links = [l for l in intel.get("links", []) if bidder_id in (l["a"], l["b"])]
    rings = [r for r in intel.get("rings", []) if bidder_id in r["members"]]
    audit = (db.query(AuditLog).filter(AuditLog.bidder_id == bidder_id)
             .filter((AuditLog.tender_id == tender_id) | (AuditLog.tender_id.is_(None)))
             .order_by(AuditLog.seq.desc()).limit(40).all())
    return Context(
        bidder_id=bidder_id, tender_id=tender_id,
        bidder_name=(bidder.company_name if bidder else "This bidder"), tender_number=(tender.tender_number if tender else ""),
        case=view, report=report, evaluations=evaluations, mandatory=mandatory, registry=registry, documents=docs,
        links=links, rings=rings, names=intel.get("bidder_names", {}) or {}, audit=audit,
        findings=[f for f in (view or {}).get("findings", []) if f.get("severity") != "INFO"],
    )


# ---------------------------------------------------------------- citations

def _cite_finding(ctx: Context, f: dict) -> dict:
    return {"type": "finding", "id": f["id"], "label": _finding_label(f), "document_id": _doc_id(f), "page": f.get("page")}


def _cite_document(ctx: Context, doc_id: str, page: int | None = None) -> dict | None:
    d = ctx.documents.get(doc_id)
    if not d:
        return None
    return {"type": "document", "id": d.id, "document_id": d.id, "page": page, "label": d.original_filename}


def _cite_check(requirement_type: str, label: str) -> dict:
    return {"type": "check", "id": requirement_type, "requirement_type": requirement_type, "label": label}


def _dedupe(cites: list[dict | None]) -> list[dict]:
    out, seen = [], set()
    for c in cites:
        if c and (c["type"], c["id"]) not in seen:
            seen.add((c["type"], c["id"]))
            out.append(c)
    return out


# ---------------------------------------------------------------- phrasing helpers

def _doc_id(f: dict) -> str | None:
    if f.get("document_id"):
        return f["document_id"]
    pins = (f.get("evidence") or {}).get("pins") or []
    return pins[0].get("document_id") if pins else None


def _category(code: str | None) -> str:
    return CATEGORY.get(code or "", (code or "document").replace("_", " ").lower())


CARTEL_LABEL = {"LINKED_BIDDER_RING": "Linked bidder relationship", "POSSIBLE_COVER_BID": "Possible cover bid pattern"}


def _finding_label(f: dict) -> str:
    if f["code"] in CARTEL_LABEL:
        return CARTEL_LABEL[f["code"]]
    what = PLAIN.get(f["code"], f.get("title") or f["code"].replace("_", " ").lower())
    return f"{_category(f.get('category'))}: {what}" if f.get("category") else what[0].upper() + what[1:]


def _sentence(f: dict) -> str:
    what = PLAIN.get(f["code"], (f.get("title") or "a finding was raised").lower())
    if f["source"] == "CARTEL":
        return what[0].upper() + what[1:]
    subject = f"the {_category(f.get('category'))}" if f.get("category") else "a submitted document"
    return f"On {subject}, {what}"


def _join(items: list[str]) -> str:
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def _open_high(ctx: Context) -> list[dict]:
    ids = set((ctx.case or {}).get("undisposed_high", []))
    return [f for f in ctx.findings if f["id"] in ids]


def _open(ctx: Context) -> list[dict]:
    return [f for f in ctx.findings if not f.get("disposition")]


def _sorted(fs: list[dict]) -> list[dict]:
    rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    return sorted(fs, key=lambda f: (rank.get(f["severity"], 3), f["source"] != "CARTEL"))


REC = {"RECOMMEND_APPROVAL": "eligible on recorded evidence", "RECOMMEND_REVIEW": "review before qualification",
       "RECOMMEND_REJECTION": "a mandatory requirement is not evidenced"}


# ---------------------------------------------------------------- intents

def flag_reason(ctx: Context) -> tuple[str, list[dict]]:
    open_high, opened = _open_high(ctx), _sorted(_open(ctx))
    if not ctx.case:
        return f"{ctx.bidder_name} has not been screened on {ctx.tender_number} yet, so no finding is recorded.", []
    if not opened:
        return f"{ctx.bidder_name} has no open findings. Every finding raised has an officer ruling, or none was raised.", []
    lead = opened[:3]
    head = (f"{ctx.bidder_name} requires review because {_plural(len(open_high), 'high-severity finding')} "
            f"{'is' if len(open_high) == 1 else 'are'} unresolved." if open_high
            else f"{ctx.bidder_name} has {_plural(len(opened), 'open finding')} for review.")
    body = ". ".join(_sentence(f) for f in lead) + "."
    rec = ctx.case.get("ai_recommendation")
    tail = f" Bidmark's recommendation is {REC[rec]}; the officer decides." if rec in REC else ""
    return f"{head} {body}{tail}", [_cite_finding(ctx, f) for f in lead]


def high_findings(ctx: Context) -> tuple[str, list[dict]]:
    highs = [f for f in ctx.findings if f["severity"] == "HIGH"]
    open_high = _open_high(ctx)
    if not highs:
        return f"No high-severity finding was raised on {ctx.bidder_name}.", []
    ruled = [f for f in highs if f.get("disposition")]
    parts = []
    if open_high:
        parts.append(f"{_plural(len(open_high), 'high finding')} {'is' if len(open_high) == 1 else 'are'} unresolved: "
                     + "; ".join(_finding_label(f) for f in open_high) + ".")
    else:
        parts.append("Every high finding has an officer ruling.")
    if ruled:
        up = sum(1 for f in ruled if f["disposition"]["outcome"] == "UPHELD")
        parts.append(f"{_plural(len(ruled), 'other high finding', 'other high findings') if open_high else _plural(len(ruled), 'high finding')} "
                     f"{'has' if len(ruled) == 1 else 'have'} a ruling ({up} upheld, {len(ruled) - up} dismissed).")
    return " ".join(parts), [_cite_finding(ctx, f) for f in open_high or ruled]


def _eval_label(e: RequirementEvaluation) -> str:
    return _category(e.requirement_type)


def failed_checks(ctx: Context) -> tuple[str, list[dict]]:
    failed = [e for e in ctx.evaluations if e.status == "FAILED"]
    review = [e for e in ctx.evaluations if e.status == "REQUIRES_REVIEW"]
    reg_bad = [v for v in ctx.registry.values() if v.status not in ("VERIFIED",)]
    if not ctx.evaluations and not ctx.registry:
        return "No compliance evaluation is recorded for this bid yet.", []
    if not failed and not review and not reg_bad:
        verified = sum(1 for e in ctx.evaluations if e.status == "VERIFIED")
        return (f"No compliance check failed. {verified} of {len(ctx.evaluations)} tender requirements are verified"
                + (f"; the rest are not applicable or pending." if verified < len(ctx.evaluations) else ".")), []
    parts, cites = [], []
    if failed:
        parts.append("Failed: " + "; ".join(f"{_eval_label(e)} ({e.explanation.rstrip('.')})" for e in failed) + ".")
        cites += [_cite_check(e.requirement_type, _eval_label(e)) for e in failed]
    if review:
        parts.append("Needs review: " + _join([_eval_label(e) for e in review]) + ".")
        cites += [_cite_check(e.requirement_type, _eval_label(e)) for e in review]
    if reg_bad:
        parts.append("Registry results not verified: " + "; ".join(f"{_category(v.verification_type)} returned {v.status.lower().replace('_', ' ')}" for v in reg_bad) + ".")
        cites += [_cite_check(v.verification_type, _category(v.verification_type)) for v in reg_bad]
    return " ".join(parts), cites


def pending_checks(ctx: Context) -> tuple[str, list[dict]]:
    pending = [e for e in ctx.evaluations if e.status == "PENDING"]
    if not ctx.evaluations:
        return "No compliance evaluation is recorded for this bid yet, so every tender requirement is still pending.", []
    if not pending:
        na = sum(1 for e in ctx.evaluations if e.status == "NOT_APPLICABLE")
        return (f"No statutory or tender check is pending. {len(ctx.evaluations) - na} requirements were evaluated"
                + (f" and {na} {'is' if na == 1 else 'are'} optional with no document submitted." if na else ".")), []
    return ("Pending: " + "; ".join(f"{_eval_label(e)}{' (mandatory)' if ctx.mandatory.get(e.requirement_type) else ''}: {e.explanation.rstrip('.')}"
                                     for e in pending) + "."), [_cite_check(e.requirement_type, _eval_label(e)) for e in pending]


def _named_categories(question: str) -> set[str]:
    q = f" {normalise(question)} "
    return {cat for cat, words in ENTITY_WORDS.items() if any(f" {w}" in q for w in words)}


def finding_evidence(ctx: Context, question: str) -> tuple[str, list[dict]]:
    named = _named_categories(question)
    with_doc = [f for f in ctx.findings if _doc_id(f)]
    chosen = [f for f in with_doc if f.get("category") in named] if named else with_doc
    if not chosen:
        what = _join([_category(c) for c in sorted(named)]) or "this bid"
        return f"No document finding is recorded for {what}.", []
    chosen = _sorted(chosen)[:4]
    lines = []
    for f in chosen:
        d = ctx.documents.get(_doc_id(f))
        where = f"{d.original_filename if d else 'the document'}, {'page ' + str(f['page']) if f.get('page') else 'the whole file'}"
        lines.append(f"{_finding_label(f)} ({f['severity'].lower()}), in {where}. {f.get('detail', '').strip()}")
    cites = []
    for f in chosen:
        cites += [_cite_finding(ctx, f), _cite_document(ctx, _doc_id(f), f.get("page"))]
    return "\n\n".join(lines), _dedupe(cites)


def linked_bidders(ctx: Context) -> tuple[str, list[dict]]:
    if not ctx.links:
        return (f"No link between {ctx.bidder_name} and another bidder on {ctx.tender_number} was found. Device, network, declared "
                "details, document authorship, files and submission timing were compared."), []
    by_other: dict[str, list[dict]] = {}
    for l in ctx.links:
        by_other.setdefault(l["b"] if l["a"] == ctx.bidder_id else l["a"], []).append(l)
    parts, cites = [], []
    for other, ls in by_other.items():
        name = ctx.names.get(other, "another bidder")
        details = []
        for l in ls:
            e = l.get("evidence") or {}
            extra = (f" (DIN {', '.join(e['directors'])})" if isinstance(e.get("directors"), list) else
                     f" ('{', '.join(e['authors'])}')" if isinstance(e.get("authors"), list) else
                     f" ({e['seconds']} seconds apart)" if isinstance(e.get("seconds"), (int, float)) else "")
            details.append(LINK.get(l["type"], l["type"].replace("_", " ").lower()) + extra)
        parts.append(f"{ctx.bidder_name} is linked to {name} through {_plural(len(ls), 'shared signal')}: {_join(details)}.")
        cites.append({"type": "relationship", "id": other, "bidder_id": other, "label": f"Link with {name}"})
    for r in ctx.rings:
        cover = r.get("cover_pattern")
        if cover:
            parts.append(cover["detail"])
    parts.append("A link is a lead for review; it does not by itself establish collusion.")
    ring_findings = [f for f in ctx.findings if f["source"] == "CARTEL"]
    return " ".join(parts), cites + [_cite_finding(ctx, f) for f in ring_findings]


def decision_blockers(ctx: Context) -> tuple[str, list[dict]]:
    c = ctx.case
    if not c:
        return "There is no evaluation case for this bid yet, so no decision can be recorded.", []
    if c["stage"] == "DECIDED":
        verdict = "qualified" if c["decision"] == "QUALIFIED" else "disqualified"
        return f"The decision is already recorded: {ctx.bidder_name} was {verdict}. Reason: {c.get('decision_reason') or 'not recorded'}.", []
    if c["stage"] == "CLARIFICATION_REQUESTED":
        return "The decision waits for the bidder to answer the open clarification.", []
    if c["stage"] in ("DRAFT", "SUBMITTED"):
        return "The bid has not finished screening, so no decision can be recorded yet.", []
    open_high = _open_high(ctx)
    if open_high:
        return (f"The decision is locked. {_plural(len(open_high), 'high finding')} "
                f"{'needs' if len(open_high) == 1 else 'need'} an officer ruling first: "
                + "; ".join(_finding_label(f) for f in open_high) + "."), [_cite_finding(ctx, f) for f in open_high]
    return "Nothing blocks the decision. Every high finding has a ruling, so Qualify or Disqualify can be recorded with a reason.", []


def compliance_score(ctx: Context) -> tuple[str, list[dict]]:
    score = (ctx.case or {}).get("summary", {}).get("compliance_score")
    if score is None and ctx.report:
        score = ctx.report.overall_score
    if score is None:
        return "No compliance score is recorded for this bid yet.", []
    counts = {s: sum(1 for e in ctx.evaluations if e.status == s) for s in ("VERIFIED", "FAILED", "PENDING", "REQUIRES_REVIEW", "NOT_APPLICABLE")}
    risk = (ctx.report.risk_level if ctx.report else None) or (ctx.case or {}).get("summary", {}).get("compliance_risk")
    text = (f"The compliance score is {round(score)} out of 100{f', with compliance risk {risk.lower()}' if risk else ''}. "
            f"Of {len(ctx.evaluations)} tender requirements, {counts['VERIFIED']} verified, {counts['FAILED']} failed, "
            f"{counts['REQUIRES_REVIEW']} need review, {counts['PENDING']} pending and {counts['NOT_APPLICABLE']} not applicable.")
    if ctx.findings and any(f["severity"] == "HIGH" for f in ctx.findings):
        text += " The score covers tender requirements; document and linked-bidder findings are assessed separately in the risk level."
    bad = [e for e in ctx.evaluations if e.status in ("FAILED", "REQUIRES_REVIEW", "PENDING")]
    return text, [_cite_check(e.requirement_type, _eval_label(e)) for e in bad]


LANE_REASON = {
    "ESCALATED": "screening escalated the bid because of a document tampering or linked-bidder signal",
    "STANDARD": "screening raised findings that need an officer's review",
    "FAST_TRACK": "screening raised no findings",
}


def risk_reason(ctx: Context) -> tuple[str, list[dict]]:
    c = ctx.case
    if not c:
        return "No risk level is recorded because the bid has not been screened.", []
    lane = c.get("lane")
    comp = c.get("summary", {}).get("compliance_risk")
    level = "high" if lane == "ESCALATED" or comp == "HIGH" else "medium" if lane == "STANDARD" or comp == "MEDIUM" else "low"
    drivers = _sorted([f for f in ctx.findings if f["severity"] in ("HIGH", "MEDIUM")])[:4]
    by_source: dict[str, int] = {}
    for f in ctx.findings:
        if f["severity"] == "HIGH":
            by_source[f["source"]] = by_source.get(f["source"], 0) + 1
    src_label = {"DOCUMENT": "document", "CARTEL": "linked-bidder", "CROSS_CHECK": "identity cross-check", "REQUIREMENT": "requirement"}
    text = f"The risk level is {level}: {LANE_REASON.get(lane, 'set by the screening result')}"
    if comp:
        text += f", and the compliance report rates risk {comp.lower()}"
    text += "."
    if by_source:
        text += " High findings by source: " + _join([f"{n} {src_label.get(s, s.lower())}" for s, n in by_source.items()]) + "."
    if c.get("summary", {}).get("in_ring"):
        text += " The bidder is part of a linked bidder group on this tender."
    return text, [_cite_finding(ctx, f) for f in drivers]


def audit_summary(ctx: Context) -> tuple[str, list[dict]]:
    ruled = sorted([f for f in ctx.findings if f.get("disposition")], key=lambda f: f["disposition"]["at"])
    parts, cites = [], []
    if ruled:
        parts.append("Officer rulings: " + "; ".join(
            f"{_finding_label(f)} {f['disposition']['outcome'].lower()}" + (f" ({f['disposition']['note'].rstrip('.')})" if f["disposition"].get("note") else "")
            for f in ruled) + ".")
        remaining = len(_open_high(ctx))
        stage = (ctx.case or {}).get("stage")
        parts.append(f"After these rulings, {_plural(remaining, 'high finding')} {'remains' if remaining == 1 else 'remain'} open"
                     + (", so the decision is still locked." if remaining else
                        (", and the decision has been recorded." if stage == "DECIDED" else ", so the decision can be recorded.")))
        cites += [_cite_finding(ctx, f) for f in ruled]
    else:
        parts.append("No officer ruling is recorded on this bid yet.")
    notable = [a for a in ctx.audit if a.action in ("FINAL_DECISION", "CASE_TRANSITION", "CASE_SCREENED", "CLARIFICATION_ANSWERED", "FINDING_DISPOSITION", "BID_SUBMITTED")][:4]
    if notable:
        parts.append("Recent recorded events: " + "; ".join(a.description.rstrip(".") for a in notable) + ".")
        cites += [{"type": "audit", "id": str(a.seq), "seq": a.seq, "label": a.action.replace("_", " ").capitalize()} for a in notable if a.seq]
    return " ".join(parts), cites


def document_findings(ctx: Context) -> tuple[str, list[dict]]:
    by_doc: dict[str, list[dict]] = {}
    for f in ctx.findings:
        if _doc_id(f) and f["source"] in ("DOCUMENT", "CROSS_CHECK"):
            by_doc.setdefault(_doc_id(f), []).append(f)
    flagged_status = [d for d in ctx.documents.values() if d.status == "REQUIRES_REVIEW" and d.id not in by_doc]
    if not by_doc and not flagged_status:
        return f"None of the {_plural(len(ctx.documents), 'document')} on file for {ctx.bidder_name} has a finding.", []
    parts, cites = [], []
    for doc_id, fs in by_doc.items():
        d = ctx.documents.get(doc_id)
        open_n = sum(1 for f in fs if not f.get("disposition"))
        parts.append(f"{d.original_filename if d else 'A document'} ({_category(d.category if d else None)}): "
                     f"{_plural(len(fs), 'finding')} ({open_n} open). Most serious: {PLAIN.get(_sorted(fs)[0]['code'], _sorted(fs)[0].get('title', 'a finding'))}.")
        cites.append(_cite_document(ctx, doc_id, _sorted(fs)[0].get("page")))
    for d in flagged_status:
        parts.append(f"{d.original_filename} is marked for review by verification.")
        cites.append(_cite_document(ctx, d.id))
    return " ".join(parts), _dedupe(cites)


def debarment_status(ctx: Context) -> tuple[str, list[dict]]:
    ev = next((e for e in ctx.evaluations if e.requirement_type == "DEBARMENT"), None)
    reg = ctx.registry.get("DEBARMENT")
    status = (reg.status if reg else None) or (ev.status if ev else None)
    texts = ([ev.explanation] + [str(x) for x in (ev.evidence or [])]) if ev else []
    sandbox = bool(reg and reg.is_mock) or any("sandbox" in t.lower() or "mock" in t.lower() for t in texts)
    source = "the sandbox debarment list held by the verification service" if sandbox else "the debarment list"
    if status is None:
        return "No debarment check is recorded for this bid; the tender does not require one or it has not run.", []
    cite = [_cite_check("DEBARMENT", "Debarment check")]
    if status == "VERIFIED":
        return f"No active debarment or blacklisting record was found for {ctx.bidder_name} in {source}.", cite
    if status in ("FAILED", "MISMATCH"):
        return f"A potential debarment match was found for {ctx.bidder_name} in {source}. {ev.explanation if ev else ''}".strip(), cite
    return f"The debarment check is {status.lower().replace('_', ' ')} for {ctx.bidder_name}.", cite


def bidder_summary(ctx: Context) -> tuple[str, list[dict]]:
    c = ctx.case
    if not c:
        return f"{ctx.bidder_name} has no screened bid on {ctx.tender_number}.", []
    parts = [f"{ctx.bidder_name} on {ctx.tender_number}."]
    score = c.get("summary", {}).get("compliance_score")
    if score is not None:
        parts.append(f"Compliance score {round(score)} out of 100.")
    lane = c.get("lane")
    parts.append(f"Risk {'high' if lane == 'ESCALATED' else 'medium' if lane == 'STANDARD' else 'low'}.")
    failed = [e for e in ctx.evaluations if e.status in ("FAILED", "REQUIRES_REVIEW")]
    parts.append(f"{_plural(len(failed), 'tender requirement')} failed or need review." if failed else "All evaluated tender requirements pass.")
    open_high = _open_high(ctx)
    parts.append(f"{_plural(len(open_high), 'high finding')} unresolved." if open_high else "No high finding is unresolved.")
    if ctx.links:
        others = {l["b"] if l["a"] == ctx.bidder_id else l["a"] for l in ctx.links}
        parts.append(f"Linked to {_join([ctx.names.get(o, 'another bidder') for o in others])}.")
    rec = c.get("ai_recommendation")
    if rec in REC:
        parts.append(f"Recommendation: {REC[rec]}.")
    blockers, _ = decision_blockers(ctx)
    parts.append(blockers)
    return " ".join(parts), [_cite_finding(ctx, f) for f in open_high] + [_cite_check(e.requirement_type, _eval_label(e)) for e in failed]


HANDLERS = {
    "BIDDER_SUMMARY": bidder_summary, "FLAG_REASON": flag_reason, "FAILED_CHECKS": failed_checks, "PENDING_CHECKS": pending_checks,
    "HIGH_FINDINGS": high_findings, "LINKED_BIDDERS": linked_bidders, "DECISION_BLOCKERS": decision_blockers,
    "COMPLIANCE_SCORE": compliance_score, "RISK_REASON": risk_reason, "AUDIT_SUMMARY": audit_summary,
    "DOCUMENT_FINDINGS": document_findings, "DEBARMENT_STATUS": debarment_status,
}


def answer(db: Session, bidder_id: str, tender_id: str, question: str) -> dict[str, Any]:
    intent = classify(question)
    if intent is None:
        return {"intent": "UNKNOWN", "answer": UNKNOWN, "citations": [], "evidence": [], "suggestions": SUGGESTIONS, "provider": PROVIDER}
    ctx = build_context(db, bidder_id, tender_id)
    text, cites = finding_evidence(ctx, question) if intent == "FINDING_EVIDENCE" else HANDLERS[intent](ctx)
    cites = _dedupe(cites)
    return {
        "intent": intent, "answer": text, "citations": cites,
        "evidence": [c["id"] for c in cites if c["type"] == "finding"],
        "suggestions": [], "provider": PROVIDER,
    }
