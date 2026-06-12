import React, { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import { api, API } from "../lib/api";
import { toast } from "sonner";
import { Upload, Lock } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useI18n, LANGUAGES } from "../lib/i18n";

const COLOR_PRESETS = [
  "#0066FF", "#10B981", "#8B5CF6", "#F59E0B",
  "#EF4444", "#EC4899", "#0EA5E9", "#0A0A0A",
];

export default function Settings() {
  const { refresh } = useAuth();
  const { t, setLang } = useI18n();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const [pwStep, setPwStep] = useState("idle"); // idle | otp
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwOtp, setPwOtp] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");

  useEffect(() => {
    api.get("/auth/me").then((r) => {
      const u = r.data;
      if (!u.accent_color) u.accent_color = "#0066FF";
      if (!u.language) u.language = "en";
      setForm(u);
    });
  }, []);

  if (!form) return <AppLayout title={t("settings.title")}><div className="text-gray-500 text-sm">…</div></AppLayout>;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        company_name: form.company_name || "",
        vat_number: form.vat_number || "",
        bank_account: form.bank_account || "",
        email_signature: form.email_signature || "",
        address: form.address || "",
        phone: form.phone || "",
        language: form.language || "en",
        accent_color: form.accent_color || "#0066FF",
      };
      const { data } = await api.put("/settings", payload);
      setForm(data); refresh();
      setLang(data.language || "en");
      toast.success(t("settings.save"));
    } catch (e) {
      toast.error("Failed to save");
    } finally { setBusy(false); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post("/settings/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((prev) => ({ ...prev, logo_path: res.data.logo_path, logo_data: res.data.logo_data }));
      refresh();
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Logo upload failed");
    }
  };

  const requestPasswordChange = async (e) => {
    e.preventDefault();
    setPwErr("");
    if (newPw !== confirmPw) { setPwErr("Passwords do not match."); return; }
    if (newPw.length < 8) { setPwErr("New password must be at least 8 characters."); return; }
    setPwBusy(true);
    try {
      await api.post("/auth/change-password/request", {
        current_password: currentPw,
        new_password: newPw,
      });
      setPwStep("otp");
      toast.success("Check your email for the confirmation code.");
    } catch (ex) {
      setPwErr(ex.response?.data?.detail || "Failed. Check your current password.");
    } finally { setPwBusy(false); }
  };

  const confirmPasswordChange = async (e) => {
    e.preventDefault();
    setPwBusy(true); setPwErr("");
    try {
      await api.post("/auth/change-password/verify", { otp: pwOtp });
      toast.success("Password changed successfully!");
      setPwStep("idle");
      setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwOtp("");
    } catch (ex) {
      setPwErr(ex.response?.data?.detail || "Invalid or expired code.");
    } finally { setPwBusy(false); }
  };

  const resendPasswordOtp = async () => {
    setPwErr("");
    try {
      await api.post("/auth/change-password/request", {
        current_password: currentPw,
        new_password: newPw,
      });
      toast.success("New code sent!");
    } catch {
      toast.error("Could not resend code.");
    }
  };

  const cancelPasswordChange = () => {
    setPwStep("idle"); setPwErr("");
    setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwOtp("");
  };

  return (
    <AppLayout
      title={t("settings.title")}
      action={
        <button form="settings-form" type="submit" disabled={busy} className="q-btn-primary" data-testid="save-settings-btn">
          {busy ? t("settings.saving") : t("settings.save")}
        </button>
      }
    >
      <form id="settings-form" onSubmit={save} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>{t("settings.preferences")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("settings.language")}>
                <select
                  data-testid="setting-language"
                  className="q-input"
                  value={form.language || "en"}
                  onChange={(e) => { setForm({ ...form, language: e.target.value }); setLang(e.target.value); }}
                >
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
              </Field>
              <Field label={t("settings.accent_color")}>
                <div className="flex items-center gap-3">
                  <input
                    data-testid="setting-color"
                    type="color"
                    value={form.accent_color || "#0066FF"}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-[#E5E7EB] cursor-pointer p-1 bg-white"
                  />
                  <input
                    type="text"
                    className="q-input flex-1 font-mono text-sm"
                    value={form.accent_color || "#0066FF"}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      type="button" key={c}
                      onClick={() => setForm({ ...form, accent_color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition ${form.accent_color === c ? "border-gray-900 scale-110" : "border-white shadow-sm"}`}
                      style={{ background: c }} title={c}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">{t("settings.color_help")}</p>
              </Field>
            </div>
          </div>

          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>{t("settings.company_info")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("settings.company_name")}>
                <input data-testid="setting-company-name" className="q-input" value={form.company_name || ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </Field>
              <Field label={t("settings.vat_number")}>
                <input data-testid="setting-vat" className="q-input" value={form.vat_number || ""} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
              </Field>
              <Field label={t("settings.phone")}>
                <input data-testid="setting-phone" className="q-input" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label={t("settings.bank")}>
                <input data-testid="setting-bank" className="q-input" value={form.bank_account || ""} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("settings.address")}>
                  <textarea data-testid="setting-address" rows={2} className="q-input" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>

          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>{t("settings.signature")}</h3>
            <textarea data-testid="setting-signature" rows={4} className="q-input" placeholder={`Best regards,\nYour Name`} value={form.email_signature || ""} onChange={(e) => setForm({ ...form, email_signature: e.target.value })} />
            <p className="text-xs text-gray-500 mt-2">{t("settings.signature_help")}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Logo */}
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>{t("settings.logo")}</h3>
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32 rounded-xl border border-[#E5E7EB] flex items-center justify-center overflow-hidden bg-gray-50">
                {form.logo_data ? (
                  <img src={form.logo_data} alt="Logo" className="w-full h-full object-contain" data-testid="logo-preview" />
                ) : (
                  <span className="text-gray-400 text-xs">{t("settings.no_logo")}</span>
                )}
              </div>
              <label className="q-btn-secondary cursor-pointer" data-testid="upload-logo-label">
                <Upload size={14} /> {t("settings.upload_logo")}
                <input data-testid="upload-logo-input" type="file" accept="image/*" className="hidden"
                  onChange={(e) => uploadLogo(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          {/* Account info */}
          <div className="q-card p-6">
            <h3 className="font-semibold mb-2" style={{ fontFamily: "Manrope" }}>{t("settings.account")}</h3>
            <p className="text-sm text-gray-700"><b>{form.name}</b></p>
            <p className="text-sm text-gray-500">{form.email}</p>
            <p className="text-xs text-gray-500 mt-2 uppercase tracking-wider">{t("settings.plan")}</p>
            <p className="text-sm font-medium">{form.plan === "pro" ? t("settings.pro_unlim") : t("settings.free_limit")}</p>
          </div>

          {/* Change password */}
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ fontFamily: "Manrope" }}>
              <Lock size={16} /> Change password
            </h3>

            {pwStep === "idle" && (
              <form onSubmit={requestPasswordChange} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Current password</label>
                  <input type="password" required value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className="q-input mt-1" placeholder="••••••••" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">New password</label>
                  <input type="password" required minLength={8} value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className={`q-input mt-1 ${newPw && newPw.length < 8 ? "border-red-400" : ""}`}
                    placeholder="At least 8 characters" />
                  {newPw && newPw.length < 8 && (
                    <p className="text-xs text-red-500 mt-1">At least 8 characters required</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Confirm new password</label>
                  <input type="password" required value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className={`q-input mt-1 ${confirmPw && confirmPw !== newPw ? "border-red-400" : confirmPw && confirmPw === newPw ? "border-green-400" : ""}`}
                    placeholder="••••••••" />
                  {confirmPw && confirmPw !== newPw && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                  )}
                  {confirmPw && confirmPw === newPw && newPw.length >= 8 && (
                    <p className="text-xs text-green-600 mt-1">Passwords match</p>
                  )}
                </div>
                {pwErr && <p className="text-sm text-red-600">{pwErr}</p>}
                <button type="submit" disabled={pwBusy || !currentPw || newPw.length < 8 || newPw !== confirmPw}
                  className="q-btn-secondary w-full justify-center text-sm disabled:opacity-50">
                  {pwBusy ? "Sending code…" : "Send confirmation code"}
                </button>
              </form>
            )}

            {pwStep === "otp" && (
              <form onSubmit={confirmPasswordChange} className="space-y-3">
                <p className="text-sm text-gray-600">Enter the 6-digit code sent to your email to confirm the password change.</p>
                <input
                  type="text" inputMode="numeric" maxLength={6} required autoFocus
                  value={pwOtp} onChange={(e) => setPwOtp(e.target.value.replace(/\D/g, ""))}
                  className="q-input text-center text-2xl tracking-[0.5em] font-semibold"
                  placeholder="000000"
                />
                {pwErr && <p className="text-sm text-red-600">{pwErr}</p>}
                <button type="submit" disabled={pwBusy || pwOtp.length < 6}
                  className="q-btn-primary w-full justify-center text-sm disabled:opacity-50">
                  {pwBusy ? "Verifying…" : "Confirm change"}
                </button>
                <div className="flex items-center justify-between pt-1">
                  <button type="button" onClick={cancelPasswordChange}
                    className="text-sm text-gray-400 hover:text-gray-600">
                    Cancel
                  </button>
                  <button type="button" onClick={resendPasswordOtp}
                    className="text-sm q-link">
                    Didn't get a code? Resend
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
