import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout, { StatusBadge, EUR } from "../components/AppLayout";
import { api } from "../lib/api";
import { Search, Receipt, TrendingUp, AlertTriangle, Clock } from "lucide-react";

const FILTERS = ["all", "unpaid", "paid", "overdue"];

export default function InvoicesList() {
  const nav = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/invoices").then((r) => setInvoices(r.data));
    api.get("/invoices/stats").then((r) => setStats(r.data));
  }, []);

  const filtered = invoices
    .filter((i) => filter === "all" || i.status === filter)
    .filter((i) =>
      !search ||
      i.client_name.toLowerCase().includes(search.toLowerCase()) ||
      i.invoice_number.toLowerCase().includes(search.toLowerCase())
    );

  const cards = [
    { label: "Total revenue", value: EUR(stats?.total_revenue || 0), icon: TrendingUp, color: "text-emerald-600", testid: "stat-revenue" },
    { label: "Unpaid", value: EUR(stats?.unpaid_total || 0), icon: Clock, color: "text-amber-600", testid: "stat-unpaid" },
    { label: "Overdue", value: EUR(stats?.overdue_total || 0), icon: AlertTriangle, color: "text-red-500", testid: "stat-overdue" },
    { label: "Invoices", value: stats?.total ?? "—", icon: Receipt, color: "text-gray-700", testid: "stat-count" },
  ];

  return (
    <AppLayout title="Invoices">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c, i) => (
          <div key={i} className="q-card p-5" data-testid={c.testid}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-gray-500 font-medium">{c.label}</span>
              <c.icon className={c.color} size={18} />
            </div>
            <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "#F3F4F6" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              data-testid={`invoice-filter-${f}`}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === f ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input data-testid="invoices-search" value={search} onChange={(e) => setSearch(e.target.value)} className="q-input !pl-9" placeholder="Search by client or invoice number" />
        </div>
      </div>

      <div className="q-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm" data-testid="invoices-empty">
            {invoices.length === 0 ? "No invoices yet. Convert an accepted quote into an invoice." : "No invoices match your filters."}
          </div>
        ) : (
          <table className="q-table">
            <thead>
              <tr><th>Number</th><th>Client</th><th>Status</th><th>Due date</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="cursor-pointer" data-testid={`invoice-row-${i.invoice_number}`} onClick={() => nav(`/invoices/${i.id}`)}>
                  <td className="font-medium text-gray-900">{i.invoice_number}</td>
                  <td>{i.client_name}</td>
                  <td><StatusBadge status={i.status} /></td>
                  <td className="text-gray-500">{i.due_date?.slice(0, 10)}</td>
                  <td className="text-right font-medium">{EUR(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
