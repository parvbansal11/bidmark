import io


def _upload_bytes(client, headers, bidder_id, category, content, filename="cert.pdf"):
    files = {"file": (filename, io.BytesIO(content), "application/pdf")}
    r = client.post(f"/api/v1/bidders/{bidder_id}/documents", data={"category": category}, files=files, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def _make_second_bidder(client, headers):
    r = client.post(
        "/api/v1/bidders",
        json={
            "company_name": "Second Bidder Pvt Ltd", "legal_name": "Second Bidder Pvt Ltd",
            "pan_number": "SECBB5678D", "gstin": "07SECBB5678D1Z9", "cin": "U31900DL2016PTC280100",
            "registered_address": "Other Industrial Area, Delhi",
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_forensic_analysis_flags_cross_bidder_identical_file_reuse(client, officer_headers, admin_headers, sample_bidder):
    second_bidder = _make_second_bidder(client, admin_headers)
    identical_bytes = b"%PDF-1.4 identical certificate bytes used by two different bidders\n"

    doc_a = _upload_bytes(client, officer_headers, sample_bidder["id"], "OEM_AUTHORIZATION", identical_bytes)
    doc_b = _upload_bytes(client, officer_headers, second_bidder["id"], "OEM_AUTHORIZATION", identical_bytes)

    ra = client.post(f"/api/v1/forensics/analyze/{doc_a['id']}", headers=officer_headers)
    rb = client.post(f"/api/v1/forensics/analyze/{doc_b['id']}", headers=officer_headers)
    assert ra.status_code == 200 and rb.status_code == 200

    data_a = ra.json()["data"]
    assert any(s["type"] == "IDENTICAL_FILE_REUSE_CROSS_BIDDER" for s in data_a["signals"])
    assert data_a["forensic_risk_score"] >= 35
    assert data_a["requires_human_review"] is True
    # Never uses accusatory language
    assert not any("fake" in e.lower() or "fraud" in e.lower() for e in data_a["evidence"])


def test_forensic_analysis_small_file_flag(client, officer_headers, sample_bidder):
    doc = _upload_bytes(client, officer_headers, sample_bidder["id"], "PAN", b"tiny", filename="tiny.pdf")
    r = client.post(f"/api/v1/forensics/analyze/{doc['id']}", headers=officer_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert any(s["type"] == "SUSPICIOUSLY_SMALL_FILE" for s in data["signals"])


def test_fingerprint_self_comparison_is_maximally_similar(client, officer_headers, sample_bidder):
    doc = _upload_bytes(client, officer_headers, sample_bidder["id"], "GST", b"%PDF-1.4 some gst certificate content\n")
    client.post(f"/api/v1/documents/{doc['id']}/extract", headers=officer_headers)
    fp = client.post(f"/api/v1/forensics/fingerprint/{doc['id']}", headers=officer_headers)
    assert fp.status_code == 200
    assert fp.json()["data"]["document_type"] == "GST"

    cmp = client.post("/api/v1/forensics/compare", json={"document_id_a": doc["id"], "document_id_b": doc["id"]}, headers=officer_headers)
    assert cmp.status_code == 200
    data = cmp.json()["data"]
    assert data["similarity_score"] == 1.0
    assert data["level"] == "HIGH"


def test_document_forensics_aggregate_endpoint(client, officer_headers, sample_bidder):
    doc = _upload_bytes(client, officer_headers, sample_bidder["id"], "PAN", b"%PDF-1.4 pan certificate\n")
    client.post(f"/api/v1/forensics/analyze/{doc['id']}", headers=officer_headers)
    client.post(f"/api/v1/forensics/fingerprint/{doc['id']}", headers=officer_headers)
    r = client.get(f"/api/v1/forensics/document/{doc['id']}", headers=officer_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "forensic_analysis" in data
    assert "fingerprint" in data
