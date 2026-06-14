// frontend/src/lib/ProjectContext.jsx
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { user, refresh } = useAuth();
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [dataKey, setDataKey] = useState(0);

  // Use a ref so loadProjects always has access to the latest user
  // without needing useCallback deps
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Core loader — always fetches fresh from API, uses active_project_id
  // from the freshest user ref (not stale closure)
  const loadProjects = async (overrideActiveId) => {
    if (!userRef.current) { setProjects([]); setActiveProject(null); return; }
    setLoading(true);
    try {
      const { data } = await api.get("/projects");
      const all = [...(data.owned || []), ...(data.member || [])];
      setProjects(all);
      // Use override (e.g. after accept invite) or user's active_project_id
      const activeId = overrideActiveId ?? userRef.current?.active_project_id;
      const active = all.find((p) => p.id === activeId) || all[0] || null;
      setActiveProject(active);
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingInvites = async () => {
    if (!userRef.current) { setPendingInvites([]); return; }
    try {
      const { data } = await api.get("/invites/pending");
      setPendingInvites(data || []);
    } catch {
      setPendingInvites([]);
    }
  };

  // Load on mount and when user id changes
  useEffect(() => {
    if (user?.id) {
      loadProjects();
      loadPendingInvites();
    } else {
      setProjects([]);
      setActiveProject(null);
      setPendingInvites([]);
    }
  }, [user?.id]);

  const switchProject = async (projectId) => {
    await api.post(`/projects/${projectId}/activate`);
    await refresh();
    // Find directly in current projects list
    setActiveProject((prev) => {
      const found = projects.find((p) => p.id === projectId);
      return found || prev;
    });
    setDataKey((k) => k + 1);
  };

  const createProject = async (name, description = "") => {
    const { data } = await api.post("/projects", { name, description });
    await refresh();
    await loadProjects(data.id);
    setDataKey((k) => k + 1);
    return data;
  };

  const deleteProject = async (projectId) => {
    await api.delete(`/projects/${projectId}`);
    await refresh();
    await loadProjects();
    setDataKey((k) => k + 1);
  };

  const leaveProject = async (projectId) => {
    await api.post(`/projects/${projectId}/leave`);
    await refresh();
    await loadProjects();
    setDataKey((k) => k + 1);
  };

  const acceptInvite = async (token) => {
    // Backend returns {ok, project_id, project_name}
    const { data } = await api.post(`/invite/accept?token=${token}`);
    // Refresh user first so active_project_id is updated
    await refresh();
    // Pass the project_id directly so loadProjects sets the right active project
    // even before userRef updates from the refresh
    await loadProjects(data.project_id);
    await loadPendingInvites();
    setDataKey((k) => k + 1);
  };

  const declineInvite = async (inviteId) => {
    await api.post(`/invites/${inviteId}/decline`);
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        loading,
        dataKey,
        pendingInvites,
        loadProjects,
        loadPendingInvites,
        switchProject,
        createProject,
        deleteProject,
        leaveProject,
        acceptInvite,
        declineInvite,
        setActiveProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
