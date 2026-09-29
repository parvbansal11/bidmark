from tests.conftest import upload_doc


def test_upload_document_rejects_bad_category(client, officer_headers, sample_bidder):
    import io

    files = {"file": ("x.txt", io.BytesIO(b"data"), "text/plain")}
    r = client.post(f"/api/v1/bidders/{sample_bidder['id']}/documents", data={"category": "NOT_A_CATEGORY"}, files=files, headers=officer_headers)
    assert r.status_code == 422


def test_upload_document_rejects_bad_extension(client, officer_headers, sample_bidder):
    import io

    files = {"file": ("x.exe", io.BytesIO(b"data"), "application/octet-stream")}
    r = client.post(f"/api/v1/bidders/{sample_bidder['id']}/documents", data={"category": "GST"}, files=files, headers=officer_headers)
    assert r.status_code == 422


def test_upload_and_list_documents(client, officer_headers, sample_bidder):
    doc = upload_doc(client, officer_headers, sample_bidder["id"], "GST")
    assert doc["category"] == "GST"
    assert doc["status"] == "UPLOADED"
    r = client.get(f"/api/v1/bidders/{sample_bidder['id']}/documents", headers=officer_headers)
    assert any(d["id"] == doc["id"] for d in r.json()["data"])


def test_document_file_can_be_downloaded_or_previewed(client, officer_headers, sample_bidder):
    doc = upload_doc(client, officer_headers, sample_bidder["id"], "GST", content=b"%PDF-1.4 fake gst cert")
    r = client.get(f"/api/v1/documents/{doc['id']}/file", headers=officer_headers)
    assert r.status_code == 200
    assert r.content == b"%PDF-1.4 fake gst cert"
    assert "inline" in r.headers["content-disposition"]


def test_ocr_extraction_populates_fields(client, officer_headers, sample_bidder):
    doc = upload_doc(client, officer_headers, sample_bidder["id"], "GST")
    r = client.post(f"/api/v1/documents/{doc['id']}/extract", headers=officer_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["gstin"] == sample_bidder["gstin"]
    assert data["extraction_provider"] in ("MockDocumentProvider", "LocalOCRProvider")


def test_gst_verification_via_mock_gateway(client, officer_headers, sample_bidder):
    doc = upload_doc(client, officer_headers, sample_bidder["id"], "GST")
    client.post(f"/api/v1/documents/{doc['id']}/extract", headers=officer_headers)
    r = client.post(f"/api/v1/documents/{doc['id']}/verify", headers=officer_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["is_mock"] is True
    assert data["government_source"] == "MOCK_GOVERNMENT_API"
    assert data["status"] in ("VERIFIED", "FAILED", "EXPIRED", "REQUIRES_REVIEW", "MISSING_INFORMATION")


def test_pan_verification_via_mock_gateway(client, officer_headers, sample_bidder):
    doc = upload_doc(client, officer_headers, sample_bidder["id"], "PAN")
    client.post(f"/api/v1/documents/{doc['id']}/extract", headers=officer_headers)
    r = client.post(f"/api/v1/documents/{doc['id']}/verify", headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["verification_type"] == "PAN"


def test_udyam_verification_via_mock_gateway(client, officer_headers, sample_bidder):
    doc = upload_doc(client, officer_headers, sample_bidder["id"], "UDYAM")
    client.post(f"/api/v1/documents/{doc['id']}/extract", headers=officer_headers)
    r = client.post(f"/api/v1/documents/{doc['id']}/verify", headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["verification_type"] == "UDYAM"


def test_direct_mock_government_gateway_endpoint(client, officer_headers):
    r = client.post("/api/v1/verify/gst", json={"identifier": "07TESTB1234C1Z5"}, headers=officer_headers)
    assert r.status_code == 200
    body = r.json()["data"]
    assert body["is_mock"] is True
    assert body["source"] == "MOCK_GOVERNMENT_API"


def test_all_13_registries_are_listed(client, officer_headers):
    r = client.get("/api/v1/verify/registries", headers=officer_headers)
    assert r.status_code == 200
    assert len(r.json()["data"]) == 13
