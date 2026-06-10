import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppLayout, { EUR } from "../components/AppLayout";
import { api, formatApiErrorDetail } from "../lib/api";
import { Trash2, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const VAT_RATE = 0.21;

const emptyItem = () => ({ description: "", quantity: 1, unit_price: 0 });

export default function QuoteForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const nav = useNavigate();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    client_id: "",
    client_name: "",
    client_email: "",
    project_description: "",
    notes: "",
    line_items: [emptyItem()],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/clients").then((r) => setClients(r.data));
    if (isEdit) {
      api.get(`/quotes/${id}`).then((r) => {
        const q = r.data;
        setForm({
          client_id: q.client_id || "",
          client_name: q.client_name,
          client_email: q.client_email,
          project_description: q.project_description || "",
          notes: q.notes || "",
          line_items: q.line_items?.length ? q.line_items : [emptyItem()],
        });
      });
    }
  }, [id, isEdit]);

  const { subtotal, vat, total } = useMemo(() => {
    const s = form.line_items.reduce((acc, li) => acc + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);
    return { subtotal: s, vat: s * VAT_RATE, total: s * (1 + VAT_RATE) };
  }, [form.line_items]);

  const setItem = (i, key, val) => {
    setForm((f) => ({ ...f, line_items: f.line_items.map((li, idx) => idx === i ? { ...li, [key]: val } : li) }));
  };
  const addItem = () => setForm((f) => ({ ...f, line_items: [...f.line_items, emptyItem()] }));
  const removeItem = (i) => setForm((f) => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));

  const onClientPick = (cid) => {
    const c = clients.find((x) => x.id === cid);
    setForm((f) => ({ ...f, client_id: cid, client_name: c?.name || f.client_name, client_email: c?.email || f.client_email }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const payload = {
      ...form,
      line_items: form.line_items
        .filter((li) => li.description.trim())
        .map((li) => ({ description: li.description, quantity: Number(li.quantity) || 0, unit_price: Number(li.unit_price) || 0 })),
    };
    try {
      const { data } = isEdit
        ? await api.put(`/quotes/${id}`, payload)
        : await api.post("/quotes", payload);
      toast.success(isEdit ? "Quote updated" : "Quote created");
      nav(`/quotes/${data.id}`);
    } catch (e) {
      setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally { setBusy(false); }
  };

  return (
    <AppLayout
      title={isEdit ? "Edit quote" : "New quote"}
      action={
        <div className="flex gap-2">
          <button onClick={() => nav(-1)} className="q-btn-secondary" data-testid="quote-form-cancel"><ArrowLeft size={16}/> Back</button>
          <button form="quote-form" type="submit" disabled={busy} className="q-btn-primary" data-testid="quote-form-save">
            {busy ? "Saving…" : (isEdit ? "Save changes" : "Create quote")}
          </button>
        </div>
      }
    >
      <form id="quote-form" onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>Client</h3>
            {clients.length > 0 && (
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Select client (optional)</label>
                <select data-testid="quote-client-select" value={form.client_id} onChange={(e) => onClientPick(e.target.value)} className="q-input mt-1.5">
                  <option value="">— New client —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Client name</label>
                <input data-testid="quote-client-name" required className="q-input mt-1.5" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Client email</label>
                <input data-testid="quote-client-email" required type="email" className="q-input mt-1.5" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>Project</h3>
            <textarea data-testid="quote-project-desc" rows={3} className="q-input" placeholder="Describe the project briefly" value={form.project_description} onChange={(e) => setForm({ ...form, project_description: e.target.value })} />
          </div>

          <div className="q-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ fontFamily: "Manrope" }}>Line items</h3>
              <button type="button" onClick={addItem} className="q-btn-secondary" data-testid="add-line-item"><Plus size={14}/> Add item</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase tracking-wider px-1">
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit (€)</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-1"></div>
              </div>
              {form.line_items.map((li, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`line-item-${i}`}>
                  <input data-testid={`item-desc-${i}`} className="q-input col-span-6" placeholder="Item description" value={li.description} onChange={(e) => setItem(i, "description", e.target.value)} />
                  <input data-testid={`item-qty-${i}`} className="q-input col-span-2 text-right" type="number" min="0" step="0.01" value={li.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} />
                  <input data-testid={`item-price-${i}`} className="q-input col-span-2 text-right" type="number" min="0" step="0.01" value={li.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} />
                  <div className="col-span-1 text-right text-sm font-medium">{EUR((Number(li.quantity) || 0) * (Number(li.unit_price) || 0))}</div>
                  <button type="button" onClick={() => removeItem(i)} className="col-span-1 text-gray-400 hover:text-red-500 flex justify-end" data-testid={`remove-item-${i}`}><Trash2 size={16}/></button>
                </div>
              ))}
            </div>
          </div>

          <div className="q-card p-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>Notes</h3>
            <textarea data-testid="quote-notes" rows={3} className="q-input" placeholder="Optional notes (payment terms, validity, etc.)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="q-card p-6 sticky top-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Manrope" }}>Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{EUR(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">VAT (21%)</span><span>{EUR(vat)}</span></div>
              <div className="border-t border-[#E5E7EB] my-2"></div>
              <div className="flex justify-between text-base font-semibold" style={{ fontFamily: "Manrope" }} data-testid="quote-total">
                <span>Total</span><span>{EUR(total)}</span>
              </div>
            </div>
            {err && <div className="text-sm text-red-600 mt-4" data-testid="quote-form-error">{err}</div>}
          </div>
        </div>
      </form>
    </AppLayout>
  );
}
