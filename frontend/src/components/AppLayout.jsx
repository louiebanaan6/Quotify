import React from "react";
import Sidebar from "./Sidebar";

export default function AppLayout({ title, action, children }) {
  return (
    <div className="App flex min-h-screen bg-white">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pt-[56px] md:pt-0">
        <header className="h-[72px] flex items-center justify-between px-6 md:px-10 border-b border-[#E5E7EB] bg-white">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }} data-testid="page-title">{title}</h1>
          <div>{action}</div>
        </header>
        <main className="flex-1 p-6 md:p-10 bg-white" data-testid="page-main">{children}</main>
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    draft: "q-badge q-badge-draft",
    sent: "q-badge q-badge-sent",
    accepted: "q-badge q-badge-accepted",
    declined: "q-badge q-badge-declined",
    unpaid: "q-badge q-badge-unpaid",
    paid: "q-badge q-badge-accepted",
    overdue: "q-badge q-badge-declined",
  };
  return <span data-testid={`status-${status}`} className={map[status] || "q-badge q-badge-draft"}>{status}</span>;
}

export function EUR(n) {
  return `€ ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
