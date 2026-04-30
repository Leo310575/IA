"""POS API end-to-end tests"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://pos-retail-hub-4.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@pos.com", "password": "admin123"}
CAJERO = {"email": "cajero@pos.com", "password": "cajero123"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def cajero_token():
    r = requests.post(f"{API}/auth/login", json=CAJERO, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth ----------
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["role"] == "admin"

    def test_cajero_login(self):
        r = requests.post(f"{API}/auth/login", json=CAJERO, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "cajero"

    def test_invalid_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@x.com", "password": "bad"}, timeout=15)
        assert r.status_code == 401


# ---------- Catalog ----------
class TestCatalog:
    def test_products_list(self, admin_token):
        r = requests.get(f"{API}/products", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 6
        names = [p["name"] for p in items]
        assert any("Coca" in n for n in names)

    def test_companies(self, admin_token):
        r = requests.get(f"{API}/companies", headers=H(admin_token), timeout=15)
        assert r.status_code == 200 and len(r.json()) >= 1

    def test_stores(self, admin_token):
        r = requests.get(f"{API}/stores", headers=H(admin_token), timeout=15)
        assert r.status_code == 200 and len(r.json()) >= 1

    def test_users_admin_only(self, admin_token):
        r = requests.get(f"{API}/users", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        # Ensure password_hash never returned
        for u in r.json():
            assert "password_hash" not in u

    def test_users_cajero_forbidden(self, cajero_token):
        r = requests.get(f"{API}/users", headers=H(cajero_token), timeout=15)
        assert r.status_code == 403

    def test_barcode_lookup(self, admin_token):
        r = requests.get(f"{API}/products/by-barcode/7501055309627", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        assert "Coca" in r.json()["name"]

    def test_barcode_not_found(self, admin_token):
        r = requests.get(f"{API}/products/by-barcode/0000000000000", headers=H(admin_token), timeout=15)
        assert r.status_code == 404


# ---------- RBAC product creation ----------
class TestRBAC:
    def test_cajero_cannot_create_product(self, cajero_token, admin_token):
        comps = requests.get(f"{API}/companies", headers=H(admin_token), timeout=15).json()
        stores = requests.get(f"{API}/stores", headers=H(admin_token), timeout=15).json()
        payload = {
            "company_id": comps[0]["id"], "store_id": stores[0]["id"],
            "name": "TEST_blocked", "price": 10.0, "cost": 5.0, "stock": 1,
            "unit_type": "pieza"
        }
        r = requests.post(f"{API}/products", json=payload, headers=H(cajero_token), timeout=15)
        assert r.status_code == 403

    def test_cajero_cannot_create_company(self, cajero_token):
        r = requests.post(f"{API}/companies", json={"name": "TEST_x"}, headers=H(cajero_token), timeout=15)
        assert r.status_code == 403


# ---------- Sales / stock ----------
class TestSales:
    def test_create_sale_decrements_stock(self, admin_token):
        prods = requests.get(f"{API}/products", headers=H(admin_token), timeout=15).json()
        p = prods[0]
        before = float(p["stock"])
        sale = {
            "company_id": p["company_id"], "store_id": p["store_id"],
            "items": [{
                "product_id": p["id"], "name": p["name"], "unit_type": p["unit_type"],
                "quantity": 1, "unit_price": p["price"], "is_wholesale": False,
                "subtotal": p["price"]
            }],
            "total": p["price"], "payment_method": "efectivo",
            "cash_received": p["price"], "change": 0,
            "client_id": f"TEST_{uuid.uuid4()}"
        }
        r = requests.post(f"{API}/sales", json=sale, headers=H(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert "id" in r.json()
        after = requests.get(f"{API}/products", headers=H(admin_token), timeout=15).json()
        ap = next(x for x in after if x["id"] == p["id"])
        assert float(ap["stock"]) == before - 1

    def test_card_sale_with_terminal_ref(self, admin_token):
        prods = requests.get(f"{API}/products", headers=H(admin_token), timeout=15).json()
        p = prods[1]
        sale = {
            "company_id": p["company_id"], "store_id": p["store_id"],
            "items": [{"product_id": p["id"], "name": p["name"], "unit_type": p["unit_type"],
                       "quantity": 1, "unit_price": p["price"], "is_wholesale": False,
                       "subtotal": p["price"]}],
            "total": p["price"], "payment_method": "tarjeta",
            "card_terminal_ref": "FOLIO-TEST-1",
            "client_id": f"TEST_{uuid.uuid4()}"
        }
        r = requests.post(f"{API}/sales", json=sale, headers=H(admin_token), timeout=15)
        assert r.status_code == 200


# ---------- Expenses ----------
class TestExpenses:
    def test_create_expense(self, admin_token):
        comps = requests.get(f"{API}/companies", headers=H(admin_token), timeout=15).json()
        stores = requests.get(f"{API}/stores", headers=H(admin_token), timeout=15).json()
        exp = {
            "company_id": comps[0]["id"], "store_id": stores[0]["id"],
            "concept": "TEST_renta", "amount": 100.0,
            "client_id": f"TEST_{uuid.uuid4()}"
        }
        r = requests.post(f"{API}/expenses", json=exp, headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        rl = requests.get(f"{API}/expenses", headers=H(admin_token), timeout=15)
        assert any(e["concept"] == "TEST_renta" for e in rl.json())


# ---------- Reports ----------
class TestReports:
    def test_report_summary_keys(self, admin_token):
        r = requests.get(f"{API}/reports/summary", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["sales_total", "expenses_total", "top_products", "low_stock", "net", "cash_total", "card_total"]:
            assert k in d


# ---------- Sync dedup ----------
class TestSync:
    def test_sync_dedup(self, admin_token):
        prods = requests.get(f"{API}/products", headers=H(admin_token), timeout=15).json()
        p = prods[2]
        cid = f"TEST_{uuid.uuid4()}"
        sale = {
            "company_id": p["company_id"], "store_id": p["store_id"],
            "items": [{"product_id": p["id"], "name": p["name"], "unit_type": p["unit_type"],
                       "quantity": 1, "unit_price": p["price"], "is_wholesale": False,
                       "subtotal": p["price"]}],
            "total": p["price"], "payment_method": "efectivo",
            "client_id": cid
        }
        r1 = requests.post(f"{API}/sync", json={"sales": [sale], "expenses": []}, headers=H(admin_token), timeout=15)
        r2 = requests.post(f"{API}/sync", json={"sales": [sale], "expenses": []}, headers=H(admin_token), timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r2.json()["sales"][0].get("deduped") is True
