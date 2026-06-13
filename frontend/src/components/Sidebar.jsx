// frontend/src/components/Sidebar.jsx
import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FileText, Receipt, Users,
  LogOut, Menu, ChevronDown, ChevronLeft, ChevronRight,
  FolderOpen, Check, Plus, MoreHorizontal, User, Lock,
  CreditCard, X, Pencil, UserPlus, Shield, Trash2,
  Upload, AlertTriangle, Mail, Clock
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useProject } from "../lib/ProjectContext";
import { api, LOGO_URL } from "../lib/api";
import { toast } from "sonner";

const COLLAPSED_KEY = "quotify_sidebar_collapsed";

// ─── Avatar (initialen fallback) ────────────────────────────────
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

// ─── ProjectLogo (cirkel, klikbaar om te uploaden) ───────────────
function ProjectLogo({ project, onUploaded, size = 64 }) {
  const fileRef = useRef();
  const initial = (project?.name || "?")[0].toUpperCase();

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`/projects/${project.id}/settings/logo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded?.(res.data.logo_data);
      toast.success("Logo updated");
    } catch { toast.error("Upload failed"); }
  };

  return (
    <div
      className="relative cursor-pointer group"
      style={{ width: size, height: size }}
      onClick={() => fileRef.current?.click()}
      title="Upload logo"
    >
      {project?.logo_data ? (
        <img
          src={project.logo_data}
          alt={project.name}
          style={{ width: size, height: size }}
          className="rounded-2xl object-contain border border-[#E5E7EB] bg-white"
        />
      ) : (
        <div
          style={{ width: size, height: size, background: "#0066FF", fontSize: size * 0.4 }}
          className="rounded-2xl flex items-center justify-center text-white font-bold select-none"
        >
          {initial}
        </div>
      )}
      {/* Upload overlay */}
      <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Upload size={size * 0.28} className="text-white" />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
    </div>
  );
}

// ─── Project settings modal ──────────────────────────────────────
function ProjectSettingsModal({ project, user, onClose, onProjectChanged, onProjectDeleted }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState({
    company_name: project.company_name || "",
    vat_number: project.vat_number || "",
    bank_account: project.bank_account || "",
    email_signature: project.email_signature || "",
    address: project.address || "",
    phone: project.phone || "",
    accent_color: project.accent_color || "#0066FF",
    logo_data: project.logo_data || null,
  });
  const [projectName, setProjectName] = useState(project.name);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingName, setSavingName] = useState(false);

  // Team state
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  // Danger state
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isOwner = project.owner_id === user?.id;

  const COLOR_PRESETS = ["#0066FF", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#0EA5E9", "#0A0A0A"];

  // Load members when Team tab opens
  useEffect(() => {
    if (tab !== "team") return;
    setLoadingMembers(true);
    api.get(`/projects/${project.id}/members`)
      .then((r) => setMembers(r.data))
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [tab, project.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const saveGeneral = async () => {
    setSavingGeneral(true);
    try {
      const payload = {
        company_name: form.company_name,
        vat_number: form.vat_number,
        bank_account: form.bank_account,
        email_signature: form.email_signature,
        address: form.address,
        phone: form.phone,
        accent_color: form.accent_color,
      };
      await api.put(`/projects/${project.id}/settings`, payload);
      toast.success("Settings saved");
      onProjectChanged?.();
    } catch { toast.error("Failed to save"); } finally { setSavingGeneral(false); }
  };

  const saveName = async () => {
    if (!projectName.trim() || projectName === project.name) return;
    setSavingName(true);
    try {
      await api.put(`/projects/${project.id}`, { name: projectName.trim() });
      toast.success("Project renamed");
      onProjectChanged?.();
    } catch { toast.error("Failed to rename"); } finally { setSavingName(false); }
  };

  const invite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.post(`/projects/${project.id}/invite`, { email: inviteEmail.trim() });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      // Refresh members
      const r = await api.get(`/projects/${project.id}/members`);
      setMembers(r.data);
    } catch (ex) {
      toast.error(ex.response?.data?.detail || "Failed to invite");
    } finally { setInviting(false); }
  };

  const removeMember = async (memberId) => {
    setRemovingId(memberId);
    try {
      await api.delete(`/projects/${project.id}/members/${memberId}`);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    } catch (ex) {
      toast.error(ex.response?.data?.detail || "Failed to remove");
    } finally { setRemovingId(null); }
  };

  const transferOwnership = async (memberId, memberEmail) => {
    if (!window.confirm(`Transfer ownership to ${memberEmail}? You will become a regular member.`)) return;
    try {
      await api.post(`/projects/${project.id}/transfer-owner`, { new_owner_id: memberId });
      toast.success("Ownership transferred");
      onProjectChanged?.();
      onClose();
    } catch (ex) {
      toast.error(ex.response?.data?.detail || "Failed");
    }
  };

  const deleteProject = async () => {
    if (deleteConfirm !== project.name) return;
    setDeleting(true);
    try {
      await api.delete(`/projects/${project.id}`);
      toast.success("Project deleted");
      onProjectDeleted?.();
      onClose();
    } catch (ex) {
      toast.error(ex.response?.data?.detail || "Failed to delete");
    } finally { setDeleting(false); }
  };

  const TABS = [
    { id: "general", label: "General" },
    { id: "team", label: "Team" },
    ...(isOwner ? [{ id: "danger", label: "Danger" }] : []),
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-0 shrink-0">
          {/* Close */}
          <div className="flex justify-end mb-4">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Project hero */}
          <div className="flex items-center gap-4 mb-6">
            <ProjectLogo
              project={{ ...project, logo_data: form.logo_data }}
              onUploaded={(url) => { setForm((f) => ({ ...f, logo_data: url })); onProjectChanged?.(); }}
              size={60}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <input
                  className="text-xl font-semibold text-gray-900 bg-transparent border-0 outline-none focus:bg-gray-50 focus:border focus:border-[#E5E7EB] rounded-lg px-2 py-0.5 -ml-2 w-full truncate"
                  style={{ fontFamily: "Manrope" }}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                  disabled={!isOwner}
                  title={isOwner ? "Click to rename" : undefined}
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full
                  ${user?.plan === "pro"
                    ? "text-[#0066FF] bg-blue-50 border border-blue-100"
                    : "text-gray-500 bg-gray-100 border border-gray-200"
                  }`}
                >
                  {user?.plan === "pro" ? "Pro" : "Free"}
                </span>
                {!isOwner && (
                  <span className="text-[11px] text-gray-400">Member</span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0 border-b border-[#E5E7EB] -mx-6 px-6">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                  ${tab === id
                    ? "border-[#0066FF] text-[#0066FF]"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                  }
                  ${id === "danger" ? (tab === "danger" ? "text-red-600 border-red-500" : "text-gray-500 hover:text-red-600 hover:border-red-300") : ""}
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── General ── */}
          {tab === "general" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Company name">
                  <input
                    className="q-input"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    placeholder="Acme BV"
                  />
                </Field>
                <Field label="VAT number">
                  <input
                    className="q-input"
                    value={form.vat_number}
                    onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
                    placeholder="BE0123456789"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className="q-input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+32 ..."
                  />
                </Field>
                <Field label="Bank account">
                  <input
                    className="q-input"
                    value={form.bank_account}
                    onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                    placeholder="BE68 ..."
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address">
                    <textarea
                      rows={2}
                      className="q-input"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              <Field label="Email signature">
                <textarea
                  rows={3}
                  className="q-input"
                  placeholder={"Best regards,\nYour Name"}
                  value={form.email_signature}
                  onChange={(e) => setForm({ ...form, email_signature: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1">Appears at the bottom of every quote email.</p>
              </Field>

              <Field label="Brand color">
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="color"
                    value={form.accent_color}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-[#E5E7EB] cursor-pointer p-1 bg-white shrink-0"
                  />
                  <input
                    type="text"
                    className="q-input flex-1 font-mono text-sm"
                    value={form.accent_color}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setForm({ ...form, accent_color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform
                        ${form.accent_color === c ? "border-gray-800 scale-110" : "border-white shadow-sm"}`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Used in quote & invoice PDF headers.</p>
              </Field>

              <div className="pt-1 flex justify-end">
                <button
                  onClick={saveGeneral}
                  disabled={savingGeneral}
                  className="q-btn-primary disabled:opacity-40"
                >
                  {savingGeneral ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}

          {/* ── Team ── */}
          {tab === "team" && (
            <div className="space-y-5">
              {/* Invite (owner only) */}
              {isOwner && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Invite member
                  </p>
                  <form onSubmit={invite} className="flex gap-2">
                    <input
                      type="email"
                      required
                      className="q-input flex-1"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={inviting || !inviteEmail.trim()}
                      className="q-btn-primary shrink-0 disabled:opacity-40"
                    >
                      {inviting ? "Sending…" : "Invite"}
                    </button>
                  </form>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Max 5 members on any plan. They'll receive an email invite.
                  </p>
                </div>
              )}

              {/* Members list */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Members</p>
                {loadingMembers ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
                ) : members.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No members yet.</p>
                ) : (
                  <div className="space-y-1">
                    {/* Owner row */}
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50">
                      <div className="w-8 h-8 rounded-full bg-[#0066FF] flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {(user?.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 truncate">{user?.name}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-[#0066FF] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full shrink-0">
                        Owner
                      </span>
                    </div>

                    {/* Member rows */}
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 group">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-semibold shrink-0">
                          {(m.member_email || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-gray-800 truncate">{m.member_email}</p>
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            {m.status === "accepted" ? (
                              <><Check size={10} className="text-emerald-500" /> Accepted</>
                            ) : (
                              <><Clock size={10} className="text-amber-500" /> Pending</>
                            )}
                          </p>
                        </div>
                        {isOwner && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {m.status === "accepted" && (
                              <button
                                onClick={() => transferOwnership(m.member_id, m.member_email)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0066FF] transition-colors"
                                title="Transfer ownership"
                              >
                                <Shield size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => removeMember(m.id)}
                              disabled={removingId === m.id}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                              title="Remove member"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Danger ── */}
          {tab === "danger" && isOwner && (
            <div className="space-y-4">
              <div className="border border-red-200 rounded-xl p-5 bg-red-50">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Delete project</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      This permanently deletes <strong>{project.name}</strong> and all its quotes, invoices and clients.
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
                <Field label={`Type "${project.name}" to confirm`}>
                  <input
                    className="q-input border-red-300 focus:ring-red-100 mt-1"
                    placeholder={project.name}
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                  />
                </Field>
                <button
                  onClick={deleteProject}
                  disabled={deleteConfirm !== project.name || deleting}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete project permanently"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Sidebar ────────────────────────────────────────────────
export default function Sidebar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { projects, activeProject, switchProject, createProject, loadProjects, setActiveProject } = useProject();

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

  // Project settings modal
  const [settingsProject, setSettingsProject] = useState(null); // project object
  const [settingsProjectData, setSettingsProjectData] = useState(null); // full settings from API

  const projectRef = useRef(null);
  const accountRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const handler = (e) => {
      if (projectRef.current && !projectRef.current.contains(e.target)) setProjectOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 4 nav items — clean
  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
    { to: "/quotes", label: t("nav.quotes"), icon: FileText, testid: "nav-quotes" },
    { to: "/invoices", label: t("nav.invoices"), icon: Receipt, testid: "nav-invoices" },
    { to: "/clients", label: t("nav.clients"), icon: Users, testid: "nav-clients" },
  ];

  const openProjectSettings = async (p) => {
    setProjectOpen(false);
    try {
      const res = await api.get(`/projects/${p.id}/settings`);
      setSettingsProjectData(res.data);
      setSettingsProject(p);
    } catch {
      // Fallback: use project data we have
      setSettingsProjectData(p);
      setSettingsProject(p);
    }
  };

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

  // ── Project Switcher ──────────────────────────────────────────
  const ProjectSwitcher = () => (
    <div ref={projectRef} className="relative px-2 pb-1">
      <div className="border-t border-[#E5E7EB] mb-1" />

      <button
        onClick={() => setProjectOpen((v) => !v)}
        title={collapsed ? (activeProject?.name || "Projects") : undefined}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-200/60 transition-colors
          ${collapsed ? "justify-center" : ""}`}
      >
        {/* Project logo/initial icon */}
        {activeProject?.logo_data ? (
          <img
            src={activeProject.logo_data}
            alt={activeProject.name}
            className="w-5 h-5 rounded object-contain shrink-0"
          />
        ) : (
          <FolderOpen size={16} className="text-gray-500 shrink-0" />
        )}
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
            ${collapsed ? "left-full ml-2 bottom-0 w-60" : "left-2 right-2 bottom-full mb-1"}`}
        >
          <div className="max-h-60 overflow-y-auto">
            {projects.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">No projects yet</p>
            )}
            {projects.map((p) => (
              <div key={p.id} className="flex items-center group">
                {/* Switch to project */}
                <button
                  onClick={() => { switchProject(p.id); setProjectOpen(false); }}
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-[13px] text-left min-w-0"
                >
                  <Check
                    size={13}
                    className={`shrink-0 ${activeProject?.id === p.id ? "text-[#0066FF]" : "text-transparent"}`}
                  />
                  <span className="truncate text-gray-800 font-medium">{p.name}</span>
                  {p.owner_id !== user?.id && (
                    <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                      member
                    </span>
                  )}
                </button>
                {/* Three-dots → opens settings modal */}
                <button
                  onClick={(e) => { e.stopPropagation(); openProjectSettings(p); }}
                  className="shrink-0 mr-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                  title="Project settings"
                >
                  <MoreHorizontal size={13} className="text-gray-500" />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-[#E5E7EB] mt-0.5 pt-0.5">
            <button
              onClick={() => { setProjectOpen(false); setNewProjectModal(true); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-[13px] text-[#0066FF] font-medium"
            >
              <Plus size={13} /> New project
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Account Block ─────────────────────────────────────────────
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
            ${collapsed ? "left-full ml-2 bottom-0 w-52" : "left-2 right-2 bottom-full mb-1"}`}
        >
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

  // ── Sidebar body ──────────────────────────────────────────────
  const SidebarContent = ({ onNavigate }) => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo + collapse toggle */}
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
            title="Collapse"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* 4 Nav items */}
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

      {/* Expand button (collapsed, desktop) */}
      {collapsed && (
        <div className="px-2 pb-1 hidden md:block">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex justify-center p-2 rounded-xl hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
            title="Expand"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Project switcher */}
      <ProjectSwitcher />

      {/* Account block */}
      <AccountBlock />
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex ${collapsed ? "w-[68px]" : "w-[240px]"} shrink-0 flex-col border-r border-[#E5E7EB] transition-[width] duration-200`}
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
                <button type="submit" disabled={creating} className="q-btn-primary flex-1 justify-center">
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project settings modal */}
      {settingsProject && settingsProjectData && (
        <ProjectSettingsModal
          project={settingsProjectData}
          user={user}
          onClose={() => { setSettingsProject(null); setSettingsProjectData(null); }}
          onProjectChanged={async () => {
            await loadProjects();
            // Refresh settingsProjectData
            try {
              const res = await api.get(`/projects/${settingsProject.id}/settings`);
              setSettingsProjectData(res.data);
            } catch {}
          }}
          onProjectDeleted={() => {
            loadProjects();
            setSettingsProject(null);
            setSettingsProjectData(null);
          }}
        />
      )}
    </>
  );
}

// ── Field helper ─────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
