import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Receipt, Users, Settings, CreditCard, LogOut, Plus, Menu, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { LOGO_URL } from "../lib/api";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
    { to: "/quotes", label: t("nav.quotes"), icon: FileText, testid: "nav-quotes" },
    { to: "/invoices", label: t("nav.invoices"), icon: Receipt, testid: "nav-invoices" },
    { to: "/clients", label: t("nav.clients"), icon: Users, testid: "nav-clients" },
    { to: "/billing", label: t("nav.billing"), icon: CreditCard, testid: "nav-billing" },
    { to: "/settings", label: t("nav.settings"), icon: Settings, testid: "nav-settings" },
  ];

  const SidebarContent = ({ onNavigate }) => (
    <>
      <div className="h-[72px] flex items-center px-5 border-b border-[#E5E7EB]">
        <div className="flex items-center w-full">
          <img src={LOGO_URL} alt="Quotify" className="h-8 w-auto object-contain" />
          <div className="text-[11px] text-gray-500 ml-auto">{user?.plan === "pro" ? t("nav.pro_plan") : t("nav.free_plan")}</div>
        </div>
      </div>
      <div className="p-4">
        <button
          data-testid="sidebar-new-quote-btn"
          onClick={() => { navigate("/quotes/new"); onNavigate?.(); }}
          className="q-btn-primary w-full justify-center"
        >
          <Plus size={16} /> {t("nav.new_quote")}
        </button>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end, testid }) => (
          <NavLink
            key={to} to={to} end={end} data-testid={testid}
            onClick={() => onNavigate?.()}
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
          <LogOut size={18} /> <span>{t("nav.logout")}</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#E5E7EB]" style={{ background: "#F7F8FA" }} data-testid="app-sidebar">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-[56px] flex items-center justify-between px-4 bg-white border-b border-[#E5E7EB]">
        <img src={LOGO_URL} alt="Quotify" className="h-7 w-auto object-contain" />
        <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 flex flex-col h-full border-r border-[#E5E7EB]" style={{ background: "#F7F8FA" }}>
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-200"
            >
              <X size={20} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
