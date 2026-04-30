from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title="POS API")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]


def now_utc():
    return datetime.now(timezone.utc).isoformat()


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return user


# ---------- Models ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "cajero"] = "cajero"
    company_id: Optional[str] = None
    store_id: Optional[str] = None


class CompanyIn(BaseModel):
    name: str
    rfc: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""


class StoreIn(BaseModel):
    company_id: str
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""


class ProductIn(BaseModel):
    company_id: str
    store_id: str
    name: str
    sku: Optional[str] = ""
    barcode: Optional[str] = ""
    photo: Optional[str] = ""  # base64 or URL
    price: float
    cost: float = 0.0
    stock: float = 0.0
    unit_type: Literal["pieza", "kg", "litro"] = "pieza"
    wholesale_enabled: bool = False
    wholesale_qty: float = 0.0
    wholesale_price: float = 0.0
    category: Optional[str] = "General"


class SaleItemIn(BaseModel):
    product_id: str
    name: str
    unit_type: str
    quantity: float
    unit_price: float
    is_wholesale: bool = False
    subtotal: float


class SaleIn(BaseModel):
    company_id: str
    store_id: str
    items: List[SaleItemIn]
    total: float
    payment_method: Literal["efectivo", "tarjeta"]
    cash_received: Optional[float] = None
    change: Optional[float] = None
    card_terminal_ref: Optional[str] = None
    client_id: Optional[str] = None  # local uuid for dedup
    created_at_local: Optional[str] = None


class ExpenseIn(BaseModel):
    company_id: str
    store_id: str
    concept: str
    amount: float
    notes: Optional[str] = ""
    client_id: Optional[str] = None
    created_at_local: Optional[str] = None


class SyncIn(BaseModel):
    sales: List[SaleIn] = []
    expenses: List[ExpenseIn] = []


# ---------- Auth Endpoints ----------
@api_router.post("/auth/login")
async def login(payload: LoginIn):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_access_token(user["id"], user["email"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "company_id": user.get("company_id"),
            "store_id": user.get("store_id"),
        },
    }


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------- Companies ----------
@api_router.get("/companies")
async def list_companies(user: dict = Depends(get_current_user)):
    items = await db.companies.find({}, {"_id": 0}).to_list(1000)
    return items


@api_router.post("/companies")
async def create_company(payload: CompanyIn, user: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_utc()
    await db.companies.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/companies/{cid}")
async def update_company(cid: str, payload: CompanyIn, user: dict = Depends(require_admin)):
    await db.companies.update_one({"id": cid}, {"$set": payload.model_dump()})
    doc = await db.companies.find_one({"id": cid}, {"_id": 0})
    return doc


@api_router.delete("/companies/{cid}")
async def delete_company(cid: str, user: dict = Depends(require_admin)):
    await db.companies.delete_one({"id": cid})
    return {"ok": True}


# ---------- Stores ----------
@api_router.get("/stores")
async def list_stores(company_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"company_id": company_id} if company_id else {}
    return await db.stores.find(q, {"_id": 0}).to_list(1000)


@api_router.post("/stores")
async def create_store(payload: StoreIn, user: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_utc()
    await db.stores.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/stores/{sid}")
async def update_store(sid: str, payload: StoreIn, user: dict = Depends(require_admin)):
    await db.stores.update_one({"id": sid}, {"$set": payload.model_dump()})
    return await db.stores.find_one({"id": sid}, {"_id": 0})


@api_router.delete("/stores/{sid}")
async def delete_store(sid: str, user: dict = Depends(require_admin)):
    await db.stores.delete_one({"id": sid})
    return {"ok": True}


# ---------- Products ----------
@api_router.get("/products")
async def list_products(store_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"store_id": store_id} if store_id else {}
    return await db.products.find(q, {"_id": 0}).to_list(2000)


@api_router.get("/products/by-barcode/{barcode}")
async def product_by_barcode(barcode: str, user: dict = Depends(get_current_user)):
    p = await db.products.find_one({"barcode": barcode}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return p


@api_router.post("/products")
async def create_product(payload: ProductIn, user: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_utc()
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/products/{pid}")
async def update_product(pid: str, payload: ProductIn, user: dict = Depends(require_admin)):
    await db.products.update_one({"id": pid}, {"$set": payload.model_dump()})
    return await db.products.find_one({"id": pid}, {"_id": 0})


@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_admin)):
    await db.products.delete_one({"id": pid})
    return {"ok": True}


# ---------- Users ----------
@api_router.get("/users")
async def list_users(user: dict = Depends(require_admin)):
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return items


@api_router.post("/users")
async def create_user(payload: RegisterIn, user: dict = Depends(require_admin)):
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name,
        "role": payload.role,
        "company_id": payload.company_id,
        "store_id": payload.store_id,
        "password_hash": hash_password(payload.password),
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}


@api_router.put("/users/{uid}")
async def update_user(uid: str, payload: RegisterIn, user: dict = Depends(require_admin)):
    update = {
        "email": payload.email.lower(),
        "name": payload.name,
        "role": payload.role,
        "company_id": payload.company_id,
        "store_id": payload.store_id,
    }
    if payload.password:
        update["password_hash"] = hash_password(payload.password)
    await db.users.update_one({"id": uid}, {"$set": update})
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return u


@api_router.delete("/users/{uid}")
async def delete_user(uid: str, user: dict = Depends(require_admin)):
    await db.users.delete_one({"id": uid})
    return {"ok": True}


# ---------- Sales ----------
async def insert_sale(payload: SaleIn, user_id: str):
    if payload.client_id:
        existing = await db.sales.find_one({"client_id": payload.client_id})
        if existing:
            return {"id": existing["id"], "deduped": True}
    sale_id = str(uuid.uuid4())
    doc = payload.model_dump()
    doc["id"] = sale_id
    doc["user_id"] = user_id
    doc["created_at"] = doc.get("created_at_local") or now_utc()
    await db.sales.insert_one(doc)
    # decrement stock
    for it in payload.items:
        await db.products.update_one(
            {"id": it.product_id},
            {"$inc": {"stock": -float(it.quantity)}},
        )
    return {"id": sale_id}


@api_router.post("/sales")
async def create_sale(payload: SaleIn, user: dict = Depends(get_current_user)):
    return await insert_sale(payload, user["id"])


@api_router.get("/sales")
async def list_sales(
    store_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if store_id:
        q["store_id"] = store_id
    if start or end:
        q["created_at"] = {}
        if start:
            q["created_at"]["$gte"] = start
        if end:
            q["created_at"]["$lte"] = end
    items = await db.sales.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items


# ---------- Expenses ----------
async def insert_expense(payload: ExpenseIn, user_id: str):
    if payload.client_id:
        existing = await db.expenses.find_one({"client_id": payload.client_id})
        if existing:
            return {"id": existing["id"], "deduped": True}
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user_id
    doc["created_at"] = doc.get("created_at_local") or now_utc()
    await db.expenses.insert_one(doc)
    return {"id": doc["id"]}


@api_router.post("/expenses")
async def create_expense(payload: ExpenseIn, user: dict = Depends(get_current_user)):
    return await insert_expense(payload, user["id"])


@api_router.get("/expenses")
async def list_expenses(
    store_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if store_id:
        q["store_id"] = store_id
    if start or end:
        q["created_at"] = {}
        if start:
            q["created_at"]["$gte"] = start
        if end:
            q["created_at"]["$lte"] = end
    return await db.expenses.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


# ---------- Reports ----------
@api_router.get("/reports/summary")
async def report_summary(
    store_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if store_id:
        q["store_id"] = store_id
    if start or end:
        q["created_at"] = {}
        if start:
            q["created_at"]["$gte"] = start
        if end:
            q["created_at"]["$lte"] = end

    sales = await db.sales.find(q, {"_id": 0}).to_list(5000)
    expenses = await db.expenses.find(q, {"_id": 0}).to_list(5000)

    total_sales = sum(s.get("total", 0) for s in sales)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    cash_total = sum(s.get("total", 0) for s in sales if s.get("payment_method") == "efectivo")
    card_total = sum(s.get("total", 0) for s in sales if s.get("payment_method") == "tarjeta")

    # top products
    counts = {}
    for s in sales:
        for it in s.get("items", []):
            pid = it.get("product_id")
            counts[pid] = counts.get(pid, {"name": it.get("name"), "qty": 0, "total": 0})
            counts[pid]["qty"] += float(it.get("quantity", 0))
            counts[pid]["total"] += float(it.get("subtotal", 0))
    top = sorted(counts.values(), key=lambda x: x["total"], reverse=True)[:5]

    products = await db.products.find({"store_id": store_id} if store_id else {}, {"_id": 0}).to_list(2000)
    inventory_value = sum(float(p.get("stock", 0)) * float(p.get("cost", 0)) for p in products)
    low_stock = [p for p in products if float(p.get("stock", 0)) <= 5]

    return {
        "sales_count": len(sales),
        "sales_total": total_sales,
        "cash_total": cash_total,
        "card_total": card_total,
        "expenses_count": len(expenses),
        "expenses_total": total_expenses,
        "net": total_sales - total_expenses,
        "top_products": top,
        "inventory_value": inventory_value,
        "low_stock_count": len(low_stock),
        "low_stock": low_stock[:10],
    }


# ---------- Sync ----------
@api_router.post("/sync")
async def sync(payload: SyncIn, user: dict = Depends(get_current_user)):
    sale_results = []
    for s in payload.sales:
        sale_results.append(await insert_sale(s, user["id"]))
    exp_results = []
    for e in payload.expenses:
        exp_results.append(await insert_expense(e, user["id"]))
    return {"sales": sale_results, "expenses": exp_results}


@api_router.get("/")
async def root():
    return {"message": "POS API", "status": "ok"}


# ---------- Bootstrap ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("barcode")
    await db.sales.create_index("client_id")
    await db.expenses.create_index("client_id")
    await seed_data()


async def seed_data():
    if await db.companies.count_documents({}) > 0:
        return
    logger.info("Seeding demo data...")

    company_id = str(uuid.uuid4())
    store_id = str(uuid.uuid4())

    await db.companies.insert_one({
        "id": company_id,
        "name": "Mi Empresa S.A. de C.V.",
        "rfc": "MIE010101AAA",
        "address": "Av. Reforma 100, CDMX",
        "phone": "5555555555",
        "created_at": now_utc(),
    })
    await db.stores.insert_one({
        "id": store_id,
        "company_id": company_id,
        "name": "Sucursal Centro",
        "address": "Calle Madero 50, Centro",
        "phone": "5555551122",
        "created_at": now_utc(),
    })

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    cajero_email = os.environ["CAJERO_EMAIL"].lower()
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": admin_email,
        "name": "Administrador",
        "role": "admin",
        "company_id": company_id,
        "store_id": store_id,
        "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]),
        "created_at": now_utc(),
    })
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": cajero_email,
        "name": "Cajero Demo",
        "role": "cajero",
        "company_id": company_id,
        "store_id": store_id,
        "password_hash": hash_password(os.environ["CAJERO_PASSWORD"]),
        "created_at": now_utc(),
    })

    products = [
        {"name": "Coca Cola 600ml", "barcode": "7501055309627", "price": 18.0, "cost": 12.0, "stock": 50, "unit_type": "pieza", "category": "Bebidas",
         "photo": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=500&q=80"},
        {"name": "Pan Bimbo Grande", "barcode": "7501030414032", "price": 52.0, "cost": 38.0, "stock": 20, "unit_type": "pieza", "category": "Panadería",
         "photo": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80"},
        {"name": "Manzana Roja", "barcode": "2000000010013", "price": 35.0, "cost": 22.0, "stock": 30, "unit_type": "kg", "category": "Frutas",
         "photo": "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=500&q=80"},
        {"name": "Leche Lala 1L", "barcode": "7501020537111", "price": 28.0, "cost": 20.0, "stock": 40, "unit_type": "litro", "category": "Lácteos",
         "photo": "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=500&q=80"},
        {"name": "Sabritas Original", "barcode": "7501011109038", "price": 22.0, "cost": 14.0, "stock": 60, "unit_type": "pieza", "category": "Botanas",
         "wholesale_enabled": True, "wholesale_qty": 10, "wholesale_price": 180.0,
         "photo": "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=500&q=80"},
        {"name": "Jabón Zote", "barcode": "7501016000136", "price": 18.0, "cost": 12.0, "stock": 80, "unit_type": "pieza", "category": "Limpieza",
         "photo": "https://images.unsplash.com/photo-1607006483224-75af9a82800f?auto=format&fit=crop&w=500&q=80"},
    ]
    for p in products:
        await db.products.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "store_id": store_id,
            "sku": "",
            "wholesale_enabled": p.get("wholesale_enabled", False),
            "wholesale_qty": p.get("wholesale_qty", 0),
            "wholesale_price": p.get("wholesale_price", 0),
            "created_at": now_utc(),
            **p,
        })
    logger.info("Seed complete")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
