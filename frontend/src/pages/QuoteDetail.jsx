import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppLayout, { StatusBadge, EUR } from "../components/AppLayout";
import { api, API } from "../lib/api";
import { Download, Mail, Edit, Trash2, ArrowLeft, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function QuoteDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    const r = await api.get(`/quotes/${id}`);
    setQ(r.data);
  };
  useEffect(() => { load(); }, [id]);

  const send = async () => {
    if (!window.confirm(`Send quote to ${q.client_email}?`)) return;
    setSending(true);
    try {
      const { data } = await api.post(`/quotes/${id}/send`, {});
      if (data.mocked) toast.success("Quote sent (mocked email — add RESEND_API_KEY to enable real delivery)");
      else toast.success("Quote sent");
      load();
    } catch (e) {
      toast.error("Failed to send quote");
    } finally { setSending(false); }
  };

  const setStatus = async (status) => {
    await api.put(`/quotes/${id}`, { status });
    toast.success(`Marked as ${status}`);
    load();
  };

  const remove = async () => {
    if (!window.confirm("Delete this quote?")) return;
    await api.delete(`/quotes/${id}`);
    toast.success("Quote deleted");
    nav("/quotes");
  };

  const downloadPdf = async () => {
    const token = localStorage.getItem("quotify_token");
    const res = await fetch(`${API}/quotes/${id}/pdf`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `quote-${q.quote_number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!q) return <AppLayout title="Quote"><div className="text-gray-500 text-sm">Loading…</div></AppLayout>;

  return (
    <AppLayout
      title={`Quote #${q.quote_number}`}
      action={
        <div className="flex flex-wrap gap-2">
          <button onClick={() => nav("/quotes")} className="q-btn-secondary" data-testid="back-to-quotes"><ArrowLeft size={16}/> Back</button>
          <button onClick={() => nav(`/quotes/${id}/edit`)} className="q-btn-secondary" data-testid="edit-quote-btn"><Edit size={16}/> Edit</button>
          <button onClick={downloadPdf} className="q-btn-secondary" data-testid="download-pdf-btn"><Download size={16}/> PDF</button>
          <button onClick={send} disabled={sending} className="q-btn-primary" data-testid="send-quote-btn"><Mail size={16}/> {sending ? "Sending…" : "Send"}</button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 q-card p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Bill to</div>
              <div className="font-medium text-gray-900" data-testid="detail-client-name">{q.client_name}</div>
              <div className="text-sm text-gray-500">{q.client_email}</div>
            </div>
            <StatusBadge status={q.status} />
          </div>

          {q.project_description && (
            <div className="mb-6">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Project</div>
              <p className="text-sm text-gray-700 whitespace-pre-line">{q.project_description}</p>
            </div>
          )}

          <table className="q-table mb-6">
            <thead>
              <tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody>
              {q.line_items.map((li, i) => (
                <tr key={i} data-testid={`detail-item-${i}`}>
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
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{EUR(q.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">VAT ({Math.round(q.vat_rate*100)}%)</span><span>{EUR(q.vat)}</span></div>
              <div className="border-t border-[#E5E7EB] pt-2 flex justify-between text-base font-semibold" style={{ fontFamily: "Manrope" }} data-testid="detail-total">
                <span>Total</span><span>{EUR(q.total)}</span>
              </div>
            </div>
          </div>

          {q.notes && (
            <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Notes</div>
              <p className="text-sm text-gray-700 whitespace-pre-line">{q.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="q-card p-6">
            <h3 className="font-semibold mb-3" style={{ fontFamily: "Manrope" }}>Status</h3>
            <p className="text-xs text-gray-500 mb-3">Update the status after client response</p>
            <div className="space-y-2">
              <button onClick={() => setStatus("accepted")} className="q-btn-secondary w-full justify-start text-emerald-700" data-testid="mark-accepted"><Check size={14}/> Mark accepted</button>
              <button onClick={() => setStatus("declined")} className="q-btn-secondary w-full justify-start text-red-600" data-testid="mark-declined"><X size={14}/> Mark declined</button>
              <button onClick={() => setStatus("draft")} className="q-btn-secondary w-full justify-start" data-testid="mark-draft">Reset to draft</button>
            </div>
          </div>
          <div className="q-card p-6">
            <h3 className="font-semibold mb-3" style={{ fontFamily: "Manrope" }}>Danger zone</h3>
            <button onClick={remove} className="q-btn-secondary w-full justify-center text-red-600" data-testid="delete-quote-btn"><Trash2 size={14}/> Delete quote</button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
