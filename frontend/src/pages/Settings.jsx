// frontend/src/pages/Settings.jsx
import React, { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useProject } from "../lib/ProjectContext";
import { useI18n, LANGUAGES } from "../lib/i18n";

const COLOR_PRESETS = [
  "#0066FF", "#10B981", "#8B5CF6", "#F59E0B",
  "#EF4444", "#EC4899", "#0EA5E9", "#0A0A0A",
];

const EMPTY_FORM = {
  company_name: "",
  vat_number: "",
  bank_account: "",
  email_signature: "",
  address: "",
  phone: "",
  language: "en",
  accent_color: "#0066FF",
  logo_data: null,
};

export default function Settings() {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const { t, setLang } = useI18n();

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load project settings when active project changes
  useEffect(() => {
    if (!activeProject) { setForm({ ...EMPTY_FORM }); setLoading(false); return; }
    setLoading(true);
    api.get(`/projects/${activeProject.id}/settings`)
      .then((r) => {
        const p = r.data;
        setForm({
          company_name: p.company_name || "",
          vat_number: p.vat_number || "",
          bank_account: p.bank_account || "",
          email_signature: p.email_signature || "",
          address: p.address || "",
          phone: p.phone || "",
          language: p.language || user?.language || "en",
          accent_color: p.accent_color || user?.accent_color || "#0066FF",
          logo_data: p.logo_data || null,
        });
      })
      .catch(() => setForm({ ...EMPTY_FORM }))
      .finally(() => setLoading(false));
  }, [activeProject?.id]);

  const save = async (e) => {
    e.preventDefault();
    if (!activeProject) { toast.error("No active project selected"); return; }
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
      await api.put(`/projects/${activeProject.id}/settings`, payload);
      setLang(form.language || "en");
      toast.success(t("settings.save"));
    } catch { toast.error("Failed to save"); } finally { setBusy(false); }
  };

  const uploadLogo = async (file) => {
    if (!file || !activeProject) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`/projects/${activeProject.id}/settings/logo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((prev) => ({ ...prev, logo_data: res.data.logo_data }));
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Logo upload failed");
    }
  };

  if (loading) {
    return (
      <AppLayout title={t("settings.title")}>
        <div className="text-gray-400 text-sm">Loading…</div>
      </AppLayout>
    );
  }

  if (!activeProject) {
    return (
      <AppLayout title={t("settings.title")}>
        <div className="q-card p-8 text-center max-w-md">
          <p className="text-sm text-gray-500">No active project. Create or select a project first.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title={t("settings.title")}
      action={
        <button
          form="settings-form"
          type="submit"
          disabled={busy}
          className="q-btn-primary"
          data-testid="save-settings-btn"
        >
          {busy ? t("settings.saving") : t("settings.save")}
        </button>
      }
    >
      {/* Project context banner */}
      <div className="mb-6 flex items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{activeProject.name}</span>
        <span>·</span>
        <span>Settings are saved per project</span>
      </div>

      <form id="settings-form" onSubmit={save} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Preferences */}
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>
              {t("settings.preferences")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("settings.language")}>
                <select
                  data-testid="setting-language"
                  className="q-input"
                  value={form.language || "en"}
                  onChange={(e) => { setForm({ ...form, language: e.target.value }); setLang(e.target.value); }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                  ))}
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
                      type="button"
                      key={c}
                      onClick={() => setForm({ ...form, accent_color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform
                        ${form.accent_color === c ? "border-gray-900 scale-110" : "border-white shadow-sm"}`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">{t("settings.color_help")}</p>
              </Field>
            </div>
          </div>

          {/* Company info */}
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>
              {t("settings.company_info")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("settings.company_name")}>
                <input
                  data-testid="setting-company-name"
                  className="q-input"
                  value={form.company_name || ""}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                />
              </Field>
              <Field label={t("settings.vat_number")}>
                <input
                  data-testid="setting-vat"
                  className="q-input"
                  value={form.vat_number || ""}
                  onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
                />
              </Field>
              <Field label={t("settings.phone")}>
                <input
                  data-testid="setting-phone"
                  className="q-input"
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label={t("settings.bank")}>
                <input
                  data-testid="setting-bank"
                  className="q-input"
                  value={form.bank_account || ""}
                  onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("settings.address")}>
                  <textarea
                    data-testid="setting-address"
                    rows={2}
                    className="q-input"
                    value={form.address || ""}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Email signature */}
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>
              {t("settings.signature")}
            </h3>
            <textarea
              data-testid="setting-signature"
              rows={4}
              className="q-input"
              placeholder={`Best regards,\nYour Name`}
              value={form.email_signature || ""}
              onChange={(e) => setForm({ ...form, email_signature: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-2">{t("settings.signature_help")}</p>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Logo */}
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>
              {t("settings.logo")}
            </h3>
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32 rounded-xl border border-[#E5E7EB] flex items-center justify-center overflow-hidden bg-gray-50">
                {form.logo_data ? (
                  <img
                    src={form.logo_data}
                    alt="Logo"
                    className="w-full h-full object-contain"
                    data-testid="logo-preview"
                  />
                ) : (
                  <span className="text-gray-400 text-xs">{t("settings.no_logo")}</span>
                )}
              </div>
              <label className="q-btn-secondary cursor-pointer" data-testid="upload-logo-label">
                <Upload size={14} /> {t("settings.upload_logo")}
                <input
                  data-testid="upload-logo-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadLogo(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          {/* Project info */}
          <div className="q-card p-6">
            <h3 className="font-semibold mb-3" style={{ fontFamily: "Manrope" }}>Project</h3>
            <p className="text-sm font-medium text-gray-900">{activeProject.name}</p>
            {activeProject.description && (
              <p className="text-xs text-gray-500 mt-0.5">{activeProject.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">Plan</p>
            <p className="text-sm font-medium text-gray-800 mt-0.5">
              {user?.plan === "pro" ? "Pro — unlimited" : "Free — 3 quotes max"}
            </p>
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
