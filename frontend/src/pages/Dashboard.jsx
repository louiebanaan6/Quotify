import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout, { StatusBadge, EUR } from "../components/AppLayout";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Plus, FileText, CheckCircle2, Clock, XCircle } from "lucide-react";

export default function Dashboard() {
  const nav = useNavigate();
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const [invStats, setInvStats] = useState(null);
  const [quotes, setQuotes] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, q, i] = await Promise.all([
        api.get("/quotes/stats"),
        api.get("/quotes"),
        api.get("/invoices/stats"),
      ]);
      setStats(s.data); setQuotes(q.data); setInvStats(i.data);
    })();
  }, []);

  const cards = [
    { label: t("dash.total_quotes"), value: stats?.total ?? "—", icon: FileText, color: "text-gray-700" },
    { label: t("dash.sent"), value: stats?.by_status?.sent ?? "—", icon: Clock, color: "text-[#0066FF]" },
    { label: t("dash.accepted"), value: stats?.by_status?.accepted ?? "—", icon: CheckCircle2, color: "text-emerald-600" },
    { label: t("dash.declined"), value: stats?.by_status?.declined ?? "—", icon: XCircle, color: "text-red-500" },
  ];

  return (
    <AppLayout
      title={t("dash.title")}
      action={
        <button data-testid="dashboard-new-quote-btn" onClick={() => nav("/quotes/new")} className="q-btn-primary">
          <Plus size={16} /> {t("nav.new_quote")}
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c, i) => (
          <div key={i} className="q-card p-5" data-testid={`stat-card-${c.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-gray-500 font-medium">{c.label}</span>
              <c.icon className={c.color} size={18} />
            </div>
            <div className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="q-card p-5 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="revenue-card">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 font-medium">{t("dash.paid_revenue")}</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-600" style={{ fontFamily: "Manrope" }}>{EUR(invStats?.total_revenue || 0)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 font-medium">{t("dash.unpaid")}</div>
          <div className="text-2xl font-semibold mt-1 text-amber-600" style={{ fontFamily: "Manrope" }}>{EUR(invStats?.unpaid_total || 0)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 font-medium">{t("dash.overdue")}</div>
          <div className="text-2xl font-semibold mt-1 text-red-500" style={{ fontFamily: "Manrope" }}>{EUR(invStats?.overdue_total || 0)}</div>
        </div>
      </div>

      {stats?.plan === "free" && (
        <div className="q-card p-5 mb-6 flex items-center justify-between" data-testid="free-plan-card">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{stats?.total ?? 0}/{stats?.limit}</span> {t("dash.quotes_used")}
          </div>
          <button onClick={() => nav("/billing")} data-testid="upgrade-link" className="q-btn-primary">{t("dash.upgrade_pro")}</button>
        </div>
      )}

      <div className="q-card overflow-hidden" data-testid="recent-quotes-card">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <h3 className="font-semibold" style={{ fontFamily: "Manrope" }}>{t("dash.recent_quotes")}</h3>
          <button onClick={() => nav("/quotes")} data-testid="view-all-quotes" className="text-sm q-link">{t("dash.view_all")}</button>
        </div>
        {quotes.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">{t("dash.no_quotes")}</div>
        ) : (
          <table className="q-table">
            <thead>
              <tr><th>{t("quote.number")}</th><th>{t("quote.client")}</th><th>{t("quote.status")}</th><th className="text-right">{t("quote.total")}</th></tr>
            </thead>
            <tbody>
              {quotes.slice(0, 5).map((q) => (
                <tr key={q.id} data-testid={`dash-quote-row-${q.quote_number}`} className="cursor-pointer" onClick={() => nav(`/quotes/${q.id}`)}>
                  <td className="font-medium text-gray-900">#{q.quote_number}</td>
                  <td>{q.client_name}</td>
                  <td><StatusBadge status={q.status} /></td>
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
