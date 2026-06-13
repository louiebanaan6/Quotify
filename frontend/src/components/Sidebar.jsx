// frontend/src/components/Sidebar.jsx
import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FileText, Receipt, Users, Settings,
  LogOut, Menu, ChevronDown, ChevronLeft, ChevronRight,
  FolderOpen, Check, Plus, MoreHorizontal, User, Lock,
  CreditCard, X, Pencil, UserPlus, Shield
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useProject } from "../lib/ProjectContext";
import { api, LOGO_URL } from "../lib/api";
import { toast } from "sonner";

const COLLAPSED_KEY = "quotify_sidebar_collapsed";

// ── Avatar ──────────────────────────────────────────────────────
function Avatar({ user, size = 32 }) {
  const initials = (user?.name || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (user?.profile_photo) {
    return (
      <img
        src={user.profile_photo}
        alt={user.name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, background: "#0066FF", fontSize: Math.round(size * 0.38) }}
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none"
    >
      {initials}
    </div>
  );
}

// ── Project dots menu ────────────────────────────────────────────
function ProjectDotsMenu({ project, user, onClose, onRenamed }) {
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const isOwner = project.owner_id === user?.id;

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const rename = async () => {
    if (!newName.trim() || newName === project.name) { setRenaming(false); return; }
    setBusy(true);
    try {
      await api.put(`/projects/${project.id}`, { name: newName.trim() });
      toast.success("Project renamed");
      onRenamed?.();
      onClose();
    } catch { toast.error("Failed"); } finally { setBusy(false); }
  };

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-7 z-[100] bg-white border border-[#E5E7EB] rounded-xl shadow-lg py-1.5 min-w-[195px]"
      onClick={(e) => e.stopPropagation()}
    >
      {renaming ? (
        <div className="px-3 py-2 flex gap-2">
          <input
            autoFocus
            className="q-input flex-1 !py-1 !text-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
          <button
            onClick={rename}
            disabled={busy}
            className="text-[#0066FF] text-sm font-medium shrink-0 disabled:opacity-50"
          >
            {busy ? "…" : "Save"}
          </button>
        </div>
      ) : (
        <>
          {isOwner && (
            <button
              onClick={() => setRenaming(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
            >
              <Pencil size={13} className="text-gray-400 shrink-0" /> Rename
            </button>
          )}
          <button
            onClick={() => { navigate(`/team/${project.id}`); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
          >
            <UserPlus size={13} className="text-gray-400 shrink-0" /> Team members
          </button>
          {isOwner && (
            <button
              onClick={() => { navigate(`/team/${project.id}?tab=owner`); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
            >
              <Shield size={13} className="text-gray-400 shrink-0" /> Transfer ownership
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Main sidebar ─────────────────────────────────────────────────
export default function Sidebar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { projects, activeProject, switchProject, createProject, loadProjects } = useProject();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === "true"
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [dotsProject, setDotsProject] = useState(null);

  const projectRef = useRef(null);
  const accountRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // Close popups on outside click
  useEffect(() => {
    const handler = (e) => {
      if (projectRef.current && !projectRef.current.contains(e.target)) {
        setProjectOpen(false);
        setDotsProject(null);
      }
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 5 nav items — no Billing, no Logout
  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
    { to: "/quotes", label: t("nav.quotes"), icon: FileText, testid: "nav-quotes" },
    { to: "/invoices", label: t("nav.invoices"), icon: Receipt, testid: "nav-invoices" },
    { to: "/clients", label: t("nav.clients"), icon: Users, testid: "nav-clients" },
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
      setProjectOpen(false);
    } catch (ex) {
      setCreateErr(ex.response?.data?.detail || "Failed to create project");
    } finally { setCreating(false); }
  };

  const handleLogout = async () => {
    setAccountOpen(false);
    await logout();
    navigate("/login");
  };

  // ── Project switcher ──
  const ProjectSwitcher = () => (
    <div ref={projectRef} className="relative px-2 pb-1">
      {/* Divider */}
      <div className="border-t border-[#E5E7EB] mb-1" />

      <button
        onClick={() => setProjectOpen((v) => !v)}
        title={collapsed ? (activeProject?.name || "Projects") : undefined}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-200/60 transition-colors
          ${collapsed ? "justify-center" : ""}`}
      >
        <FolderOpen size={16} className="text-gray-500 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-[13px] font-medium text-gray-700 truncate">
              {activeProject?.name || "No project"}
            </span>
            <ChevronDown
              size={13}
              className={`text-gray-400 shrink-0 transition-transform duration-150 ${projectOpen ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {/* Dropup */}
      {projectOpen && (
        <div
          className={`absolute z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg py-1
            ${collapsed
              ? "left-full ml-2 bottom-0 w-56"
              : "left-2 right-2 bottom-full mb-1"
            }`}
        >
          <div className="max-h-56 overflow-y-auto">
            {projects.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No projects yet</p>
            )}
            {projects.map((p) => (
              <div key={p.id} className="relative flex items-center group">
                <button
                  onClick={() => { switchProject(p.id); setProjectOpen(false); }}
                  className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-[13px] text-left min-w-0"
                >
                  <Check
                    size={13}
                    className={`shrink-0 ${activeProject?.id === p.id ? "text-[#0066FF]" : "text-transparent"}`}
                  />
                  <span className="truncate text-gray-800">{p.name}</span>
                  {p.owner_id !== user?.id && (
                    <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                      member
                    </span>
                  )}
                </button>
                {/* Three-dots */}
                <div className="relative shrink-0 mr-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDotsProject(dotsProject?.id === p.id ? null : p);
                    }}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-opacity"
                  >
                    <MoreHorizontal size={13} className="text-gray-500" />
                  </button>
                  {dotsProject?.id === p.id && (
                    <ProjectDotsMenu
                      project={p}
                      user={user}
                      onClose={() => setDotsProject(null)}
                      onRenamed={loadProjects}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#E5E7EB] mt-0.5 pt-0.5">
            <button
              onClick={() => { setProjectOpen(false); setNewProjectModal(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-[13px] text-[#0066FF] font-medium"
            >
              <Plus size={13} /> New project
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Account block ──
  const AccountBlock = () => (
    <div ref={accountRef} className="relative px-2 pb-2 pt-1">
      <button
        onClick={() => setAccountOpen((v) => !v)}
        title={collapsed ? user?.name : undefined}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl hover:bg-gray-200/60 transition-colors
          ${collapsed ? "justify-center" : ""}`}
        data-testid="account-trigger"
      >
        <Avatar user={user} size={30} />
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-medium text-gray-900 truncate leading-tight">{user?.name}</p>
              <p className="text-[11px] text-gray-500 truncate leading-tight">{user?.email}</p>
            </div>
            <ChevronDown
              size={13}
              className={`text-gray-400 shrink-0 transition-transform duration-150 ${accountOpen ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {/* Dropup */}
      {accountOpen && (
        <div
          className={`absolute z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg py-1
            ${collapsed
              ? "left-full ml-2 bottom-0 w-52"
              : "left-2 right-2 bottom-full mb-1"
            }`}
        >
          {/* User info header (only expanded) */}
          {!collapsed && (
            <div className="px-3 py-2.5 border-b border-[#E5E7EB] mb-0.5">
              <p className="text-[13px] font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {user?.plan === "pro" ? "Pro plan" : "Free plan"}
              </p>
            </div>
          )}
          <button
            onClick={() => { setAccountOpen(false); navigate("/profile"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
            data-testid="account-profile"
          >
            <User size={13} className="text-gray-400 shrink-0" /> Profile
          </button>
          <button
            onClick={() => { setAccountOpen(false); navigate("/profile?tab=password"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
            data-testid="account-password"
          >
            <Lock size={13} className="text-gray-400 shrink-0" /> Change password
          </button>
          <button
            onClick={() => { setAccountOpen(false); navigate("/profile?tab=billing"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
            data-testid="account-billing"
          >
            <CreditCard size={13} className="text-gray-400 shrink-0" /> Billing
          </button>
          <div className="border-t border-[#E5E7EB] mt-0.5 pt-0.5">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
              data-testid="sidebar-logout-btn"
            >
              <LogOut size={13} className="shrink-0" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Sidebar body ──
  const SidebarContent = ({ onNavigate }) => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo + toggle */}
      <div
        className={`h-[72px] flex items-center border-b border-[#E5E7EB] shrink-0 px-4
          ${collapsed ? "justify-center" : "justify-between"}`}
      >
        <img
          src={LOGO_URL}
          alt="Quotify"
          className={`object-contain ${collapsed ? "h-7" : "h-8"}`}
        />
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="hidden md:flex p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end, testid }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            data-testid={testid}
            onClick={() => onNavigate?.()}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors
              ${collapsed ? "justify-center" : ""}
              ${isActive
                ? "bg-white text-[#0066FF] shadow-sm border border-[#E5E7EB]"
                : "text-gray-600 hover:bg-white/70 hover:text-gray-900"
              }`
            }
          >
            <Icon size={17} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Expand button when collapsed (desktop) */}
      {collapsed && (
        <div className="px-2 pb-1 hidden md:block">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex justify-center p-2 rounded-xl hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Project switcher */}
      <ProjectSwitcher />

      {/* Account */}
      <AccountBlock />
    </div>
  );

  const sidebarW = collapsed ? "w-[68px]" : "w-[240px]";

  return (
    <>
      {/* Desktop */}
      <aside
        className={`hidden md:flex ${sidebarW} shrink-0 flex-col border-r border-[#E5E7EB] transition-[width] duration-200`}
        style={{ background: "#F7F8FA" }}
        data-testid="app-sidebar"
      >
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
          <aside
            className="relative w-[240px] flex flex-col h-full border-r border-[#E5E7EB]"
            style={{ background: "#F7F8FA" }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-200 z-10"
            >
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* New project modal */}
      {newProjectModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: "Manrope" }}>
              New project
            </h2>
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
                <p className="text-xs text-gray-500">
                  Free plan: max 2 projects.{" "}
                  <button
                    type="button"
                    onClick={() => { setNewProjectModal(false); navigate("/profile?tab=billing"); }}
                    className="text-[#0066FF] hover:underline"
                  >
                    Upgrade for unlimited.
                  </button>
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setNewProjectModal(false); setCreateErr(""); }}
                  className="q-btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="q-btn-primary flex-1 justify-center"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
