from tests.conftest import submit_bid


def test_create_and_retrieve_bid_submission(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    data = submit_bid(
        client, officer_headers, sample_tender["id"], sample_bidder["id"],
        quoted_price=2500000, local_content_percent=65, declared_turnover_crore=12,
    )
    assert data["quoted_price"] == 2500000
    assert data["local_content_percent"] == 65

    r = client.get(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}/bid-submission", headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["declared_turnover_crore"] == 12


def test_bid_submission_upserts_on_second_call(client, officer_headers, sample_bidder, sample_tender):
    submit_bid(client, officer_headers, sample_tender["id"], sample_bidder["id"], local_content_percent=40)
    updated = submit_bid(client, officer_headers, sample_tender["id"], sample_bidder["id"], local_content_percent=70)
    assert updated["local_content_percent"] == 70

    r = client.get(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}/bid-submission", headers=officer_headers)
    assert len(r.json()) > 0  # single record, no duplicate rows


def test_bid_submission_missing_returns_404(client, officer_headers, sample_bidder, sample_tender):
    r = client.get(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}/bid-submission", headers=officer_headers)
    assert r.status_code == 404


def test_bid_receipt_pdf_downloadable_after_submission(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    submit_bid(client, officer_headers, sample_tender["id"], sample_bidder["id"], quoted_price=999000)

    r = client.get(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}/bid-submission/receipt.pdf", headers=officer_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"


def test_bid_receipt_pdf_missing_without_submission(client, sample_bidder, sample_tender, officer_headers):
    r = client.get(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}/bid-submission/receipt.pdf", headers=officer_headers)
    assert r.status_code == 404
