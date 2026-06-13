// frontend/src/pages/Profile.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n, LANGUAGES } from "../lib/i18n";
import { toast } from "sonner";
import {
  Settings, Camera, Check, Sparkles, Lock, User, Bell,
  CreditCard, ChevronLeft, Eye, EyeOff
} from "lucide-react";

// ─── Avatar ────────────────────────────────────────────────────
function Avatar({ user, size = 80 }) {
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
      style={{ width: size, height: size, background: "#0066FF", fontSize: size * 0.36 }}
      className="rounded-full flex items-center justify-center text-white font-semibold select-none"
    >
      {initials}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────
const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "password", label: "Password", icon: Lock },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
];

// ─── Profile tab ────────────────────────────────────────────────
function ProfileTab({ user, onRefresh }) {
  const { setLang } = useI18n();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [language, setLanguage] = useState(user?.language || "en");
  const [emailStep, setEmailStep] = useState("idle"); // idle | otp
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
      toast.success("Photo updated");
    } catch { toast.error("Upload failed"); }
  };

  const saveName = async () => {
    if (!name.trim() || name === user?.name) return;
    setSavingName(true);
    try {
      await api.put("/settings", { name: name.trim() });
      await onRefresh();
      toast.success("Name updated");
    } catch { toast.error("Failed to save"); } finally { setSavingName(false); }
  };

  const requestEmailChange = async () => {
    if (!email || email === user?.email) return;
    setSavingEmail(true);
    try {
      await api.post("/auth/change-email/request", { new_email: email });
      setEmailStep("otp");
      toast.success("Code sent to your current email");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally { setSavingEmail(false); }
  };

  const confirmEmailChange = async () => {
    if (otp.length < 6) return;
    setSavingEmail(true);
    try {
      await api.post("/auth/change-email/verify", { otp });
      await onRefresh();
      setEmailStep("idle");
      setOtp("");
      toast.success("Email updated");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid code");
    } finally { setSavingEmail(false); }
  };

  const saveLang = async (val) => {
    setLanguage(val);
    setSavingLang(true);
    try {
      await api.put("/settings", { language: val });
      setLang(val);
      await onRefresh();
      toast.success("Language updated");
    } catch { toast.error("Failed"); } finally { setSavingLang(false); }
  };

  return (
    <div className="space-y-6 max-w-lg">
      {/* Photo */}
      <div className="q-card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4" style={{ fontFamily: "Manrope" }}>
          Profile photo
        </h3>
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <Avatar user={{ ...user, profile_photo: photoPreview }} size={72} />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#0066FF] flex items-center justify-center shadow-md hover:bg-blue-700 transition-colors"
              title="Upload photo"
            >
              <Camera size={13} className="text-white" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => uploadPhoto(e.target.files?.[0])}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs text-[#0066FF] hover:underline mt-1.5 block"
            >
              Change photo
            </button>
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="q-card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4" style={{ fontFamily: "Manrope" }}>
          Full name
        </h3>
        <div className="flex gap-2">
          <input
            className="q-input flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            onKeyDown={(e) => e.key === "Enter" && saveName()}
          />
          <button
            onClick={saveName}
            disabled={savingName || !name.trim() || name === user?.name}
            className="q-btn-primary shrink-0 disabled:opacity-40"
          >
            {savingName ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Email */}
      <div className="q-card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1" style={{ fontFamily: "Manrope" }}>
          Email address
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          A confirmation code will be sent to your current email.
        </p>
        {emailStep === "idle" ? (
          <div className="flex gap-2">
            <input
              className="q-input flex-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
            />
            <button
              onClick={requestEmailChange}
              disabled={savingEmail || !email || email === user?.email}
              className="q-btn-secondary shrink-0 disabled:opacity-40"
            >
              {savingEmail ? "Sending…" : "Change"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Code sent to <strong>{user?.email}</strong>. Enter it below to confirm.
            </p>
            <div className="flex gap-2">
              <input
                autoFocus
                className="q-input flex-1 text-center text-xl tracking-[0.4em] font-semibold"
                maxLength={6}
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
              />
              <button
                onClick={confirmEmailChange}
                disabled={savingEmail || otp.length < 6}
                className="q-btn-primary shrink-0 disabled:opacity-40"
              >
                {savingEmail ? "Verifying…" : "Confirm"}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setEmailStep("idle"); setOtp(""); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={requestEmailChange}
                className="text-xs text-[#0066FF] hover:underline"
              >
                Resend code
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Language */}
      <div className="q-card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4" style={{ fontFamily: "Manrope" }}>
          Language
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => saveLang(l.code)}
              disabled={savingLang}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                ${language === l.code
                  ? "border-[#0066FF] bg-blue-50 text-[#0066FF]"
                  : "border-[#E5E7EB] text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
              {language === l.code && <Check size={13} className="ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Password tab ───────────────────────────────────────────────
function PasswordTab() {
  const [step, setStep] = useState("idle"); // idle | otp
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
    e.preventDefault();
    setErr("");
    if (!pwMatch) { setErr("Passwords do not match."); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password/request", {
        current_password: current,
        new_password: newPw,
      });
      setStep("otp");
      toast.success("Code sent to your email");
    } catch (ex) {
      setErr(ex.response?.data?.detail || "Check your current password.");
    } finally { setBusy(false); }
  };

  const confirm_ = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.post("/auth/change-password/verify", { otp: otpVal });
      toast.success("Password changed");
      setStep("idle");
      setCurrent(""); setNewPw(""); setConfirm(""); setOtpVal("");
    } catch (ex) {
      setErr(ex.response?.data?.detail || "Invalid code.");
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setErr("");
    try {
      await api.post("/auth/change-password/request", { current_password: current, new_password: newPw });
      toast.success("New code sent");
    } catch { toast.error("Could not resend."); }
  };

  return (
    <div className="max-w-md">
      <div className="q-card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-5" style={{ fontFamily: "Manrope" }}>
          Change password
        </h3>

        {step === "idle" ? (
          <form onSubmit={request} className="space-y-4">
            {/* Current */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current password</label>
              <div className="relative mt-1.5">
                <input
                  type={showCurrent ? "text" : "password"}
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="q-input pr-10 w-full"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">New password</label>
              <div className="relative mt-1.5">
                <input
                  type={showNew ? "text" : "password"}
                  required
                  minLength={8}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className={`q-input pr-10 w-full ${newPw && !pwLong ? "border-red-400 focus:ring-red-100" : ""}`}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {newPw && !pwLong && (
                <p className="text-xs text-red-500 mt-1">At least 8 characters required</p>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Confirm new password</label>
              <div className="relative mt-1.5">
                <input
                  type={showConfirm ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={`q-input pr-10 w-full
                    ${confirm && !pwMatch ? "border-red-400 focus:ring-red-100" : ""}
                    ${confirm && pwMatch && pwLong ? "border-emerald-400 focus:ring-emerald-100" : ""}
                  `}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirm && !pwMatch && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
              {confirm && pwMatch && pwLong && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <Check size={12} /> Passwords match
                </p>
              )}
            </div>

            {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="q-btn-primary w-full justify-center disabled:opacity-40"
            >
              {busy ? "Sending code…" : "Send confirmation code"}
            </button>
          </form>
        ) : (
          <form onSubmit={confirm_} className="space-y-4">
            <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              A 6-digit code was sent to your email. Enter it below to confirm the password change.
            </p>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={otpVal}
              onChange={(e) => setOtpVal(e.target.value.replace(/\D/g, ""))}
              className="q-input w-full text-center text-3xl tracking-[0.5em] font-semibold py-4"
              placeholder="000000"
            />
            {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
            <button
              type="submit"
              disabled={busy || otpVal.length < 6}
              className="q-btn-primary w-full justify-center disabled:opacity-40"
            >
              {busy ? "Verifying…" : "Confirm change"}
            </button>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => { setStep("idle"); setErr(""); setOtpVal(""); }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
              <button type="button" onClick={resend} className="text-sm text-[#0066FF] hover:underline">
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Billing tab ────────────────────────────────────────────────
function BillingTab({ user, onRefresh }) {
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

  const freeFeatures = [
    "Up to 3 quotes",
    "Up to 2 projects",
    "PDF export",
    "Email delivery",
    "Client management",
  ];
  const proFeatures = [
    "Unlimited quotes & invoices",
    "Unlimited projects",
    "Team members (up to 5)",
    "PDF with your logo",
    "Priority email delivery",
    "Custom email signature",
    "Quote status tracking",
    "Priority support",
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Current plan badge */}
      <div className="q-card p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPro ? "bg-[#0066FF]" : "bg-gray-100"}`}>
          <Sparkles size={18} className={isPro ? "text-white" : "text-gray-500"} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">
            {isPro ? (isLifetime ? "Pro — Lifetime" : "Pro plan") : "Free plan"}
          </p>
          <p className="text-xs text-gray-500">
            {isPro ? "All features unlocked" : "3 quotes · 2 projects · basic features"}
          </p>
        </div>
        {isPro && (
          <span className="text-xs font-medium text-[#0066FF] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
            Active
          </span>
        )}
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Free */}
        <div className={`q-card p-6 ${!isPro ? "ring-2 ring-[#0066FF]" : ""}`}>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900" style={{ fontFamily: "Manrope" }}>Free</h3>
            {!isPro && (
              <span className="text-[10px] font-semibold text-[#0066FF] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                Current
              </span>
            )}
          </div>
          <div className="mt-3 mb-5">
            <span className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>€0</span>
            <span className="text-sm text-gray-500 ml-1">forever</span>
          </div>
          <ul className="space-y-2 mb-6">
            {freeFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>
          <button disabled className="q-btn-secondary w-full justify-center opacity-60 cursor-default">
            {!isPro ? "Current plan" : "Downgrade"}
          </button>
        </div>

        {/* Pro */}
        <div className={`q-card p-6 ${isPro ? "ring-2 ring-[#0066FF]" : ""}`}>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900" style={{ fontFamily: "Manrope" }}>Pro</h3>
            {isPro && (
              <span className="text-[10px] font-semibold text-[#0066FF] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                {isLifetime ? "Lifetime" : "Active"}
              </span>
            )}
          </div>
          <div className="mt-3 mb-5">
            <span className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>€49</span>
            <span className="text-sm text-gray-500 ml-1">/month</span>
          </div>
          <ul className="space-y-2 mb-6">
            {proFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>
          {isPro ? (
            <button disabled className="q-btn-secondary w-full justify-center opacity-60 cursor-default">Active</button>
          ) : (
            <button
              onClick={upgrade}
              disabled={busy}
              className="q-btn-primary w-full justify-center"
            >
              <Sparkles size={15} /> {busy ? "Redirecting…" : "Upgrade to Pro — €49/mo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Notifications tab ──────────────────────────────────────────
function NotificationsTab() {
  return (
    <div className="max-w-lg">
      <div className="q-card p-8 text-center">
        <Bell size={32} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500">Notification settings coming soon</p>
        <p className="text-xs text-gray-400 mt-1">Email and in-app notification preferences will appear here.</p>
      </div>
    </div>
  );
}

// ─── Main Profile page ──────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refresh } = useAuth();
  const activeTab = searchParams.get("tab") || "profile";

  const setTab = (id) => setSearchParams({ tab: id }, { replace: true });

  const isPro = user?.plan === "pro";

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Top header */}
      <div className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-4xl mx-auto px-6 h-[72px] flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            title="Back"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-semibold tracking-tight flex-1" style={{ fontFamily: "Manrope" }}>
            Account
          </h1>
          <button
            onClick={() => navigate("/settings")}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Profile hero */}
        <div className="flex items-center gap-5 mb-8">
          <div className="relative">
            <Avatar user={user} size={72} />
            {isPro && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0066FF] flex items-center justify-center shadow">
                <Sparkles size={10} className="text-white" />
              </div>
            )}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Manrope" }}>
              {user?.name}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
            <span className={`inline-flex items-center gap-1 text-xs font-medium mt-2 px-2.5 py-1 rounded-full
              ${isPro
                ? "text-[#0066FF] bg-blue-50 border border-blue-100"
                : "text-gray-600 bg-gray-100 border border-gray-200"
              }`}
            >
              {isPro ? <><Sparkles size={10} /> Pro plan</> : "Free plan"}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E5E7EB] mb-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
                ${activeTab === id
                  ? "border-[#0066FF] text-[#0066FF]"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "profile" && <ProfileTab user={user} onRefresh={refresh} />}
        {activeTab === "password" && <PasswordTab />}
        {activeTab === "billing" && <BillingTab user={user} onRefresh={refresh} />}
        {activeTab === "notifications" && <NotificationsTab />}
      </div>
    </div>
  );
}
