import React, { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import { api } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", email: "", phone: "", address: "", company: "" };

export default function Clients() {
  const { dataKey } = useProject();
  const [clients, setClients] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/clients").then((r) => setClients(r.data));
  useEffect(() => { load(); }, [dataKey]); // re-fetch when project switches

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing.id) await api.put(`/clients/${editing.id}`, editing);
      else await api.post("/clients", editing);
      toast.success("Saved");
      setEditing(null); load();
    } catch (e) {
      toast.error("Failed to save client");
    } finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this client?")) return;
    await api.delete(`/clients/${id}`);
    toast.success("Deleted"); load();
  };

  return (
    <AppLayout
      title="Clients"
      action={
        <button data-testid="add-client-btn" onClick={() => setEditing({ ...empty })} className="q-btn-primary"><Plus size={16}/> Add client</button>
      }
    >
      <div className="q-card overflow-hidden">
        {clients.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm" data-testid="clients-empty">No clients yet. Add one to get started.</div>
        ) : (
          <table className="q-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th></th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} data-testid={`client-row-${c.id}`}>
                  <td className="font-medium text-gray-900">{c.name}</td>
                  <td>{c.email}</td>
                  <td className="text-gray-500">{c.phone || "—"}</td>
                  <td className="text-gray-500">{c.company || "—"}</td>
                  <td className="text-right">
                    <button onClick={() => setEditing(c)} className="text-gray-400 hover:text-[#0066FF] mr-3" data-testid={`edit-client-${c.id}`}><Edit size={16}/></button>
                    <button onClick={() => remove(c.id)} className="text-gray-400 hover:text-red-500" data-testid={`delete-client-${c.id}`}><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="q-card p-7 w-full max-w-lg" onClick={(e) => e.stopPropagation()} data-testid="client-modal">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold" style={{ fontFamily: "Manrope" }}>{editing.id ? "Edit client" : "New client"}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700"><X size={18}/></button>
            </div>
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name *"><input data-testid="client-name" required className="q-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
                <Field label="Email *"><input data-testid="client-email" required type="email" className="q-input" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
                <Field label="Phone"><input data-testid="client-phone" className="q-input" value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
                <Field label="Company"><input data-testid="client-company" className="q-input" value={editing.company || ""} onChange={(e) => setEditing({ ...editing, company: e.target.value })} /></Field>
              </div>
              <Field label="Address"><textarea data-testid="client-address" rows={2} className="q-input" value={editing.address || ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setEditing(null)} className="q-btn-secondary">Cancel</button>
                <button type="submit" disabled={busy} className="q-btn-primary" data-testid="client-save">{busy ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
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
