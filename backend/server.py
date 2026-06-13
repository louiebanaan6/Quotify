from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import random
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
import stripe as stripe_lib

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
SENDER_EMAIL = 'Quotify <noreply@quotify.site>'
resend.api_key = os.environ.get('RESEND_API_KEY', '')
FREE_QUOTE_LIMIT = 3
FREE_PROJECT_LIMIT = 2
TEAM_MEMBER_LIMIT = 5
PRO_PRICE_EUR = 49.0
VAT_RATE = 0.21
LIFETIME_PRO_EMAILS = {"louie.oorts@gmail.com"}
OTP_EXPIRE_MINUTES = 10

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

# ---------- OTP helpers ----------
def generate_otp() -> str:
    return str(random.randint(100000, 999999))

async def save_otp(email: str, otp: str, purpose: str):
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)).isoformat()
    await db.otps.delete_many({"email": email, "purpose": purpose})
    await db.otps.insert_one({
        "email": email, "otp": otp, "purpose": purpose,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

async def verify_otp(email: str, otp: str, purpose: str) -> bool:
    record = await db.otps.find_one({"email": email, "purpose": purpose})
    if not record:
        return False
    expires_at = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await db.otps.delete_many({"email": email, "purpose": purpose})
        return False
    if record["otp"] != otp:
        return False
    await db.otps.delete_many({"email": email, "purpose": purpose})
    return True

async def send_otp_email(email: str, otp: str, purpose: str, name: str = ""):
    subject_map = {
        "login": f"Your Quotify login code: {otp}",
        "reset": "Reset your Quotify password",
        "change_password": "Confirm your Quotify password change",
    }
    action_map = {
        "login": "sign in to",
        "reset": "reset your password for",
        "change_password": "change your password for",
    }
    subject = subject_map.get(purpose, f"Your Quotify code: {otp}")
    action = action_map.get(purpose, "access")
    greeting = f"Hi {name}," if name else "Hi,"
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
      <div style="margin-bottom:32px;"><span style="font-size:22px;font-weight:800;color:#111;">🌿 QUOTIFY</span></div>
      <h2 style="font-size:24px;font-weight:700;color:#111;margin-bottom:8px;">Your verification code</h2>
      <p style="color:#666;margin-bottom:28px;">{greeting} Use the code below to {action} Quotify.</p>
      <div style="background:#f8f9fa;border-radius:12px;padding:32px;text-align:center;margin-bottom:28px;">
        <span style="font-size:48px;font-weight:900;letter-spacing:12px;color:#111;">{otp}</span>
      </div>
      <p style="color:#888;font-size:14px;">This code expires in <strong>{OTP_EXPIRE_MINUTES} minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:32px 0;" />
      <p style="color:#aaa;font-size:12px;">© 2025 Quotify · support@quotify.site</p>
    </div>
    """
    if resend.api_key:
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": SENDER_EMAIL, "to": [email], "subject": subject, "html": html,
            })
            logger.info(f"OTP sent to {email} for {purpose}")
        except Exception as e:
            logger.error(f"Failed to send OTP email: {e}")
    else:
        logger.info(f"[MOCK OTP] To: {email} | Code: {otp} | Purpose: {purpose}")

# ---------- Models ----------
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ChangePasswordVerifyRequest(BaseModel):
    otp: str
    new_password: str

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class InviteMemberRequest(BaseModel):
    email: EmailStr

class LineItem(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float = 0

DiscountType = Literal["none", "percentage", "fixed"]

class QuoteCreate(BaseModel):
    client_id: Optional[str] = None
    client_name: str
    client_email: EmailStr
    project_description: str = ""
    line_items: List[LineItem] = []
    notes: str = ""
    discount_type: DiscountType = "none"
    discount_value: float = 0
    accent_color: Optional[str] = None

class QuoteUpdate(BaseModel):
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    project_description: Optional[str] = None
    line_items: Optional[List[LineItem]] = None
    notes: Optional[str] = None
    status: Optional[Literal["draft", "sent", "accepted", "declined"]] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    accent_color: Optional[str] = None

class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    address: Optional[str] = ""
    company: Optional[str] = ""

class SettingsUpdate(BaseModel):
    name: Optional[str] = None
    company_name: Optional[str] = None
    vat_number: Optional[str] = None
    bank_account: Optional[str] = None
    email_signature: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = None
    accent_color: Optional[str] = None

class ChangeEmailRequest(BaseModel):
    new_email: EmailStr

class ChangeEmailVerifyRequest(BaseModel):
    otp: str

class SendQuoteRequest(BaseModel):
    subject: Optional[str] = None
    message: Optional[str] = None

class InvoiceUpdate(BaseModel):
    status: Optional[Literal["unpaid", "paid", "overdue"]] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    payment_instructions: Optional[str] = None

class CheckoutRequest(BaseModel):
    origin_url: str

# ---------- Quote calculations ----------
def calculate_totals(line_items: List[dict], discount_type: str = "none", discount_value: float = 0):
    subtotal = sum((li.get("quantity", 0) or 0) * (li.get("unit_price", 0) or 0) for li in line_items)
    subtotal = round(subtotal, 2)
    if discount_type == "percentage":
        discount_amount = round(subtotal * (float(discount_value) / 100.0), 2)
    elif discount_type == "fixed":
        discount_amount = round(float(discount_value), 2)
    else:
        discount_amount = 0.0
    discount_amount = max(0.0, min(discount_amount, subtotal))
    taxable = round(subtotal - discount_amount, 2)
    vat = round(taxable * VAT_RATE, 2)
    total = round(taxable + vat, 2)
    return subtotal, discount_amount, vat, total

async def next_quote_number(user_id: str) -> str:
    year = datetime.now(timezone.utc).year
    count = await db.quotes.count_documents({"user_id": user_id, "quote_number": {"$regex": f"^{year}-"}})
    return f"{year}-{(count + 1):04d}"

async def next_invoice_number(user_id: str) -> str:
    year = datetime.now(timezone.utc).year
    count = await db.invoices.count_documents({"user_id": user_id, "invoice_number": {"$regex": f"^INV-{year}-"}})
    return f"INV-{year}-{(count + 1):03d}"

def apply_lifetime_pro_if_needed(user_doc: dict) -> dict:
    if (user_doc.get("email") or "").lower() in LIFETIME_PRO_EMAILS:
        user_doc["plan"] = "pro"
        user_doc["subscription_status"] = "lifetime"
    return user_doc

# ---------- Auth Routes ----------
@api_router.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    email = req.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id, "email": email, "name": req.name,
        "password_hash": hash_password(req.password),
        "plan": "free", "subscription_status": "inactive",
        "company_name": "", "vat_number": "", "bank_account": "",
        "email_signature": "", "address": "", "phone": "",
        "logo_path": "", "language": "en", "accent_color": "#0066FF",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    apply_lifetime_pro_if_needed(user_doc)
    await db.users.insert_one(user_doc)
    otp = generate_otp()
    await save_otp(email, otp, "login")
    await send_otp_email(email, otp, "login", req.name)
    return {"requires_otp": True, "email": email, "message": "Account created. Check your email for the login code."}

@api_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    otp = generate_otp()
    await save_otp(email, otp, "login")
    await send_otp_email(email, otp, "login", user.get("name", ""))
    return {"requires_otp": True, "email": email, "message": "Check your email for the login code."}

@api_router.post("/auth/verify-otp")
async def verify_login_otp(req: VerifyOTPRequest, response: Response):
    email = req.email.lower().strip()
    valid = await verify_otp(email, req.otp, "login")
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid or expired code. Please try again.")
    user = await db.users.find_one({"email": email}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user = apply_lifetime_pro_if_needed(user)
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    return {"user": user, "token": token}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(request: Request) -> dict:
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

@api_router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if user:
        otp = generate_otp()
        await save_otp(email, otp, "reset")
        await send_otp_email(email, otp, "reset", user.get("name", ""))
    return {"message": "If this email is registered, you'll receive a reset code shortly."}

@api_router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest):
    email = req.email.lower().strip()
    valid = await verify_otp(email, req.otp, "reset")
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(req.new_password)}})
    return {"ok": True, "message": "Password reset successfully. You can now log in."}

@api_router.post("/auth/change-password/request")
async def change_password_request(req: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user or not verify_password(req.current_password, db_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    pending_hash = hash_password(req.new_password)
    await db.otps.delete_many({"email": user["email"], "purpose": "change_password"})
    otp = generate_otp()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)).isoformat()
    await db.otps.insert_one({
        "email": user["email"], "otp": otp, "purpose": "change_password",
        "pending_hash": pending_hash, "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await send_otp_email(user["email"], otp, "change_password", user.get("name", ""))
    return {"message": "Check your email for the confirmation code."}

@api_router.post("/auth/change-password/verify")
async def change_password_verify(req: ChangePasswordVerifyRequest, user: dict = Depends(get_current_user)):
    record = await db.otps.find_one({"email": user["email"], "purpose": "change_password"})
    if not record:
        raise HTTPException(status_code=400, detail="No pending password change found.")
    expires_at = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await db.otps.delete_many({"email": user["email"], "purpose": "change_password"})
        raise HTTPException(status_code=400, detail="Code expired. Please try again.")
    if record["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid code.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": record["pending_hash"]}})
    await db.otps.delete_many({"email": user["email"], "purpose": "change_password"})
    return {"ok": True, "message": "Password changed successfully."}

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
    import base64
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo must be smaller than 2MB.")
    ct = file.content_type or "image/png"
    b64 = base64.b64encode(data).decode("utf-8")
    logo_data_url = f"data:{ct};base64,{b64}"
    await db.users.update_one({"id": user["id"]}, {"$set": {"logo_data": logo_data_url, "logo_path": "db"}})
    return {"logo_path": "db", "logo_data": logo_data_url}

@api_router.post("/settings/profile-photo")
async def upload_profile_photo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    import base64
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be smaller than 5MB.")
    ct = file.content_type or "image/jpeg"
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    b64 = base64.b64encode(data).decode("utf-8")
    data_url = f"data:{ct};base64,{b64}"
    await db.users.update_one({"id": user["id"]}, {"$set": {"profile_photo": data_url}})
    return {"profile_photo": data_url}

# ---------- Change email ----------
@api_router.post("/auth/change-email/request")
async def change_email_request(req: ChangeEmailRequest, user: dict = Depends(get_current_user)):
    new_email = str(req.new_email).lower().strip()
    if new_email == user["email"].lower():
        raise HTTPException(status_code=400, detail="That is already your current email address.")
    existing = await db.users.find_one({"email": new_email})
    if existing:
        raise HTTPException(status_code=400, detail="This email address is already in use.")
    otp = generate_otp()
    # Store pending new email alongside OTP
    await db.otps.delete_many({"email": user["email"], "purpose": "change_email"})
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)).isoformat()
    await db.otps.insert_one({
        "email": user["email"],
        "otp": otp,
        "purpose": "change_email",
        "pending_email": new_email,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Send to CURRENT email
    subject = f"Confirm your Quotify email change: {otp}"
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
      <div style="margin-bottom:32px;"><span style="font-size:22px;font-weight:800;color:#111;">QUOTIFY</span></div>
      <h2 style="font-size:24px;font-weight:700;color:#111;margin-bottom:8px;">Confirm email change</h2>
      <p style="color:#666;margin-bottom:28px;">Hi {user.get('name', '')}, use the code below to confirm changing your email to <b>{new_email}</b>.</p>
      <div style="background:#f8f9fa;border-radius:12px;padding:32px;text-align:center;margin-bottom:28px;">
        <span style="font-size:48px;font-weight:900;letter-spacing:12px;color:#111;">{otp}</span>
      </div>
      <p style="color:#888;font-size:14px;">This code expires in <strong>{OTP_EXPIRE_MINUTES} minutes</strong>. If you didn't request this, ignore this email.</p>
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:32px 0;" />
      <p style="color:#aaa;font-size:12px;">© 2025 Quotify · support@quotify.site</p>
    </div>
    """
    if resend.api_key:
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": SENDER_EMAIL, "to": [user["email"]], "subject": subject, "html": html,
            })
        except Exception as e:
            logger.error(f"Failed to send change-email OTP: {e}")
    else:
        logger.info(f"[MOCK] change-email OTP for {user['email']}: {otp} → new: {new_email}")
    return {"ok": True, "message": "Confirmation code sent to your current email."}

@api_router.post("/auth/change-email/verify")
async def change_email_verify(req: ChangeEmailVerifyRequest, user: dict = Depends(get_current_user)):
    record = await db.otps.find_one({"email": user["email"], "purpose": "change_email"})
    if not record:
        raise HTTPException(status_code=400, detail="No pending email change. Please request a new code.")
    expires_at = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await db.otps.delete_many({"email": user["email"], "purpose": "change_email"})
        raise HTTPException(status_code=400, detail="Code expired. Please request a new one.")
    if record["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid code.")
    new_email = record["pending_email"]
    # Check again that email is still free
    existing = await db.users.find_one({"email": new_email, "id": {"$ne": user["id"]}})
    if existing:
        raise HTTPException(status_code=400, detail="This email address is already in use.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"email": new_email}})
    await db.otps.delete_many({"email": user["email"], "purpose": "change_email"})
    return {"ok": True, "message": "Email updated successfully."}

@api_router.get("/files/{path:path}")
async def serve_file(path: str, user_id: str = Query(None)):
    raise HTTPException(status_code=404, detail="File not found")

@api_router.get("/settings/logo")
async def get_logo(user: dict = Depends(get_current_user)):
    db_user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "logo_data": 1})
    if not db_user or not db_user.get("logo_data"):
        raise HTTPException(status_code=404, detail="No logo")
    return {"logo_data": db_user["logo_data"]}

# ---------- Projects ----------
@api_router.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    owned = await db.projects.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(100)
    memberships = await db.team_members.find({"member_email": user["email"], "status": "accepted"}, {"_id": 0}).to_list(100)
    member_project_ids = [m["project_id"] for m in memberships]
    member_projects = []
    if member_project_ids:
        member_projects = await db.projects.find({"id": {"$in": member_project_ids}}, {"_id": 0}).to_list(100)
    return {"owned": owned, "member": member_projects}

@api_router.post("/projects")
async def create_project(data: ProjectCreate, user: dict = Depends(get_current_user)):
    if user.get("plan", "free") == "free":
        count = await db.projects.count_documents({"owner_id": user["id"]})
        if count >= FREE_PROJECT_LIMIT:
            raise HTTPException(status_code=402, detail=f"Free plan is limited to {FREE_PROJECT_LIMIT} projects. Upgrade to Pro for unlimited.")
    project_id = str(uuid.uuid4())
    doc = {
        "id": project_id, "owner_id": user["id"],
        "name": data.name, "description": data.description or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_project_id": project_id}})
    return doc

@api_router.put("/projects/{project_id}")
async def update_project(project_id: str, data: ProjectUpdate, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.projects.update_one({"id": project_id}, {"$set": update})
    return await db.projects.find_one({"id": project_id}, {"_id": 0})

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.delete_one({"id": project_id})
    if user.get("active_project_id") == project_id:
        await db.users.update_one({"id": user["id"]}, {"$unset": {"active_project_id": ""}})
    return {"ok": True}

@api_router.post("/projects/{project_id}/activate")
async def activate_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    is_owner = project["owner_id"] == user["id"]
    is_member = await db.team_members.find_one({"project_id": project_id, "member_email": user["email"], "status": "accepted"})
    if not is_owner and not is_member:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_project_id": project_id}})
    return {"ok": True, "active_project_id": project_id}

# ---------- Team Members ----------
@api_router.get("/projects/{project_id}/members")
async def list_members(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not project:
        raise HTTPException(status_code=403, detail="Only the owner can manage members")
    members = await db.team_members.find({"project_id": project_id}, {"_id": 0}).to_list(100)
    return members

@api_router.post("/projects/{project_id}/invite")
async def invite_member(project_id: str, req: InviteMemberRequest, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not project:
        raise HTTPException(status_code=403, detail="Only the owner can invite members")
    invite_email = req.email.lower().strip()
    if invite_email == user["email"]:
        raise HTTPException(status_code=400, detail="You can't invite yourself")
    count = await db.team_members.count_documents({"project_id": project_id, "status": {"$in": ["pending", "accepted"]}})
    if count >= TEAM_MEMBER_LIMIT:
        raise HTTPException(status_code=400, detail=f"Team is limited to {TEAM_MEMBER_LIMIT} members")
    existing = await db.team_members.find_one({"project_id": project_id, "member_email": invite_email})
    if existing:
        raise HTTPException(status_code=400, detail="This person is already invited")
    invite_id = str(uuid.uuid4())
    token = str(uuid.uuid4())
    doc = {
        "id": invite_id, "project_id": project_id, "project_name": project["name"],
        "owner_id": user["id"], "owner_name": user.get("name", ""), "owner_email": user["email"],
        "member_email": invite_email, "token": token, "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.team_members.insert_one(doc)
    doc.pop("_id", None)
    accept_url = f"https://panel.quotify.site/invite/accept?token={token}"
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
      <div style="margin-bottom:32px;"><span style="font-size:22px;font-weight:800;color:#111;">🌿 QUOTIFY</span></div>
      <h2 style="font-size:24px;font-weight:700;color:#111;margin-bottom:8px;">You've been invited!</h2>
      <p style="color:#666;margin-bottom:24px;">
        <strong>{user.get('name') or user['email']}</strong> has invited you to join
        <strong>"{project['name']}"</strong> on Quotify.
      </p>
      <a href="{accept_url}" style="display:inline-block;background:#0066FF;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Accept invitation</a>
      <p style="color:#aaa;font-size:13px;margin-top:24px;">If you don't have a Quotify account yet, you'll be asked to create one first.</p>
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:32px 0;" />
      <p style="color:#aaa;font-size:12px;">© 2025 Quotify · support@quotify.site</p>
    </div>
    """
    if resend.api_key:
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": SENDER_EMAIL, "to": [invite_email],
                "subject": f"{user.get('name') or 'Someone'} invited you to {project['name']} on Quotify",
                "html": html,
            })
        except Exception as e:
            logger.error(f"Invite email error: {e}")
    return doc

@api_router.post("/invite/accept")
async def accept_invite(token: str, response: Response):
    invite = await db.team_members.find_one({"token": token})
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    if invite["status"] == "accepted":
        return {"ok": True, "already_accepted": True, "project_id": invite["project_id"]}
    user = await db.users.find_one({"email": invite["member_email"]}, {"_id": 0, "password_hash": 0})
    if not user:
        return {"ok": False, "needs_account": True, "email": invite["member_email"], "token": token}
    await db.team_members.update_one(
        {"token": token},
        {"$set": {"status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat(), "member_id": user["id"]}}
    )
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_project_id": invite["project_id"]}})
    token_jwt = create_access_token(user["id"], user["email"])
    set_auth_cookie(response, token_jwt)
    return {"ok": True, "project_id": invite["project_id"], "project_name": invite["project_name"]}

@api_router.delete("/projects/{project_id}/members/{member_id}")
async def remove_member(project_id: str, member_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not project:
        raise HTTPException(status_code=403, detail="Only the owner can remove members")
    res = await db.team_members.delete_one({"id": member_id, "project_id": project_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"ok": True}

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
    accepted_value = 0
    async for row in db.quotes.aggregate(pipeline):
        accepted_value = row.get("sum", 0)
    return {"total": total, "by_status": by_status, "accepted_value": round(accepted_value, 2),
            "plan": user.get("plan", "free"), "limit": FREE_QUOTE_LIMIT}

@api_router.post("/quotes")
async def create_quote(data: QuoteCreate, user: dict = Depends(get_current_user)):
    if user.get("plan", "free") == "free":
        count = await db.quotes.count_documents({"user_id": user["id"]})
        if count >= FREE_QUOTE_LIMIT:
            raise HTTPException(status_code=402, detail=f"Free plan limited to {FREE_QUOTE_LIMIT} quotes. Upgrade to Pro for unlimited.")
    line_items = [li.model_dump() for li in data.line_items]
    subtotal, discount_amount, vat, total = calculate_totals(line_items, data.discount_type, data.discount_value)
    qnum = await next_quote_number(user["id"])
    accent = data.accent_color or user.get("accent_color") or "#0066FF"
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "quote_number": qnum,
        "client_id": data.client_id, "client_name": data.client_name,
        "client_email": data.client_email, "project_description": data.project_description,
        "line_items": line_items, "notes": data.notes, "subtotal": subtotal,
        "discount_type": data.discount_type, "discount_value": float(data.discount_value),
        "discount_amount": discount_amount, "vat_rate": VAT_RATE, "vat": vat, "total": total,
        "status": "draft", "invoice_id": None, "accent_color": accent,
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
    needs_recalc = any(k in update for k in ("line_items", "discount_type", "discount_value"))
    if needs_recalc:
        current = await db.quotes.find_one({"id": quote_id, "user_id": user["id"]}, {"_id": 0})
        line_items = update.get("line_items", current.get("line_items", []))
        line_items = [li if isinstance(li, dict) else li.model_dump() for li in line_items]
        d_type = update.get("discount_type", current.get("discount_type", "none"))
        d_val = float(update.get("discount_value", current.get("discount_value", 0)) or 0)
        subtotal, discount_amount, vat, total = calculate_totals(line_items, d_type, d_val)
        update.update({"line_items": line_items, "subtotal": subtotal, "discount_amount": discount_amount,
                       "discount_type": d_type, "discount_value": d_val, "vat": vat, "total": total, "vat_rate": VAT_RATE})
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.quotes.update_one({"id": quote_id, "user_id": user["id"]}, {"$set": update})
    return await db.quotes.find_one({"id": quote_id, "user_id": user["id"]}, {"_id": 0})

@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user: dict = Depends(get_current_user)):
    res = await db.quotes.delete_one({"id": quote_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"ok": True}

# ---------- PDF ----------
def build_pdf(doc_data: dict, owner: dict, kind: str = "QUOTE") -> bytes:
    is_invoice = kind == "INVOICE"
    number = doc_data.get("invoice_number") if is_invoice else doc_data.get("quote_number")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                            topMargin=18*mm, bottomMargin=18*mm, title=f"{kind.title()} {number}")
    styles = getSampleStyleSheet()
    accent_hex = doc_data.get("accent_color") or owner.get("accent_color") or "#0066FF"
    try:
        BLUE = colors.HexColor(accent_hex)
    except Exception:
        BLUE = colors.HexColor("#0066FF")
    DARK = colors.HexColor("#0A0A0A")
    MUTED = colors.HexColor("#6B7280")
    BORDER = colors.HexColor("#E5E7EB")
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=DARK, spaceAfter=6)
    label_style = ParagraphStyle("label", parent=styles["Normal"], fontName="Helvetica", fontSize=8, textColor=MUTED, spaceAfter=2)
    body = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica", fontSize=10, textColor=DARK, leading=14)
    small = ParagraphStyle("small", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=MUTED, leading=12)
    story = []
    logo_flow = Paragraph(f"<b>{owner.get('company_name') or owner.get('name') or 'Quotify'}</b>", h1)
    try:
        if owner.get("logo_data"):
            import base64 as b64mod
            header, encoded = owner["logo_data"].split(",", 1)
            img_bytes = b64mod.b64decode(encoded)
            logo_flow = Image(io.BytesIO(img_bytes), width=42*mm, height=18*mm, kind="proportional")
    except Exception as e:
        logger.warning(f"PDF logo error: {e}")
    company_info_lines = []
    if owner.get('company_name'): company_info_lines.append(f"<b>{owner['company_name']}</b>")
    if owner.get('address'): company_info_lines.append(owner['address'].replace('\n', '<br/>'))
    if owner.get('phone'): company_info_lines.append(owner['phone'])
    if owner.get('email'): company_info_lines.append(owner['email'])
    if owner.get('vat_number'): company_info_lines.append(f"VAT: {owner['vat_number']}")
    if is_invoice:
        left_cell = [Paragraph("BILL TO", label_style), Paragraph(f"<b>{doc_data['client_name']}</b>", body), Paragraph(doc_data['client_email'], small)]
        right_block = [Paragraph("INVOICE", h1), Paragraph(f"<b>#{number}</b>", body), Paragraph(f"Date: {doc_data['created_at'][:10]}", small), Paragraph(f"Due: {doc_data.get('due_date','')[:10]}", small)]
        if doc_data.get("status") == "paid": right_block.append(Paragraph("<b><font color='#10B981'>PAID</font></b>", body))
        elif doc_data.get("status") == "overdue": right_block.append(Paragraph("<b><font color='#EF4444'>OVERDUE</font></b>", body))
        right_cell = right_block
    else:
        left_cell = [logo_flow, Spacer(1, 6), Paragraph("<br/>".join(company_info_lines), small)]
        right_cell = [Paragraph("QUOTE", h1), Paragraph(f"<b>#{number}</b>", body), Paragraph(f"Date: {doc_data['created_at'][:10]}", small)]
    header_tbl = Table([[left_cell, right_cell]], colWidths=[100*mm, 70*mm])
    header_tbl.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("ALIGN", (1,0), (1,0), "RIGHT")]))
    story.append(header_tbl)
    story.append(Spacer(1, 14))
    if is_invoice:
        story.append(Paragraph("FROM", label_style))
        story.append(Paragraph("<br/>".join(company_info_lines), small))
        story.append(Spacer(1, 14))
    else:
        story.append(Paragraph("BILL TO", label_style))
        story.append(Paragraph(f"<b>{doc_data['client_name']}</b><br/>{doc_data['client_email']}", body))
        story.append(Spacer(1, 14))
    if doc_data.get("project_description"):
        story.append(Paragraph("PROJECT", label_style))
        story.append(Paragraph(doc_data["project_description"].replace("\n", "<br/>"), body))
        story.append(Spacer(1, 14))
    rows = [["Description", "Qty", "Unit Price", "Amount"]]
    for li in doc_data["line_items"]:
        amt = (li.get("quantity", 0) or 0) * (li.get("unit_price", 0) or 0)
        rows.append([li.get("description", ""), f"{li.get('quantity',0):g}", f"€ {li.get('unit_price',0):,.2f}", f"€ {amt:,.2f}"])
    tbl = Table(rows, colWidths=[90*mm, 18*mm, 28*mm, 28*mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), BLUE), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ALIGN", (1,0), (-1,-1), "RIGHT"), ("ALIGN", (0,0), (0,-1), "LEFT"),
        ("BOTTOMPADDING", (0,0), (-1,0), 8), ("TOPPADDING", (0,0), (-1,0), 8),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, BORDER), ("TEXTCOLOR", (0,1), (-1,-1), DARK),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,1), (-1,-1), 6),
        ("BOTTOMPADDING", (0,1), (-1,-1), 6),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 12))
    totals = [["Subtotal", f"€ {doc_data['subtotal']:,.2f}"]]
    d_type = doc_data.get("discount_type", "none")
    d_amount = doc_data.get("discount_amount", 0) or 0
    if d_type and d_type != "none" and d_amount > 0:
        totals.append([f"Discount ({'%g%%' % doc_data.get('discount_value',0) if d_type=='percentage' else 'fixed'})", f"− € {d_amount:,.2f}"])
    totals.extend([[f"VAT ({int(VAT_RATE*100)}%)", f"€ {doc_data['vat']:,.2f}"], ["Total", f"€ {doc_data['total']:,.2f}"]])
    last_idx = len(totals) - 1
    ttbl = Table(totals, colWidths=[50*mm, 30*mm], hAlign="RIGHT")
    ttbl.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,last_idx-1), "Helvetica"), ("FONTNAME", (0,last_idx), (-1,last_idx), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 10), ("TEXTCOLOR", (0,0), (-1,last_idx-1), MUTED),
        ("TEXTCOLOR", (0,last_idx), (-1,last_idx), DARK), ("ALIGN", (1,0), (1,-1), "RIGHT"),
        ("LINEABOVE", (0,last_idx), (-1,last_idx), 0.8, BORDER), ("TOPPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(ttbl)
    story.append(Spacer(1, 18))
    if doc_data.get("notes"):
        story.append(Paragraph("NOTES", label_style))
        story.append(Paragraph(doc_data["notes"].replace("\n", "<br/>"), body))
        story.append(Spacer(1, 10))
    if is_invoice:
        story.append(Spacer(1, 8))
        story.append(Paragraph("PAYMENT", label_style))
        pay_lines = []
        if doc_data.get("due_date"): pay_lines.append(f"<b>Due date:</b> {doc_data['due_date'][:10]}")
        if owner.get("bank_account"): pay_lines.append(f"<b>Bank account:</b> {owner['bank_account']}")
        instr = doc_data.get("payment_instructions") or f"Please reference invoice #{number} when making payment."
        pay_lines.append(instr.replace("\n", "<br/>"))
        story.append(Paragraph("<br/>".join(pay_lines), body))
        if owner.get("email_signature"):
            story.append(Spacer(1, 10))
            story.append(Paragraph(owner["email_signature"].replace("\n", "<br/>"), small))
    else:
        footer = []
        if owner.get("bank_account"): footer.append(f"Bank: {owner['bank_account']}")
        if owner.get("email_signature"): footer.append(owner["email_signature"].replace("\n", "<br/>"))
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
    return StreamingResponse(io.BytesIO(build_pdf(q, owner)), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="quote-{q["quote_number"]}.pdf"'})

@api_router.post("/quotes/{quote_id}/send")
async def send_quote(quote_id: str, req: SendQuoteRequest, user: dict = Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id, "user_id": user["id"]}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    owner = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    import base64
    encoded = base64.b64encode(build_pdf(q, owner)).decode("utf-8")
    subject = req.subject or f"Quote #{q['quote_number']} from {owner.get('company_name') or owner.get('name')}"
    body_html = req.message or (f"<p>Hi {q['client_name']},</p>"
                 f"<p>Please find attached our quote <b>#{q['quote_number']}</b> for a total of <b>€{q['total']:,.2f}</b>.</p>"
                 f"<p>{(owner.get('email_signature') or 'Best regards').replace(chr(10), '<br/>')}</p>")
    sent_ok, error = False, None
    if resend.api_key:
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": SENDER_EMAIL, "to": [q["client_email"]], "subject": subject, "html": body_html,
                "attachments": [{"filename": f"quote-{q['quote_number']}.pdf", "content": encoded}],
            })
            sent_ok = True
        except Exception as e:
            error = str(e); logger.error(f"Resend error: {e}")
    else:
        logger.info(f"[MOCK EMAIL] To: {q['client_email']} | Subject: {subject}"); sent_ok = True
    await db.quotes.update_one({"id": quote_id, "user_id": user["id"]},
                               {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": sent_ok, "mocked": not bool(resend.api_key), "error": error}

# ---------- Invoices ----------
def _mark_overdue(inv: dict) -> dict:
    if inv.get("status") == "unpaid" and inv.get("due_date"):
        try:
            due = datetime.fromisoformat(inv["due_date"].replace("Z", "+00:00"))
            if due.tzinfo is None: due = due.replace(tzinfo=timezone.utc)
            if due < datetime.now(timezone.utc): inv["status"] = "overdue"
        except Exception: pass
    return inv

@api_router.get("/invoices")
async def list_invoices(user: dict = Depends(get_current_user)):
    items = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [_mark_overdue(i) for i in items]

@api_router.get("/invoices/stats")
async def invoices_stats(user: dict = Depends(get_current_user)):
    items = [_mark_overdue(i) for i in await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)]
    return {
        "total": len(items),
        "total_revenue": round(sum(i["total"] for i in items if i.get("status") == "paid"), 2),
        "unpaid_total": round(sum(i["total"] for i in items if i.get("status") == "unpaid"), 2),
        "overdue_total": round(sum(i["total"] for i in items if i.get("status") == "overdue"), 2),
        "by_status": {s: sum(1 for i in items if i.get("status") == s) for s in ["unpaid", "paid", "overdue"]},
    }

@api_router.post("/quotes/{quote_id}/convert-to-invoice")
async def convert_quote_to_invoice(quote_id: str, user: dict = Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id, "user_id": user["id"]}, {"_id": 0})
    if not q: raise HTTPException(status_code=404, detail="Quote not found")
    if q.get("invoice_id"):
        existing = await db.invoices.find_one({"id": q["invoice_id"], "user_id": user["id"]}, {"_id": 0})
        if existing: return _mark_overdue(existing)
    now = datetime.now(timezone.utc)
    inv = {
        "id": str(uuid.uuid4()), "user_id": user["id"],
        "invoice_number": await next_invoice_number(user["id"]),
        "quote_id": q["id"], "quote_number": q["quote_number"],
        "client_id": q.get("client_id"), "client_name": q["client_name"], "client_email": q["client_email"],
        "project_description": q.get("project_description", ""), "line_items": q.get("line_items", []),
        "notes": q.get("notes", ""), "subtotal": q["subtotal"],
        "discount_type": q.get("discount_type", "none"), "discount_value": q.get("discount_value", 0),
        "discount_amount": q.get("discount_amount", 0), "vat_rate": q.get("vat_rate", VAT_RATE),
        "vat": q["vat"], "total": q["total"], "status": "unpaid",
        "due_date": (now + timedelta(days=30)).isoformat(), "payment_instructions": "",
        "accent_color": q.get("accent_color") or "#0066FF",
        "created_at": now.isoformat(), "updated_at": now.isoformat(), "paid_at": None, "sent_at": None,
    }
    await db.invoices.insert_one(inv)
    await db.quotes.update_one({"id": quote_id, "user_id": user["id"]}, {"$set": {"invoice_id": inv["id"]}})
    inv.pop("_id", None)
    return inv

@api_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": invoice_id, "user_id": user["id"]}, {"_id": 0})
    if not inv: raise HTTPException(status_code=404, detail="Invoice not found")
    return _mark_overdue(inv)

@api_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, data: InvoiceUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update.get("status") == "paid": update["paid_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.invoices.update_one({"id": invoice_id, "user_id": user["id"]}, {"$set": update})
    if res.matched_count == 0: raise HTTPException(status_code=404, detail="Invoice not found")
    return _mark_overdue(await db.invoices.find_one({"id": invoice_id, "user_id": user["id"]}, {"_id": 0}))

@api_router.post("/invoices/{invoice_id}/mark-paid")
async def mark_invoice_paid(invoice_id: str, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    res = await db.invoices.update_one({"id": invoice_id, "user_id": user["id"]},
                                       {"$set": {"status": "paid", "paid_at": now, "updated_at": now}})
    if res.matched_count == 0: raise HTTPException(status_code=404, detail="Invoice not found")
    return await db.invoices.find_one({"id": invoice_id, "user_id": user["id"]}, {"_id": 0})

@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    res = await db.invoices.delete_one({"id": invoice_id, "user_id": user["id"]})
    if res.deleted_count == 0: raise HTTPException(status_code=404, detail="Invoice not found")
    return {"ok": True}

@api_router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": invoice_id, "user_id": user["id"]}, {"_id": 0})
    if not inv: raise HTTPException(status_code=404, detail="Invoice not found")
    owner = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return StreamingResponse(io.BytesIO(build_pdf(_mark_overdue(inv), owner, kind="INVOICE")),
                             media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="invoice-{inv["invoice_number"]}.pdf"'})

@api_router.post("/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: str, req: SendQuoteRequest, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": invoice_id, "user_id": user["id"]}, {"_id": 0})
    if not inv: raise HTTPException(status_code=404, detail="Invoice not found")
    owner = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    import base64
    encoded = base64.b64encode(build_pdf(inv, owner, kind="INVOICE")).decode("utf-8")
    subject = req.subject or f"Invoice #{inv['invoice_number']} from {owner.get('company_name') or owner.get('name')}"
    body_html = req.message or (f"<p>Hi {inv['client_name']},</p>"
                 f"<p>Please find attached invoice <b>#{inv['invoice_number']}</b> for <b>€{inv['total']:,.2f}</b>.</p>"
                 f"<p>Due date: <b>{inv.get('due_date','')[:10]}</b><br/>Bank: <b>{owner.get('bank_account') or '—'}</b></p>"
                 f"<p>{(owner.get('email_signature') or 'Best regards').replace(chr(10), '<br/>')}</p>")
    sent_ok, error = False, None
    if resend.api_key:
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": SENDER_EMAIL, "to": [inv["client_email"]], "subject": subject, "html": body_html,
                "attachments": [{"filename": f"invoice-{inv['invoice_number']}.pdf", "content": encoded}],
            })
            sent_ok = True
        except Exception as e:
            error = str(e); logger.error(f"Resend invoice error: {e}")
    else:
        logger.info(f"[MOCK EMAIL] Invoice to {inv['client_email']}"); sent_ok = True
    await db.invoices.update_one({"id": invoice_id, "user_id": user["id"]},
                                 {"$set": {"sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": sent_ok, "mocked": not bool(resend.api_key), "error": error}

# ---------- Stripe ----------
@api_router.post("/billing/checkout")
async def billing_checkout(req: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    stripe_lib.api_key = os.environ.get("STRIPE_API_KEY", "")
    if not stripe_lib.api_key: raise HTTPException(status_code=500, detail="Stripe not configured")
    metadata = {"user_id": user["id"], "plan": "pro", "email": user["email"]}
    session = await asyncio.to_thread(
        stripe_lib.checkout.Session.create,
        payment_method_types=["card"],
        line_items=[{"price_data": {"currency": "eur", "product_data": {"name": "Quotify Pro"},
                                    "unit_amount": int(PRO_PRICE_EUR * 100)}, "quantity": 1}],
        mode="payment",
        success_url=f"{req.origin_url}/billing?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/billing",
        metadata=metadata,
    )
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()), "session_id": session.id, "user_id": user["id"],
        "email": user["email"], "amount": float(PRO_PRICE_EUR), "currency": "eur",
        "plan": "pro", "payment_status": "initiated", "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": session.url, "session_id": session.id}

@api_router.get("/billing/status/{session_id}")
async def billing_status(session_id: str, user: dict = Depends(get_current_user)):
    stripe_lib.api_key = os.environ.get("STRIPE_API_KEY", "")
    session = await asyncio.to_thread(stripe_lib.checkout.Session.retrieve, session_id)
    txn = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["id"]})
    if txn and txn.get("payment_status") != "paid" and session.payment_status == "paid":
        await db.payment_transactions.update_one({"session_id": session_id},
            {"$set": {"payment_status": "paid", "completed_at": datetime.now(timezone.utc).isoformat()}})
        await db.users.update_one({"id": user["id"]},
            {"$set": {"plan": "pro", "subscription_status": "active",
                      "subscription_started": datetime.now(timezone.utc).isoformat()}})
    return {"status": session.status, "payment_status": session.payment_status,
            "amount_total": session.amount_total, "currency": session.currency}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    stripe_lib.api_key = os.environ.get("STRIPE_API_KEY", "")
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    try:
        evt = stripe_lib.Webhook.construct_event(body, sig, webhook_secret) if webhook_secret else stripe_lib.Event.construct_from({"type": "unknown"}, stripe_lib.api_key)
    except Exception as e:
        logger.error(f"Webhook error: {e}"); return JSONResponse({"ok": False}, status_code=400)
    if evt["type"] == "checkout.session.completed":
        session = evt["data"]["object"]
        if session.get("payment_status") == "paid":
            uid = session.get("metadata", {}).get("user_id")
            if uid:
                await db.users.update_one({"id": uid}, {"$set": {"plan": "pro", "subscription_status": "active"}})
                await db.payment_transactions.update_one({"session_id": session["id"]},
                    {"$set": {"payment_status": "paid", "completed_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}

# ---------- App wiring ----------
app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.quotes.create_index([("user_id", 1), ("created_at", -1)])
    await db.invoices.create_index([("user_id", 1), ("created_at", -1)])
    await db.clients.create_index([("user_id", 1), ("created_at", -1)])
    await db.otps.create_index("expires_at", expireAfterSeconds=0)
    await db.otps.create_index([("email", 1), ("purpose", 1)])
    await db.projects.create_index([("owner_id", 1)])
    await db.projects.create_index("id", unique=True)
    await db.team_members.create_index([("project_id", 1)])
    await db.team_members.create_index("token", unique=True)
    for email in LIFETIME_PRO_EMAILS:
        await db.users.update_one({"email": email}, {"$set": {"plan": "pro", "subscription_status": "lifetime"}})
    init_storage()
    logger.info("Quotify backend ready.")

@app.on_event("shutdown")
async def shutdown():
    client.close()
