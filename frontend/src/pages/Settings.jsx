import React, { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import { api, API } from "../lib/api";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function Settings() {
  const { refresh } = useAuth();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/auth/me").then((r) => setForm(r.data));
  }, []);

  if (!form) return <AppLayout title="Settings"><div className="text-gray-500 text-sm">Loading…</div></AppLayout>;

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
      };
      const { data } = await api.put("/settings", payload);
      setForm(data); refresh();
      toast.success("Settings saved");
    } catch (e) {
      toast.error("Failed to save");
    } finally { setBusy(false); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const token = localStorage.getItem("quotify_token");
      const res = await fetch(`${API}/settings/logo`, {
        method: "POST", credentials: "include", body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setForm({ ...form, logo_path: data.logo_path });
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error("Logo upload failed");
    }
  };

  return (
    <AppLayout
      title="Settings"
      action={
        <button form="settings-form" type="submit" disabled={busy} className="q-btn-primary" data-testid="save-settings-btn">{busy ? "Saving…" : "Save changes"}</button>
      }
    >
      <form id="settings-form" onSubmit={save} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>Company information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company name">
                <input data-testid="setting-company-name" className="q-input" value={form.company_name || ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </Field>
              <Field label="VAT number">
                <input data-testid="setting-vat" className="q-input" value={form.vat_number || ""} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input data-testid="setting-phone" className="q-input" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Bank account">
                <input data-testid="setting-bank" className="q-input" value={form.bank_account || ""} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <textarea data-testid="setting-address" rows={2} className="q-input" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>

          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>Email signature</h3>
            <textarea data-testid="setting-signature" rows={4} className="q-input" placeholder={`Best regards,\nYour Name\nYour Company`} value={form.email_signature || ""} onChange={(e) => setForm({ ...form, email_signature: e.target.value })} />
            <p className="text-xs text-gray-500 mt-2">Appears at the bottom of every quote email and PDF.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>Company logo</h3>
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32 rounded-xl border border-[#E5E7EB] flex items-center justify-center overflow-hidden bg-gray-50">
                {form.logo_path ? (
                  <img src={`${API}/files/${form.logo_path}`} alt="Logo" className="w-full h-full object-contain" data-testid="logo-preview" />
                ) : (
                  <span className="text-gray-400 text-xs">No logo</span>
                )}
              </div>
              <label className="q-btn-secondary cursor-pointer" data-testid="upload-logo-label">
                <Upload size={14}/> Upload logo
                <input data-testid="upload-logo-input" type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          <div className="q-card p-6">
            <h3 className="font-semibold mb-2" style={{ fontFamily: "Manrope" }}>Account</h3>
            <p className="text-sm text-gray-700"><b>{form.name}</b></p>
            <p className="text-sm text-gray-500">{form.email}</p>
            <p className="text-xs text-gray-500 mt-2 uppercase tracking-wider">Plan</p>
            <p className="text-sm font-medium">{form.plan === "pro" ? "Pro — unlimited" : "Free — 3 quotes max"}</p>
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
