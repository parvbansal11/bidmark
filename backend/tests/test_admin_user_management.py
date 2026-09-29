"""
Admin-only user management (app/api/v1/users.py) — the only channel through
which Procurement Officer / Admin accounts get created, and the mechanism
behind an Admin deactivating an Officer/Bidder account directly (as opposed
to the bidder-specific flag/suspend/ban actions in bidders.py).
"""


def test_non_admin_cannot_list_or_create_users(client, officer_headers, bidder_user_headers):
    for headers in (officer_headers, bidder_user_headers):
        assert client.get("/api/v1/users", headers=headers).status_code == 403
        r = client.post(
            "/api/v1/users",
            json={"email": "x@test.gov.in", "password": "Password123", "full_name": "X", "role": "PROCUREMENT_OFFICER"},
            headers=headers,
        )
        assert r.status_code == 403


def test_admin_can_list_and_create_users_of_any_role(client, admin_headers):
    r = client.post(
        "/api/v1/users",
        json={"email": "new-admin@test.gov.in", "password": "Password123", "full_name": "New Admin", "role": "ADMIN"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["role"] == "ADMIN"

    r2 = client.post(
        "/api/v1/users",
        json={"email": "new-bidder-by-admin@test.com", "password": "Password123", "full_name": "New Bidder", "role": "BIDDER", "company_name": "Admin-Provisioned Co"},
        headers=admin_headers,
    )
    assert r2.status_code == 200, r2.text

    listing = client.get("/api/v1/users", headers=admin_headers)
    assert listing.status_code == 200
    emails = {u["email"] for u in listing.json()["data"]}
    assert {"new-admin@test.gov.in", "new-bidder-by-admin@test.com"} <= emails


def test_admin_can_deactivate_another_user_and_it_blocks_them(client, admin_headers):
    create = client.post(
        "/api/v1/users",
        json={"email": "officer-to-deactivate@test.gov.in", "password": "Password123", "full_name": "Officer X", "role": "PROCUREMENT_OFFICER"},
        headers=admin_headers,
    )
    user_id = create.json()["data"]["id"]

    login = client.post("/api/v1/auth/login", json={"email": "officer-to-deactivate@test.gov.in", "password": "Password123"})
    officer_token = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}

    patch = client.patch(f"/api/v1/users/{user_id}", json={"is_active": False}, headers=admin_headers)
    assert patch.status_code == 200
    assert patch.json()["data"]["is_active"] is False

    blocked = client.get("/api/v1/auth/me", headers=officer_token)
    assert blocked.status_code == 401

    relogin = client.post("/api/v1/auth/login", json={"email": "officer-to-deactivate@test.gov.in", "password": "Password123"})
    assert relogin.status_code == 403


def test_admin_cannot_deactivate_own_account(client, admin_headers):
    me = client.get("/api/v1/auth/me", headers=admin_headers)
    my_id = me.json()["data"]["id"]
    r = client.patch(f"/api/v1/users/{my_id}", json={"is_active": False}, headers=admin_headers)
    assert r.status_code == 400
