import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Receipt, Users, Settings, CreditCard, LogOut, Plus } from "lucide-react";
import { useAuth } from "../lib/auth";
import { LOGO_URL } from "../lib/api";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/quotes", label: "Quotes", icon: FileText, testid: "nav-quotes" },
  { to: "/invoices", label: "Invoices", icon: Receipt, testid: "nav-invoices" },
  { to: "/clients", label: "Clients", icon: Users, testid: "nav-clients" },
  { to: "/billing", label: "Billing", icon: CreditCard, testid: "nav-billing" },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#E5E7EB]" style={{ background: "#F7F8FA" }} data-testid="app-sidebar">
      <div className="h-[72px] flex items-center px-5 border-b border-[#E5E7EB]">
        <div className="flex items-center w-full">
          <img src={LOGO_URL} alt="Quotify" className="h-8 w-auto object-contain" />
          <div className="text-[11px] text-gray-500 ml-auto">{user?.plan === "pro" ? "Pro plan" : "Free plan"}</div>
        </div>
      </div>

      <div className="p-4">
        <button
          data-testid="sidebar-new-quote-btn"
          onClick={() => navigate("/quotes/new")}
          className="q-btn-primary w-full justify-center"
        >
          <Plus size={16} /> New quote
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end, testid }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            data-testid={testid}
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[#E5E7EB] p-3">
        <div className="px-2 pb-2">
          <div className="text-sm font-medium text-gray-900 truncate">{user?.name}</div>
          <div className="text-xs text-gray-500 truncate">{user?.email}</div>
        </div>
        <button
          data-testid="sidebar-logout-btn"
          onClick={async () => { await logout(); navigate("/login"); }}
          className="sidebar-link w-full"
        >
          <LogOut size={18} /> <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
