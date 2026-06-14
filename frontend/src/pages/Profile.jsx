// frontend/src/pages/Profile.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n, LANGUAGES } from "../lib/i18n";
import { toast } from "sonner";
import {
  Camera, Check, Sparkles, Lock, User, Bell,
  CreditCard, Eye, EyeOff, X, ChevronLeft
} from "lucide-react";

function Avatar({ user, size = 64 }) {
  const initials = (user?.name || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (user?.profile_photo) {
    return (
      <img
        src={user.profile_photo}
        alt={user.name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, background: "#0066FF", fontSize: Math.round(size * 0.36) }}
      className="rounded-full flex items-center justify-center text-white font-semibold select-none"
    >
      {initials}
    </div>
  );
}

// ── Profile tab ──────────────────────────────────────────────────
function ProfileTab({ user, onRefresh }) {
  const { t, setLang } = useI18n();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [language, setLanguage] = useState(user?.language || "en");
  const [emailStep, setEmailStep] = useState("idle");
  const [otp, setOtp] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingLang, setSavingLang] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(user?.profile_photo || null);
  const fileRef = useRef();

  const uploadPhoto = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post("/settings/profile-photo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPhotoPreview(res.data.profile_photo);
      await onRefresh();
      toast.success(t("profile.photo_updated"));
    } catch { toast.error("Upload failed"); }
  };

  const saveName = async () => {
    if (!name.trim() || name === user?.name) return;
    setSavingName(true);
    try {
      await api.put("/settings", { name: name.trim() });
      await onRefresh();
      toast.success(t("profile.name_updated"));
    } catch { toast.error("Failed"); } finally { setSavingName(false); }
  };

  const requestEmailChange = async () => {
    if (!email || email === user?.email) return;
    setSavingEmail(true);
    try {
      await api.post("/auth/change-email/request", { new_email: email });
      setEmailStep("otp");
      toast.success(t("profile.code_sent"));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally { setSavingEmail(false); }
  };

  const confirmEmailChange = async () => {
    setSavingEmail(true);
    try {
      await api.post("/auth/change-email/verify", { otp });
      await onRefresh();
      setEmailStep("idle"); setOtp("");
      toast.success(t("profile.email_updated"));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid code");
    } finally { setSavingEmail(false); }
  };

  const saveLang = async (val) => {
    setLanguage(val); setSavingLang(true);
    try {
      await api.put("/settings", { language: val });
      setLang(val); await onRefresh();
    } catch { toast.error("Failed"); } finally { setSavingLang(false); }
  };

  return (
    <div className="space-y-5">
      {/* Photo */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Profile photo</p>
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar user={{ ...user, profile_photo: photoPreview }} size={56} />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0066FF] flex items-center justify-center shadow hover:bg-blue-700 transition-colors"
            >
              <Camera size={11} className="text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => uploadPhoto(e.target.files?.[0])} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
            <button onClick={() => fileRef.current?.click()} className="text-xs text-[#0066FF] hover:underline mt-1">
              Change photo
            </button>
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Full name</p>
        <div className="flex gap-2">
          <input className="q-input flex-1" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()} placeholder="Your name" />
          <button onClick={saveName} disabled={savingName || !name.trim() || name === user?.name}
            className="q-btn-primary shrink-0 disabled:opacity-40">
            {savingName ? "..." : t("profile.save")}
          </button>
        </div>
      </div>

      {/* Email */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Email address</p>
        {emailStep === "idle" ? (
          <div className="flex gap-2">
            <input className="q-input flex-1" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
            <button onClick={requestEmailChange}
              disabled={savingEmail || !email || email === user?.email}
              className="q-btn-secondary shrink-0 disabled:opacity-40">
              {savingEmail ? "..." : t("profile.save")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Code sent to <strong>{user?.email}</strong>
            </p>
            <div className="flex gap-2">
              <input autoFocus className="q-input flex-1 text-center text-xl tracking-[0.4em] font-semibold"
                maxLength={6} inputMode="numeric" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
              <button onClick={confirmEmailChange} disabled={savingEmail || otp.length < 6}
                className="q-btn-primary shrink-0 disabled:opacity-40">Verify</button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setEmailStep("idle"); setOtp(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              <button onClick={requestEmailChange} className="text-xs text-[#0066FF] hover:underline">Resend</button>
            </div>
          </div>
        )}
      </div>

      {/* Language */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Language</p>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((l) => (
            <button key={l.code} onClick={() => saveLang(l.code)} disabled={savingLang}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[13px] font-medium transition-all
                ${language === l.code
                  ? "border-[#0066FF] bg-blue-50 text-[#0066FF]"
                  : "border-[#E5E7EB] text-gray-700 hover:border-gray-300"}`}>
              <span>{l.flag}</span><span>{l.label}</span>
              {language === l.code && <Check size={12} className="ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Password tab ─────────────────────────────────────────────────
function PasswordTab() {
  const { t } = useI18n();
  const [step, setStep] = useState("idle");
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otpVal, setOtpVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pwMatch = newPw === confirm;
  const pwLong = newPw.length >= 8;
  const canSubmit = current && pwLong && pwMatch;

  const request = async (e) => {
    e.preventDefault(); setErr("");
    if (!pwMatch) { setErr("Passwords do not match."); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password/request", { current_password: current, new_password: newPw });
      setStep("otp"); toast.success("Code sent to your email");
    } catch (ex) { setErr(ex.response?.data?.detail || "Check your current password."); }
    finally { setBusy(false); }
  };

  const confirm_ = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api.post("/auth/change-password/verify", { otp: otpVal });
      toast.success(t("profile.pw_changed"));
      setStep("idle"); setCurrent(""); setNewPw(""); setConfirm(""); setOtpVal("");
    } catch (ex) { setErr(ex.response?.data?.detail || "Invalid code."); }
    finally { setBusy(false); }
  };

  const PwInput = ({ value, onChange, show, setShow, placeholder, testid }) => (
    <div className="relative">
      <input type={show ? "text" : "password"} value={value} onChange={onChange}
        className="q-input w-full pr-10" placeholder={placeholder} data-testid={testid} />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );

  if (step === "idle") return (
    <form onSubmit={request} className="space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Current password</p>
        <PwInput value={current} onChange={e => setCurrent(e.target.value)} show={showCurrent}
          setShow={setShowCurrent} placeholder="••••••••" testid="current-pw" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">New password</p>
        <PwInput value={newPw} onChange={e => setNewPw(e.target.value)} show={showNew}
          setShow={setShowNew} placeholder="At least 8 characters" testid="new-pw" />
        {newPw && !pwLong && <p className="text-xs text-red-500 mt-1">At least 8 characters required</p>}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Confirm new password</p>
        <PwInput value={confirm} onChange={e => setConfirm(e.target.value)} show={showConfirm}
          setShow={setShowConfirm} placeholder="••••••••" testid="confirm-pw" />
        {confirm && !pwMatch && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
        {confirm && pwMatch && pwLong && (
          <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check size={11} /> Passwords match</p>
        )}
      </div>
      {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
      <button type="submit" disabled={busy || !canSubmit} className="q-btn-primary w-full justify-center disabled:opacity-40">
        {busy ? "Sending code..." : t("profile.pw_send_code")}
      </button>
    </form>
  );

  return (
    <form onSubmit={confirm_} className="space-y-4">
      <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        A 6-digit code was sent to your email.
      </p>
      <input autoFocus type="text" inputMode="numeric" maxLength={6} required value={otpVal}
        onChange={(e) => setOtpVal(e.target.value.replace(/\D/g, ""))}
        className="q-input w-full text-center text-3xl tracking-[0.5em] font-semibold py-4" placeholder="000000" />
      {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
      <button type="submit" disabled={busy || otpVal.length < 6} className="q-btn-primary w-full justify-center disabled:opacity-40">
        {busy ? "Verifying..." : t("profile.pw_confirm_change")}
      </button>
      <div className="flex justify-between pt-1">
        <button type="button" onClick={() => { setStep("idle"); setErr(""); setOtpVal(""); }} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
        <button type="button" onClick={request} className="text-sm text-[#0066FF] hover:underline">Resend code</button>
      </div>
    </form>
  );
}

// ── Billing tab ───────────────────────────────────────────────────
function BillingTab({ user }) {
  const [busy, setBusy] = useState(false);
  const isPro = user?.plan === "pro";
  const isLifetime = user?.subscription_status === "lifetime";

  const upgrade = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/billing/checkout", { origin_url: window.location.origin });
      window.location.href = data.url;
    } catch { toast.error("Could not start checkout"); setBusy(false); }
  };

  const freeFeatures = ["Up to 3 quotes", "Up to 2 projects", "PDF export", "Email delivery", "Client management"];
  const proFeatures = ["Unlimited quotes & invoices", "Unlimited projects", "Team members (up to 5)", "PDF with your logo", "Priority email delivery", "Custom email signature", "Priority support"];

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 p-4 rounded-xl border-2 ${isPro ? "border-[#0066FF] bg-blue-50" : "border-[#E5E7EB] bg-gray-50"}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isPro ? "bg-[#0066FF]" : "bg-gray-200"}`}>
          <Sparkles size={16} className={isPro ? "text-white" : "text-gray-500"} />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-gray-900">{isPro ? (isLifetime ? "Pro — Lifetime" : "Pro plan") : "Free plan"}</p>
          <p className="text-xs text-gray-500">{isPro ? "All features unlocked" : "3 quotes · 2 projects"}</p>
        </div>
        {isPro && <span className="ml-auto text-xs font-semibold text-[#0066FF] bg-white border border-blue-200 px-2.5 py-1 rounded-full shrink-0">Active</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Free */}
        <div className={`rounded-xl border p-4 ${!isPro ? "border-[#0066FF]" : "border-[#E5E7EB]"}`}>
          <p className="text-sm font-semibold text-gray-900 mb-1">Free</p>
          <p className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: "Manrope" }}>€0<span className="text-xs font-normal text-gray-500 ml-1">forever</span></p>
          <ul className="space-y-1.5 mb-4">
            {freeFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                <Check size={11} className="text-emerald-500 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>
          <button disabled className="w-full text-xs py-2 rounded-lg border border-[#E5E7EB] text-gray-400 cursor-default">
            {!isPro ? "Current plan" : "Downgrade"}
          </button>
        </div>

        {/* Pro */}
        <div className={`rounded-xl border p-4 ${isPro ? "border-[#0066FF]" : "border-[#E5E7EB]"}`}>
          <p className="text-sm font-semibold text-gray-900 mb-1">Pro</p>
          <p className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: "Manrope" }}>€49<span className="text-xs font-normal text-gray-500 ml-1">/month</span></p>
          <ul className="space-y-1.5 mb-4">
            {proFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                <Check size={11} className="text-emerald-500 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>
          {isPro ? (
            <button disabled className="w-full text-xs py-2 rounded-lg border border-[#E5E7EB] text-gray-400 cursor-default">Active</button>
          ) : (
            <button onClick={upgrade} disabled={busy} className="w-full text-xs py-2 rounded-lg bg-[#0066FF] text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
              <Sparkles size={12} /> {busy ? "..." : "Upgrade — €49/mo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Profile (modal overlay) ──────────────────────────────────
const TABS = [
  { id: "profile", label: t("profile.tab_profile"), icon: User },
  { id: "password", label: t("profile.tab_password"), icon: Lock },
  { id: "billing", label: t("profile.tab_billing"), icon: CreditCard },
  { id: "notifications", label: t("profile.tab_notifications"), icon: Bell },
];

export default function Profile({ onClose }) {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [activeTab, setActiveTabState] = useState("profile");
  const setTab = (id) => setActiveTabState(id);
  const isPro = user?.plan === "pro";

  const close = onClose || (() => navigate(-1));

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8" style={{ backdropFilter: "blur(2px)" }} onClick={close}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 pt-6 pb-0 shrink-0">
          {/* Close button */}
          <div className="flex justify-end mb-4">
            <button onClick={close}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* User hero */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative shrink-0">
              <Avatar user={user} size={52} />
              {isPro && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0066FF] flex items-center justify-center shadow">
                  <Sparkles size={9} className="text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate" style={{ fontFamily: "Manrope" }}>{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold mt-1.5 px-2 py-0.5 rounded-full
                ${isPro ? "text-[#0066FF] bg-blue-50 border border-blue-100" : "text-gray-500 bg-gray-100 border border-gray-200"}`}>
                {isPro ? <><Sparkles size={9} /> Pro</> : "Free"}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center border-b border-[#E5E7EB] -mx-6 px-6">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                  ${activeTab === id
                    ? "border-[#0066FF] text-[#0066FF]"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "profile" && <ProfileTab user={user} onRefresh={refresh} />}
          {activeTab === "password" && <PasswordTab />}
          {activeTab === "billing" && <BillingTab user={user} />}
          {activeTab === "notifications" && (
            <div className="py-8 text-center">
              <Bell size={28} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Notification settings coming soon</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
