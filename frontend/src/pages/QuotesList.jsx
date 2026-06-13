import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout, { StatusBadge, EUR } from "../components/AppLayout";
import { api } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { Plus, Search } from "lucide-react";

const FILTERS = ["all", "draft", "sent", "accepted", "declined"];

export default function QuotesList() {
  const nav = useNavigate();
  const { dataKey } = useProject();
  const [quotes, setQuotes] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/quotes").then((r) => setQuotes(r.data));
  }, [dataKey]); // re-fetch whenever active project changes

  const filtered = quotes
    .filter((q) => filter === "all" || q.status === filter)
    .filter((q) =>
      !search ||
      q.client_name.toLowerCase().includes(search.toLowerCase()) ||
      q.quote_number.includes(search)
    );

  return (
    <AppLayout
      title="Quotes"
      action={
        <button data-testid="quotes-new-btn" onClick={() => nav("/quotes/new")} className="q-btn-primary">
          <Plus size={16} /> New quote
        </button>
      }
    >
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "#F3F4F6" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              data-testid={`filter-${f}`}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === f ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input data-testid="quotes-search" value={search} onChange={(e) => setSearch(e.target.value)} className="q-input !pl-9" placeholder="Search by client or quote number" />
        </div>
      </div>

      <div className="q-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm" data-testid="quotes-empty">
            {quotes.length === 0 ? "No quotes yet. Create your first quote." : "No quotes match your filters."}
          </div>
        ) : (
          <table className="q-table">
            <thead>
              <tr><th>Number</th><th>Client</th><th>Status</th><th>Created</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="cursor-pointer" data-testid={`quote-row-${q.quote_number}`} onClick={() => nav(`/quotes/${q.id}`)}>
                  <td className="font-medium text-gray-900">#{q.quote_number}</td>
                  <td>{q.client_name}</td>
                  <td><StatusBadge status={q.status} /></td>
                  <td className="text-gray-500">{q.created_at?.slice(0, 10)}</td>
                  <td className="text-right font-medium">{EUR(q.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
