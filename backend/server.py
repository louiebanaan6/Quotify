from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import asyncio
import logging
import bcrypt
import jwt
import resend
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Header, Query
from fastapi.responses import StreamingResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- Config ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
APP_NAME = os.environ.get('APP_NAME', 'quotify')
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
resend.api_key = os.environ.get('RESEND_API_KEY', '')
FREE_QUOTE_LIMIT = 3
PRO_PRICE_EUR = 49.0
VAT_RATE = 0.21

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- Object storage helpers ----------
storage_key_cache = {"key": None}

def init_storage():
    if storage_key_cache["key"]:
        return storage_key_cache["key"]
    if not EMERGENT_KEY:
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key_cache["key"] = resp.json()["storage_key"]
        return storage_key_cache["key"]
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not initialized")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not initialized")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ---------- Auth helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 24 * 7, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------- Models ----------
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LineItem(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float = 0

class QuoteCreate(BaseModel):
    client_id: Optional[str] = None
    client_name: str
    client_email: EmailStr
    project_description: str = ""
    line_items: List[LineItem] = []
    notes: str = ""

class QuoteUpdate(BaseModel):
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    project_description: Optional[str] = None
    line_items: Optional[List[LineItem]] = None
    notes: Optional[str] = None
    status: Optional[Literal["draft", "sent", "accepted", "declined"]] = None

class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    address: Optional[str] = ""
    company: Optional[str] = ""

class SettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    vat_number: Optional[str] = None
    bank_account: Optional[str] = None
    email_signature: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None

class SendQuoteRequest(BaseModel):
    subject: Optional[str] = None
    message: Optional[str] = None

class CheckoutRequest(BaseModel):
    origin_url: str

# ---------- Quote calculations ----------
def calculate_totals(line_items: List[dict]):
    subtotal = sum((li.get("quantity", 0) or 0) * (li.get("unit_price", 0) or 0) for li in line_items)
    vat = round(subtotal * VAT_RATE, 2)
    total = round(subtotal + vat, 2)
    return round(subtotal, 2), vat, total

async def next_quote_number(user_id: str) -> str:
    year = datetime.now(timezone.utc).year
    count = await db.quotes.count_documents({"user_id": user_id, "quote_number": {"$regex": f"^{year}-"}})
    return f"{year}-{(count + 1):04d}"

# ---------- Auth Routes ----------
@api_router.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    email = req.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "name": req.name,
        "password_hash": hash_password(req.password),
        "plan": "free",
        "subscription_status": "inactive",
        "company_name": "",
        "vat_number": "",
        "bank_account": "",
        "email_signature": "",
        "address": "",
        "phone": "",
        "logo_path": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    user_doc.pop("password_hash")
    user_doc.pop("_id", None)
    return {"user": user_doc, "token": token}

@api_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "token": token}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------- Settings ----------
@api_router.put("/settings")
async def update_settings(data: SettingsUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return updated

@api_router.post("/settings/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "png").lower()
    path = f"{APP_NAME}/logos/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "image/png")
    await db.users.update_one({"id": user["id"]}, {"$set": {"logo_path": result["path"]}})
    return {"logo_path": result["path"]}

@api_router.get("/files/{path:path}")
async def serve_file(path: str, authorization: str = Header(None), auth: str = Query(None)):
    # Public-ish: anyone with the path can fetch (logos used in PDFs etc.)
    data, ct = get_object(path)
    return Response(content=data, media_type=ct)

# ---------- Clients ----------
@api_router.get("/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    items = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.post("/clients")
async def create_client(data: ClientCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **data.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientCreate, user: dict = Depends(get_current_user)):
    await db.clients.update_one({"id": client_id, "user_id": user["id"]}, {"$set": data.model_dump()})
    item = await db.clients.find_one({"id": client_id, "user_id": user["id"]}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Client not found")
    return item

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
    res = await db.clients.delete_one({"id": client_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"ok": True}

# ---------- Quotes ----------
@api_router.get("/quotes")
async def list_quotes(user: dict = Depends(get_current_user)):
    items = await db.quotes.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/quotes/stats")
async def quotes_stats(user: dict = Depends(get_current_user)):
    total = await db.quotes.count_documents({"user_id": user["id"]})
    by_status = {}
    for st in ["draft", "sent", "accepted", "declined"]:
        by_status[st] = await db.quotes.count_documents({"user_id": user["id"], "status": st})
    pipeline = [{"$match": {"user_id": user["id"], "status": "accepted"}},
                {"$group": {"_id": None, "sum": {"$sum": "$total"}}}]
    cur = db.quotes.aggregate(pipeline)
    accepted_value = 0
    async for row in cur:
        accepted_value = row.get("sum", 0)
    return {"total": total, "by_status": by_status, "accepted_value": round(accepted_value, 2),
            "plan": user.get("plan", "free"), "limit": FREE_QUOTE_LIMIT}

@api_router.post("/quotes")
async def create_quote(data: QuoteCreate, user: dict = Depends(get_current_user)):
    # Free plan limit
    if user.get("plan", "free") == "free":
        count = await db.quotes.count_documents({"user_id": user["id"]})
        if count >= FREE_QUOTE_LIMIT:
            raise HTTPException(status_code=402, detail=f"Free plan limited to {FREE_QUOTE_LIMIT} quotes. Upgrade to Pro for unlimited.")
    line_items = [li.model_dump() for li in data.line_items]
    subtotal, vat, total = calculate_totals(line_items)
    qnum = await next_quote_number(user["id"])
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "quote_number": qnum,
        "client_id": data.client_id,
        "client_name": data.client_name,
        "client_email": data.client_email,
        "project_description": data.project_description,
        "line_items": line_items,
        "notes": data.notes,
        "subtotal": subtotal,
        "vat_rate": VAT_RATE,
        "vat": vat,
        "total": total,
        "status": "draft",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.quotes.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/quotes/{quote_id}")
async def get_quote(quote_id: str, user: dict = Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id, "user_id": user["id"]}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return q

@api_router.put("/quotes/{quote_id}")
async def update_quote(quote_id: str, data: QuoteUpdate, user: dict = Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id, "user_id": user["id"]})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "line_items" in update:
        update["line_items"] = [li if isinstance(li, dict) else li.model_dump() for li in update["line_items"]]
        subtotal, vat, total = calculate_totals(update["line_items"])
        update["subtotal"] = subtotal
        update["vat"] = vat
        update["total"] = total
        update["vat_rate"] = VAT_RATE
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.quotes.update_one({"id": quote_id, "user_id": user["id"]}, {"$set": update})
    updated = await db.quotes.find_one({"id": quote_id, "user_id": user["id"]}, {"_id": 0})
    return updated

@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user: dict = Depends(get_current_user)):
    res = await db.quotes.delete_one({"id": quote_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"ok": True}

# ---------- PDF ----------
def build_pdf(quote: dict, owner: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm, title=f"Quote {quote['quote_number']}")
    styles = getSampleStyleSheet()
    BLUE = colors.HexColor("#0066FF")
    DARK = colors.HexColor("#0A0A0A")
    MUTED = colors.HexColor("#6B7280")
    BORDER = colors.HexColor("#E5E7EB")

    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold",
                        fontSize=22, textColor=DARK, spaceAfter=6)
    label = ParagraphStyle("label", parent=styles["Normal"], fontName="Helvetica",
                           fontSize=8, textColor=MUTED, spaceAfter=2)
    body = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=10, textColor=DARK, leading=14)
    small = ParagraphStyle("small", parent=styles["Normal"], fontName="Helvetica",
                           fontSize=9, textColor=MUTED, leading=12)

    story = []

    # Header: logo + company info on left; QUOTE block on right
    logo_flow = Paragraph(f"<b>{owner.get('company_name') or owner.get('name') or 'Quotify'}</b>", h1)
    try:
        if owner.get("logo_path"):
            img_bytes, _ = get_object(owner["logo_path"])
            logo_flow = Image(io.BytesIO(img_bytes), width=42 * mm, height=18 * mm, kind="proportional")
    except Exception as e:
        logger.warning(f"PDF logo error: {e}")

    company_info_lines = []
    if owner.get('company_name'):
        company_info_lines.append(f"<b>{owner['company_name']}</b>")
    if owner.get('address'):
        company_info_lines.append(owner['address'].replace('\n', '<br/>'))
    if owner.get('phone'):
        company_info_lines.append(owner['phone'])
    if owner.get('email'):
        company_info_lines.append(owner['email'])
    if owner.get('vat_number'):
        company_info_lines.append(f"VAT: {owner['vat_number']}")

    left_cell = [logo_flow, Spacer(1, 6), Paragraph("<br/>".join(company_info_lines), small)]
    right_cell = [
        Paragraph("QUOTE", h1),
        Paragraph(f"<b>#{quote['quote_number']}</b>", body),
        Paragraph(f"Date: {quote['created_at'][:10]}", small),
    ]

    header_tbl = Table([[left_cell, right_cell]], colWidths=[100 * mm, 70 * mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 14))

    # Bill To
    story.append(Paragraph("BILL TO", label))
    bill_to = f"<b>{quote['client_name']}</b><br/>{quote['client_email']}"
    story.append(Paragraph(bill_to, body))
    story.append(Spacer(1, 14))

    if quote.get("project_description"):
        story.append(Paragraph("PROJECT", label))
        story.append(Paragraph(quote["project_description"].replace("\n", "<br/>"), body))
        story.append(Spacer(1, 14))

    # Line items table
    head = ["Description", "Qty", "Unit Price", "Amount"]
    rows = [head]
    for li in quote["line_items"]:
        amt = (li.get("quantity", 0) or 0) * (li.get("unit_price", 0) or 0)
        rows.append([li.get("description", ""), f"{li.get('quantity', 0):g}",
                     f"€ {li.get('unit_price', 0):,.2f}", f"€ {amt:,.2f}"])
    tbl = Table(rows, colWidths=[90 * mm, 18 * mm, 28 * mm, 28 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
        ("TEXTCOLOR", (0, 1), (-1, -1), DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 12))

    # Totals
    totals = [
        ["Subtotal", f"€ {quote['subtotal']:,.2f}"],
        [f"VAT ({int(VAT_RATE*100)}%)", f"€ {quote['vat']:,.2f}"],
        ["Total", f"€ {quote['total']:,.2f}"],
    ]
    ttbl = Table(totals, colWidths=[40 * mm, 30 * mm], hAlign="RIGHT")
    ttbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (-1, 1), MUTED),
        ("TEXTCOLOR", (0, 2), (-1, 2), DARK),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, 2), (-1, 2), 0.8, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(ttbl)
    story.append(Spacer(1, 18))

    if quote.get("notes"):
        story.append(Paragraph("NOTES", label))
        story.append(Paragraph(quote["notes"].replace("\n", "<br/>"), body))
        story.append(Spacer(1, 10))

    # Footer (signature / bank)
    footer = []
    if owner.get("bank_account"):
        footer.append(f"Bank: {owner['bank_account']}")
    if owner.get("email_signature"):
        footer.append(owner["email_signature"].replace("\n", "<br/>"))
    if footer:
        story.append(Spacer(1, 8))
        story.append(Paragraph("<br/>".join(footer), small))

    doc.build(story)
    buf.seek(0)
    return buf.read()

@api_router.get("/quotes/{quote_id}/pdf")
async def quote_pdf(quote_id: str, user: dict = Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id, "user_id": user["id"]}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    owner = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    pdf_bytes = build_pdf(q, owner)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="quote-{q["quote_number"]}.pdf"'})

# ---------- Send email ----------
@api_router.post("/quotes/{quote_id}/send")
async def send_quote(quote_id: str, req: SendQuoteRequest, user: dict = Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id, "user_id": user["id"]}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    owner = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    pdf_bytes = build_pdf(q, owner)
    import base64
    encoded = base64.b64encode(pdf_bytes).decode("utf-8")
    subject = req.subject or f"Quote #{q['quote_number']} from {owner.get('company_name') or owner.get('name')}"
    body_html = (req.message or
                 f"<p>Hi {q['client_name']},</p>"
                 f"<p>Please find attached our quote <b>#{q['quote_number']}</b> for a total of <b>€{q['total']:,.2f}</b>.</p>"
                 f"<p>{(owner.get('email_signature') or 'Best regards').replace(chr(10), '<br/>')}</p>")

    sent_ok = False
    error = None
    if resend.api_key:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [q["client_email"]],
                "subject": subject,
                "html": body_html,
                "attachments": [{
                    "filename": f"quote-{q['quote_number']}.pdf",
                    "content": encoded,
                }],
            }
            await asyncio.to_thread(resend.Emails.send, params)
            sent_ok = True
        except Exception as e:
            error = str(e)
            logger.error(f"Resend error: {e}")
    else:
        # MOCKED EMAIL - log only (no Resend key configured)
        logger.info(f"[MOCK EMAIL] To: {q['client_email']} | Subject: {subject}")
        sent_ok = True

    await db.quotes.update_one({"id": quote_id, "user_id": user["id"]},
                               {"$set": {"status": "sent",
                                         "sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": sent_ok, "mocked": not bool(resend.api_key), "error": error}

# ---------- Stripe ----------
PLAN_PRICE = {"pro": PRO_PRICE_EUR}

def get_stripe(request: Request) -> StripeCheckout:
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    api_key = os.environ["STRIPE_API_KEY"]
    return StripeCheckout(api_key=api_key, webhook_url=webhook_url)

@api_router.post("/billing/checkout")
async def billing_checkout(req: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    amount = PLAN_PRICE["pro"]
    success_url = f"{req.origin_url}/billing?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{req.origin_url}/billing"
    metadata = {"user_id": user["id"], "plan": "pro", "email": user["email"]}
    sc = get_stripe(request)
    ck_req = CheckoutSessionRequest(amount=float(amount), currency="eur",
                                    success_url=success_url, cancel_url=cancel_url, metadata=metadata)
    session: CheckoutSessionResponse = await sc.create_checkout_session(ck_req)
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "user_id": user["id"],
        "email": user["email"],
        "amount": float(amount),
        "currency": "eur",
        "plan": "pro",
        "payment_status": "initiated",
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/billing/status/{session_id}")
async def billing_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    sc = get_stripe(request)
    status: CheckoutStatusResponse = await sc.get_checkout_status(session_id)
    txn = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["id"]})
    if txn and txn.get("payment_status") != "paid" and status.payment_status == "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
        await db.users.update_one({"id": user["id"]},
                                  {"$set": {"plan": "pro", "subscription_status": "active",
                                            "subscription_started": datetime.now(timezone.utc).isoformat()}})
    return {"status": status.status, "payment_status": status.payment_status,
            "amount_total": status.amount_total, "currency": status.currency}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    sc = get_stripe(request)
    try:
        evt = await sc.handle_webhook(body, sig)
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return JSONResponse({"ok": False}, status_code=400)
    if evt.payment_status == "paid":
        meta = evt.metadata or {}
        uid = meta.get("user_id")
        if uid:
            await db.users.update_one({"id": uid},
                                      {"$set": {"plan": "pro", "subscription_status": "active"}})
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {"payment_status": "paid",
                          "completed_at": datetime.now(timezone.utc).isoformat()}}
            )
    return {"ok": True}

# ---------- App wiring ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.quotes.create_index([("user_id", 1), ("created_at", -1)])
    await db.clients.create_index([("user_id", 1), ("created_at", -1)])
    init_storage()
    logger.info("Quotify backend ready.")

@app.on_event("shutdown")
async def shutdown():
    client.close()
