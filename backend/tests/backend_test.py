"""Quotify Backend API Test Suite"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quotify-pro.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


def _register(email=None, name="Test User", password="TestPass123"):
    email = email or f"test_{uuid.uuid4().hex[:8]}@quotify.app"
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": email, "password": password})
    return r, email, password


@pytest.fixture(scope="module")
def user_a():
    r, email, pwd = _register()
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "email": email, "id": data["user"]["id"], "headers": {"Authorization": f"Bearer {data['token']}"}}


@pytest.fixture(scope="module")
def user_b():
    r, email, pwd = _register()
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "email": email, "id": data["user"]["id"], "headers": {"Authorization": f"Bearer {data['token']}"}}


# ---------- AUTH ----------
class TestAuth:
    def test_register_login_me_logout(self):
        r, email, pwd = _register()
        assert r.status_code == 200
        body = r.json()
        assert "token" in body and "user" in body and body["user"]["email"] == email
        assert body["user"]["plan"] == "free"

        # duplicate
        r2 = requests.post(f"{API}/auth/register", json={"name": "X", "email": email, "password": pwd})
        assert r2.status_code == 400

        # login
        r3 = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
        assert r3.status_code == 200
        token = r3.json()["token"]

        # me with bearer
        r4 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r4.status_code == 200
        assert r4.json()["email"] == email

        # bad login
        r5 = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
        assert r5.status_code == 401

        # me without token
        assert requests.get(f"{API}/auth/me").status_code == 401

        # logout
        assert requests.post(f"{API}/auth/logout").status_code == 200


# ---------- CLIENTS ----------
class TestClients:
    def test_clients_crud(self, user_a):
        h = user_a["headers"]
        c = {"name": "TEST_Client", "email": "client@test.com", "phone": "1234", "address": "Addr", "company": "Co"}
        r = requests.post(f"{API}/clients", json=c, headers=h)
        assert r.status_code == 200
        cid = r.json()["id"]
        assert r.json()["name"] == "TEST_Client"

        r = requests.get(f"{API}/clients", headers=h)
        assert r.status_code == 200 and any(x["id"] == cid for x in r.json())

        c["name"] = "TEST_Updated"
        r = requests.put(f"{API}/clients/{cid}", json=c, headers=h)
        assert r.status_code == 200 and r.json()["name"] == "TEST_Updated"

        r = requests.delete(f"{API}/clients/{cid}", headers=h)
        assert r.status_code == 200

        r = requests.delete(f"{API}/clients/{cid}", headers=h)
        assert r.status_code == 404


# ---------- QUOTES ----------
class TestQuotes:
    def test_create_quote_vat_calc_and_number(self, user_a):
        h = user_a["headers"]
        payload = {
            "client_name": "Acme Co", "client_email": "acme@test.com",
            "project_description": "Renovation",
            "line_items": [{"description": "Labor", "quantity": 10, "unit_price": 50},
                           {"description": "Material", "quantity": 2, "unit_price": 100}],
            "notes": "Thanks"
        }
        r = requests.post(f"{API}/quotes", json=payload, headers=h)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["subtotal"] == 700.0
        assert q["vat"] == round(700 * 0.21, 2) == 147.0
        assert q["total"] == 847.0
        assert q["status"] == "draft"
        assert q["vat_rate"] == 0.21
        import re
        assert re.match(r"^\d{4}-\d{4}$", q["quote_number"])
        user_a["quote_id"] = q["id"]
        user_a["quote_number"] = q["quote_number"]

    def test_get_and_update_quote(self, user_a):
        h = user_a["headers"]
        qid = user_a["quote_id"]
        r = requests.get(f"{API}/quotes/{qid}", headers=h)
        assert r.status_code == 200

        r = requests.put(f"{API}/quotes/{qid}", json={
            "line_items": [{"description": "New", "quantity": 1, "unit_price": 1000}],
            "status": "accepted"
        }, headers=h)
        assert r.status_code == 200
        u = r.json()
        assert u["subtotal"] == 1000.0 and u["vat"] == 210.0 and u["total"] == 1210.0
        assert u["status"] == "accepted"

    def test_stats(self, user_a):
        r = requests.get(f"{API}/quotes/stats", headers=user_a["headers"])
        assert r.status_code == 200
        s = r.json()
        assert "total" in s and "by_status" in s and "accepted_value" in s
        assert s["plan"] == "free" and s["limit"] == 3
        assert s["accepted_value"] >= 1210.0

    def test_pdf_download(self, user_a):
        r = requests.get(f"{API}/quotes/{user_a['quote_id']}/pdf", headers=user_a["headers"])
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_send_quote_mocked(self, user_a):
        r = requests.post(f"{API}/quotes/{user_a['quote_id']}/send",
                          json={"subject": "Test", "message": "Hi"}, headers=user_a["headers"])
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True and body["mocked"] is True

    def test_free_plan_limit(self, user_a):
        h = user_a["headers"]
        # Already 1 quote exists. Create until limit hit.
        payload = {"client_name": "C", "client_email": "c@t.com",
                   "line_items": [{"description": "x", "quantity": 1, "unit_price": 10}]}
        # Create until 3 total
        stats = requests.get(f"{API}/quotes/stats", headers=h).json()
        existing = stats["total"]
        for _ in range(max(0, 3 - existing)):
            assert requests.post(f"{API}/quotes", json=payload, headers=h).status_code == 200
        r = requests.post(f"{API}/quotes", json=payload, headers=h)
        assert r.status_code == 402
        assert "Upgrade" in r.json().get("detail", "") or "limited" in r.json().get("detail", "").lower()


# ---------- ISOLATION ----------
class TestIsolation:
    def test_user_b_cannot_see_a_quotes(self, user_a, user_b):
        qid = user_a["quote_id"]
        r = requests.get(f"{API}/quotes/{qid}", headers=user_b["headers"])
        assert r.status_code == 404
        r = requests.put(f"{API}/quotes/{qid}", json={"status": "declined"}, headers=user_b["headers"])
        assert r.status_code == 404
        r = requests.delete(f"{API}/quotes/{qid}", headers=user_b["headers"])
        assert r.status_code == 404
        list_b = requests.get(f"{API}/quotes", headers=user_b["headers"]).json()
        assert all(q["id"] != qid for q in list_b)


# ---------- SETTINGS ----------
class TestSettings:
    def test_update_settings(self, user_b):
        r = requests.put(f"{API}/settings", json={
            "company_name": "TEST Co", "vat_number": "VAT123",
            "bank_account": "IBAN", "address": "Street 1", "phone": "555"
        }, headers=user_b["headers"])
        assert r.status_code == 200
        u = r.json()
        assert u["company_name"] == "TEST Co" and u["vat_number"] == "VAT123"


# ---------- BILLING ----------
class TestBilling:
    def test_checkout_session(self, user_b):
        r = requests.post(f"{API}/billing/checkout",
                          json={"origin_url": BASE_URL}, headers=user_b["headers"])
        if r.status_code != 200:
            pytest.skip(f"Stripe checkout unavailable: {r.status_code} {r.text[:200]}")
        body = r.json()
        assert "url" in body and "session_id" in body
        assert body["url"].startswith("http")
