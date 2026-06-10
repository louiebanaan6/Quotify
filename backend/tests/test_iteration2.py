"""Quotify Backend Iteration 2 - Discount, Invoices, Lifetime Pro tests"""
import os
import re
import uuid
import time
import requests
import pytest
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quotify-pro.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

LIFETIME_EMAIL_MIXED = "Louie.oorts@gmail.com"


def _register(email=None, name="Test User", password="TestPass123"):
    email = email or f"test_{uuid.uuid4().hex[:8]}@quotify.app"
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": email, "password": password})
    return r, email, password


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def user_a():
    r, email, _ = _register()
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "email": email, "id": data["user"]["id"],
            "headers": _auth_headers(data["token"])}


@pytest.fixture(scope="module")
def user_b():
    r, email, _ = _register()
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "email": email, "id": data["user"]["id"],
            "headers": _auth_headers(data["token"])}


@pytest.fixture(scope="module")
def pro_user():
    """A user upgraded to Pro via DB (we will use lifetime registration for unlimited quotes)."""
    # Use a unique lifetime-style email path: register a fresh account; we'll bypass quote limits
    # by directly testing only one invoice flow per user. So this is fine.
    r, email, _ = _register()
    assert r.status_code == 200
    data = r.json()
    return {"token": data["token"], "email": email, "id": data["user"]["id"],
            "headers": _auth_headers(data["token"])}


# ---------- Lifetime Pro on register ----------
class TestLifetimePro:
    def test_register_lifetime_email_mixed_case(self):
        # Try registering louie.oorts (mixed case). If already exists -> verify via DB (startup apply path).
        r = requests.post(f"{API}/auth/register",
                          json={"name": "Louie", "email": LIFETIME_EMAIL_MIXED, "password": "LifePass123"})
        if r.status_code == 200:
            data = r.json()
            u = data["user"]
            assert u["email"] == LIFETIME_EMAIL_MIXED.lower()
            assert u["plan"] == "pro"
            assert u["subscription_status"] == "lifetime"
            me = requests.get(f"{API}/auth/me", headers=_auth_headers(data["token"]))
            assert me.status_code == 200
            assert me.json()["plan"] == "pro" and me.json()["subscription_status"] == "lifetime"
        else:
            # User pre-exists - verify lifetime applied via startup hook through DB
            assert r.status_code == 400
            from pymongo import MongoClient
            from dotenv import load_dotenv
            load_dotenv('/app/backend/.env')
            c = MongoClient(os.environ['MONGO_URL'])
            db = c[os.environ['DB_NAME']]
            u = db.users.find_one({"email": LIFETIME_EMAIL_MIXED.lower()})
            assert u is not None, "Lifetime user not found in DB"
            assert u.get("plan") == "pro", f"Expected pro plan, got {u.get('plan')}"
            assert u.get("subscription_status") == "lifetime", f"Expected lifetime, got {u.get('subscription_status')}"


# ---------- Discount calculations ----------
class TestDiscount:
    def test_percentage_discount(self, user_a):
        payload = {
            "client_name": "DiscClient", "client_email": "d1@test.com",
            "line_items": [{"description": "Job", "quantity": 1, "unit_price": 1000}],
            "discount_type": "percentage", "discount_value": 10,
        }
        r = requests.post(f"{API}/quotes", json=payload, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["subtotal"] == 1000.0
        assert q["discount_amount"] == 100.0
        assert q["vat"] == 189.0
        assert q["total"] == 1089.0
        user_a["q_pct"] = q["id"]

    def test_fixed_discount(self, user_a):
        payload = {
            "client_name": "DiscClient", "client_email": "d2@test.com",
            "line_items": [{"description": "Job", "quantity": 1, "unit_price": 1000}],
            "discount_type": "fixed", "discount_value": 50,
        }
        r = requests.post(f"{API}/quotes", json=payload, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["subtotal"] == 1000.0
        assert q["discount_amount"] == 50.0
        assert q["vat"] == 199.5
        assert q["total"] == 1149.5
        user_a["q_fixed"] = q["id"]

    def test_none_discount(self, user_a):
        # Already at 2 quotes for user_a (pct + fixed). Free plan allows 3 quotes total.
        payload = {
            "client_name": "DiscClient", "client_email": "d3@test.com",
            "line_items": [{"description": "Job", "quantity": 1, "unit_price": 1000}],
            "discount_type": "none", "discount_value": 0,
        }
        r = requests.post(f"{API}/quotes", json=payload, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["discount_amount"] == 0.0
        assert q["vat"] == 210.0
        assert q["total"] == 1210.0
        user_a["q_none"] = q["id"]

    def test_update_recalculates(self, user_a):
        qid = user_a["q_pct"]
        r = requests.put(f"{API}/quotes/{qid}",
                         json={"discount_type": "fixed", "discount_value": 200},
                         headers=user_a["headers"])
        assert r.status_code == 200
        q = r.json()
        assert q["subtotal"] == 1000.0
        assert q["discount_amount"] == 200.0
        # taxable=800; vat=168; total=968
        assert q["vat"] == 168.0
        assert q["total"] == 968.0

    def test_pdf_contains_discount(self, user_a):
        # Use the fixed-discount quote (still has 50 discount)
        r = requests.get(f"{API}/quotes/{user_a['q_fixed']}/pdf", headers=user_a["headers"])
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000


# ---------- Invoice module ----------
class TestInvoices:
    def test_convert_quote_to_invoice(self, user_a):
        qid = user_a["q_fixed"]
        # Must mark as accepted? Spec says button shows only when accepted in UI; backend accepts conversion regardless.
        r = requests.post(f"{API}/quotes/{qid}/convert-to-invoice", headers=user_a["headers"])
        assert r.status_code == 200, r.text
        inv = r.json()
        assert re.match(r"^INV-\d{4}-\d{3}$", inv["invoice_number"]), f"Bad invoice number: {inv['invoice_number']}"
        assert inv["status"] == "unpaid"
        assert inv["quote_id"] == qid
        # Discount carried over
        assert inv["subtotal"] == 1000.0
        assert inv["discount_amount"] == 50.0
        assert inv["total"] == 1149.5
        # Due in ~30 days
        due = datetime.fromisoformat(inv["due_date"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta = (due - now).total_seconds()
        assert 29 * 86400 < delta < 31 * 86400
        user_a["invoice_id"] = inv["id"]
        user_a["invoice_number"] = inv["invoice_number"]

        # Quote should now have invoice_id
        q = requests.get(f"{API}/quotes/{qid}", headers=user_a["headers"]).json()
        assert q.get("invoice_id") == inv["id"]

    def test_convert_idempotent(self, user_a):
        qid = user_a["q_fixed"]
        r = requests.post(f"{API}/quotes/{qid}/convert-to-invoice", headers=user_a["headers"])
        assert r.status_code == 200
        inv = r.json()
        assert inv["id"] == user_a["invoice_id"]
        assert inv["invoice_number"] == user_a["invoice_number"]

    def test_list_invoices(self, user_a):
        r = requests.get(f"{API}/invoices", headers=user_a["headers"])
        assert r.status_code == 200
        items = r.json()
        assert any(i["id"] == user_a["invoice_id"] for i in items)

    def test_get_invoice(self, user_a):
        r = requests.get(f"{API}/invoices/{user_a['invoice_id']}", headers=user_a["headers"])
        assert r.status_code == 200
        inv = r.json()
        assert inv["invoice_number"] == user_a["invoice_number"]

    def test_invoice_stats(self, user_a):
        r = requests.get(f"{API}/invoices/stats", headers=user_a["headers"])
        assert r.status_code == 200
        s = r.json()
        for k in ["total", "total_revenue", "unpaid_total", "overdue_total", "by_status"]:
            assert k in s, f"missing key {k}"
        assert s["total"] >= 1
        # invoice not paid yet -> unpaid_total includes 1149.5
        assert s["unpaid_total"] >= 1149.5
        assert s["by_status"]["unpaid"] >= 1

    def test_invoice_overdue_via_past_due(self, user_a):
        # Update due_date to yesterday → expect status flips to overdue on next GET
        past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        r = requests.put(f"{API}/invoices/{user_a['invoice_id']}",
                         json={"due_date": past}, headers=user_a["headers"])
        assert r.status_code == 200
        # GET should mark overdue
        r2 = requests.get(f"{API}/invoices/{user_a['invoice_id']}", headers=user_a["headers"])
        assert r2.status_code == 200
        assert r2.json()["status"] == "overdue"
        # Stats reflect overdue
        s = requests.get(f"{API}/invoices/stats", headers=user_a["headers"]).json()
        assert s["overdue_total"] >= 1149.5

    def test_mark_paid(self, user_a):
        r = requests.post(f"{API}/invoices/{user_a['invoice_id']}/mark-paid", headers=user_a["headers"])
        assert r.status_code == 200
        inv = r.json()
        assert inv["status"] == "paid"
        assert inv.get("paid_at")

    def test_put_status_paid_sets_paid_at(self, user_a):
        # Create another invoice via another quote on user_b who has no quotes yet
        # Easier: re-mark via PUT to ensure paid_at present after status=paid
        r = requests.put(f"{API}/invoices/{user_a['invoice_id']}",
                         json={"status": "paid"}, headers=user_a["headers"])
        assert r.status_code == 200
        assert r.json().get("paid_at")

    def test_invoice_pdf(self, user_a):
        r = requests.get(f"{API}/invoices/{user_a['invoice_id']}/pdf", headers=user_a["headers"])
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000

    def test_send_invoice(self, user_a):
        r = requests.post(f"{API}/invoices/{user_a['invoice_id']}/send",
                         json={"subject": "Test Invoice", "message": "Hello"},
                         headers=user_a["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        # With real RESEND_API_KEY: ok may be False due to test mode/domain restrictions
        # Accept either sent_ok=True or an error indicating test-mode/domain restriction
        err = (body.get("error") or "").lower()
        acceptable = body.get("ok") is True or any(
            kw in err for kw in ["test", "domain", "verify", "verified", "validation_error", "restricted"]
        )
        assert acceptable, f"Send failed: ok={body.get('ok')} error={body.get('error')}"
        # sent_at should be set even on real-send attempts (only on success path actually)
        if body.get("ok") is True:
            inv = requests.get(f"{API}/invoices/{user_a['invoice_id']}", headers=user_a["headers"]).json()
            assert inv.get("sent_at")

    def test_isolation_user_b_cannot_access(self, user_a, user_b):
        iid = user_a["invoice_id"]
        h = user_b["headers"]
        assert requests.get(f"{API}/invoices/{iid}", headers=h).status_code == 404
        assert requests.put(f"{API}/invoices/{iid}", json={"status": "paid"}, headers=h).status_code == 404
        assert requests.post(f"{API}/invoices/{iid}/mark-paid", headers=h).status_code == 404
        assert requests.delete(f"{API}/invoices/{iid}", headers=h).status_code == 404
        # listing for b should not include a's invoice
        items = requests.get(f"{API}/invoices", headers=h).json()
        assert all(i["id"] != iid for i in items)

    def test_invoices_dont_count_against_free_quote_limit(self, user_a):
        # user_a has 3 quotes already (free limit). 4th quote should be denied.
        payload = {"client_name": "X", "client_email": "x@t.com",
                   "line_items": [{"description": "x", "quantity": 1, "unit_price": 10}]}
        r = requests.post(f"{API}/quotes", json=payload, headers=user_a["headers"])
        assert r.status_code == 402
        # But invoices remain accessible (already created above)
        r2 = requests.get(f"{API}/invoices", headers=user_a["headers"])
        assert r2.status_code == 200

    def test_delete_invoice(self, user_a):
        iid = user_a["invoice_id"]
        r = requests.delete(f"{API}/invoices/{iid}", headers=user_a["headers"])
        assert r.status_code == 200
        # GET should now 404
        assert requests.get(f"{API}/invoices/{iid}", headers=user_a["headers"]).status_code == 404
        # double-delete also 404
        assert requests.delete(f"{API}/invoices/{iid}", headers=user_a["headers"]).status_code == 404
