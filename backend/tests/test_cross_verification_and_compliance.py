from tests.conftest import TestingSessionLocal, upload_doc


def test_cross_check_detects_major_name_mismatch(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    """Forces a document extraction to carry a wildly different company name
    than the bidder's profile, then confirms the cross-check engine flags a
    MAJOR_MISMATCH discrepancy — deterministic because we set the extracted
    value directly rather than relying on the mock provider's random variant."""
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    doc = upload_doc(client, officer_headers, sample_bidder["id"], "GST", sample_tender["id"])
    client.post(f"/api/v1/documents/{doc['id']}/extract", headers=officer_headers)

    from app.models.document import DocumentExtraction

    db = TestingSessionLocal()
    try:
        extraction = db.query(DocumentExtraction).filter(DocumentExtraction.document_id == doc["id"]).first()
        extraction.company_name = "Completely Different Enterprises Unrelated LLC"
        db.commit()
    finally:
        db.close()

    r = client.post(f"/api/v1/verification/cross-check/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    name_checks = [c for c in data["cross_checks"] if c["field"] == "company_name"]
    assert name_checks and name_checks[0]["status"] == "MAJOR_MISMATCH"
    assert any(d["category"] == "NAME_MISMATCH" and d["severity"] == "HIGH" for d in data["discrepancies"])


def test_cross_check_result_is_retrievable_after_run(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    client.post(f"/api/v1/verification/cross-check/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    r = client.get(f"/api/v1/verification/cross-check/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r.status_code == 200


def test_compliance_evaluate_with_no_documents_yields_zero_score_high_risk(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    r = client.post(f"/api/v1/compliance/evaluate/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["overall_score"] == 0.0
    assert data["risk_level"] == "HIGH"
    assert data["verified_count"] == 0
    assert data["pending_count"] >= 3  # GST, PAN, UDYAM all mandatory and undocumented


def test_compliance_score_is_deterministic_across_runs(client, officer_headers, bidder_with_documents):
    bidder = bidder_with_documents["bidder"]
    tender = bidder_with_documents["tender"]
    for cat, doc in bidder_with_documents["documents"].items():
        client.post(f"/api/v1/documents/{doc['id']}/verify", headers=officer_headers)

    r1 = client.post(f"/api/v1/compliance/evaluate/{bidder['id']}/{tender['id']}", headers=officer_headers)
    r2 = client.post(f"/api/v1/compliance/evaluate/{bidder['id']}/{tender['id']}", headers=officer_headers)
    assert r1.status_code == 200 and r2.status_code == 200
    d1, d2 = r1.json()["data"], r2.json()["data"]
    assert d1["overall_score"] == d2["overall_score"]
    assert 0.0 <= d1["overall_score"] <= 100.0
    assert d1["risk_level"] in ("LOW", "MEDIUM", "HIGH")

    r = client.get(f"/api/v1/compliance/report/{bidder['id']}/{tender['id']}", headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["overall_score"] == d1["overall_score"]


def test_ai_recommendation_requires_prior_evaluation(client, officer_headers, sample_bidder, sample_tender):
    r = client.post(f"/api/v1/compliance/recommendation/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r.status_code == 404


def test_ai_recommendation_uses_only_allowed_values_and_carries_disclaimer(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    client.post(f"/api/v1/compliance/evaluate/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    r = client.post(f"/api/v1/compliance/recommendation/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["recommendation"] in ("COMPLIANT", "REQUIRES_REVIEW", "NON_COMPLIANT")
    assert "decision-support only" in data["disclaimer"].lower()
    forbidden_terms = ("fraud", "guilty", "auto_qualified", "auto_disqualified")
    haystack = " ".join(data["reasons"] + data["critical_issues"] + data["recommended_actions"]).lower()
    assert not any(term in haystack for term in forbidden_terms)


def test_compliance_report_pdf_is_downloadable_by_bidder_and_officer(client, officer_headers, bidder_with_documents):
    bidder = bidder_with_documents["bidder"]
    tender = bidder_with_documents["tender"]
    for doc in bidder_with_documents["documents"].values():
        client.post(f"/api/v1/documents/{doc['id']}/verify", headers=officer_headers)
    client.post(f"/api/v1/compliance/evaluate/{bidder['id']}/{tender['id']}", headers=officer_headers)

    r = client.get(f"/api/v1/compliance/report/{bidder['id']}/{tender['id']}/pdf", headers=officer_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
