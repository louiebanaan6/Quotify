// frontend/src/components/Sidebar.jsx — met project switcher
import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FileText, Receipt, Users, Settings,
  CreditCard, LogOut, Plus, Menu, X, ChevronDown,
  FolderOpen, Check
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useProject } from "../lib/ProjectContext";
import { LOGO_URL } from "../lib/api";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { projects, activeProject, switchProject, createProject } = useProject();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
    { to: "/quotes", label: t("nav.quotes"), icon: FileText, testid: "nav-quotes" },
    { to: "/invoices", label: t("nav.invoices"), icon: Receipt, testid: "nav-invoices" },
    { to: "/clients", label: t("nav.clients"), icon: Users, testid: "nav-clients" },
    { to: "/billing", label: t("nav.billing"), icon: CreditCard, testid: "nav-billing" },
    { to: "/settings", label: t("nav.settings"), icon: Settings, testid: "nav-settings" },
  ];

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreating(true); setCreateErr("");
    try {
      await createProject(newProjectName.trim());
      setNewProjectModal(false);
      setNewProjectName("");
    } catch (ex) {
      setCreateErr(ex.response?.data?.detail || "Failed to create project");
    } finally { setCreating(false); }
  };

  const ProjectSwitcher = () => (
    <div className="px-3 pb-2 relative">
      <button
        onClick={() => setProjectMenuOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-200 transition text-sm"
      >
        <FolderOpen size={15} className="text-gray-500 shrink-0" />
        <span className="flex-1 text-left font-medium text-gray-800 truncate">
          {activeProject?.name || "No project"}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${projectMenuOpen ? "rotate-180" : ""}`} />
      </button>

      {projectMenuOpen && (
        <div className="absolute left-3 right-3 top-full z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg py-1 mt-1">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { switchProject(p.id); setProjectMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-left"
            >
              <Check size={14} className={activeProject?.id === p.id ? "text-blue-600" : "text-transparent"} />
              <span className="truncate">{p.name}</span>
              {p.owner_id !== user?.id && <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">member</span>}
            </button>
          ))}
          <div className="border-t border-[#E5E7EB] mt-1 pt-1">
            <button
              onClick={() => { setProjectMenuOpen(false); setNewProjectModal(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-blue-600 font-medium"
            >
              <Plus size={14} /> New project
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const SidebarContent = ({ onNavigate }) => (
    <>
      <div className="h-[72px] flex items-center px-5 border-b border-[#E5E7EB]">
        <div className="flex items-center w-full">
          <img src={LOGO_URL} alt="Quotify" className="h-8 w-auto object-contain" />
          <div className="text-[11px] text-gray-500 ml-auto">{user?.plan === "pro" ? t("nav.pro_plan") : t("nav.free_plan")}</div>
        </div>
      </div>

      <ProjectSwitcher />

      <div className="px-4 pb-3">
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
      {/* Desktop */}
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 flex flex-col h-full border-r border-[#E5E7EB]" style={{ background: "#F7F8FA" }}>
            <button onClick={() => setMobileOpen(false)} className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-200">
              <X size={20} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* New project modal */}
      {newProjectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: "Manrope" }}>New project</h2>
            <form onSubmit={handleCreateProject} className="space-y-3">
              <input
                autoFocus
                type="text"
                required
                className="q-input w-full"
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              {createErr && <p className="text-sm text-red-600">{createErr}</p>}
              {user?.plan === "free" && (
                <p className="text-xs text-gray-500">Free plan: max 2 projects. <a href="/billing" className="q-link">Upgrade for unlimited.</a></p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setNewProjectModal(false); setCreateErr(""); }} className="q-btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={creating} className="q-btn-primary flex-1 justify-center">{creating ? "Creating…" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
