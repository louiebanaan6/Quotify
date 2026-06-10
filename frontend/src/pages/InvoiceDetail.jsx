import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppLayout, { StatusBadge, EUR } from "../components/AppLayout";
import { api, API } from "../lib/api";
import { Download, Mail, Trash2, ArrowLeft, Check, Calendar, CreditCard } from "lucide-react";
import { toast } from "sonner";

export default function InvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [inv, setInv] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    const r = await api.get(`/invoices/${id}`);
    setInv(r.data);
  };
  useEffect(() => { load(); }, [id]);

  const send = async () => {
    if (!window.confirm(`Send invoice to ${inv.client_email}?`)) return;
    setSending(true);
    try {
      const { data } = await api.post(`/invoices/${id}/send`, {});
      if (data.mocked) toast.success("Invoice sent (mocked email)");
      else toast.success("Invoice sent");
      load();
    } catch {
      toast.error("Failed to send");
    } finally { setSending(false); }
  };

  const markPaid = async () => {
    await api.post(`/invoices/${id}/mark-paid`);
    toast.success("Marked as paid");
    load();
  };

  const updateDueDate = async (d) => {
    await api.put(`/invoices/${id}`, { due_date: new Date(d).toISOString() });
    toast.success("Due date updated");
    load();
  };

  const remove = async () => {
    if (!window.confirm("Delete this invoice?")) return;
    await api.delete(`/invoices/${id}`);
    toast.success("Deleted");
    nav("/invoices");
  };

  const downloadPdf = async () => {
    const token = localStorage.getItem("quotify_token");
    const res = await fetch(`${API}/invoices/${id}/pdf`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `invoice-${inv.invoice_number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!inv) return <AppLayout title="Invoice"><div className="text-gray-500 text-sm">Loading…</div></AppLayout>;

  return (
    <AppLayout
      title={`Invoice ${inv.invoice_number}`}
      action={
        <div className="flex flex-wrap gap-2">
          <button onClick={() => nav("/invoices")} className="q-btn-secondary" data-testid="back-to-invoices"><ArrowLeft size={16}/> Back</button>
          <button onClick={downloadPdf} className="q-btn-secondary" data-testid="invoice-pdf-btn"><Download size={16}/> PDF</button>
          <button onClick={send} disabled={sending} className="q-btn-primary" data-testid="invoice-send-btn"><Mail size={16}/> {sending ? "Sending…" : "Send"}</button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 q-card p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Bill to</div>
              <div className="font-medium text-gray-900">{inv.client_name}</div>
              <div className="text-sm text-gray-500">{inv.client_email}</div>
            </div>
            <StatusBadge status={inv.status} />
          </div>

          {inv.project_description && (
            <div className="mb-6">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Project</div>
              <p className="text-sm text-gray-700 whitespace-pre-line">{inv.project_description}</p>
            </div>
          )}

          <table className="q-table mb-6">
            <thead>
              <tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody>
              {inv.line_items.map((li, i) => (
                <tr key={i}>
                  <td>{li.description}</td>
                  <td className="text-right">{li.quantity}</td>
                  <td className="text-right">{EUR(li.unit_price)}</td>
                  <td className="text-right font-medium">{EUR(li.quantity * li.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{EUR(inv.subtotal)}</span></div>
              {inv.discount_type !== "none" && inv.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount {inv.discount_type === "percentage" ? `(${inv.discount_value}%)` : "(fixed)"}</span>
                  <span>− {EUR(inv.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">VAT ({Math.round(inv.vat_rate*100)}%)</span><span>{EUR(inv.vat)}</span></div>
              <div className="border-t border-[#E5E7EB] pt-2 flex justify-between text-base font-semibold" style={{ fontFamily: "Manrope" }} data-testid="invoice-total">
                <span>Total</span><span>{EUR(inv.total)}</span>
              </div>
            </div>
          </div>

          {inv.notes && (
            <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Notes</div>
              <p className="text-sm text-gray-700 whitespace-pre-line">{inv.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="q-card p-6">
            <h3 className="font-semibold mb-3" style={{ fontFamily: "Manrope" }}>Payment</h3>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <Calendar size={14}/>
              <input
                data-testid="invoice-due-date"
                type="date"
                className="q-input"
                value={inv.due_date?.slice(0, 10) || ""}
                onChange={(e) => updateDueDate(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500 mb-3">Default 30 days after creation</p>
            {inv.status !== "paid" ? (
              <button onClick={markPaid} className="q-btn-primary w-full justify-center" data-testid="mark-paid-btn"><Check size={14}/> Mark as paid</button>
            ) : (
              <div className="text-sm text-emerald-700 flex items-center gap-2"><Check size={14}/> Paid on {inv.paid_at?.slice(0, 10)}</div>
            )}
          </div>

          <div className="q-card p-6">
            <h3 className="font-semibold mb-3" style={{ fontFamily: "Manrope" }}>Linked quote</h3>
            <button onClick={() => nav(`/quotes/${inv.quote_id}`)} className="q-btn-secondary w-full justify-center" data-testid="open-source-quote">
              <CreditCard size={14}/> Quote #{inv.quote_number}
            </button>
          </div>

          <div className="q-card p-6">
            <h3 className="font-semibold mb-3" style={{ fontFamily: "Manrope" }}>Danger zone</h3>
            <button onClick={remove} className="q-btn-secondary w-full justify-center text-red-600" data-testid="delete-invoice-btn"><Trash2 size={14}/> Delete invoice</button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
