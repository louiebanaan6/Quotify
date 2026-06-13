// frontend/src/lib/ProjectContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
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

  const loadProjects = useCallback(async () => {
    if (!user) { setProjects([]); setActiveProject(null); return; }
    setLoading(true);
    try {
      const { data } = await api.get("/projects");
      const all = [...(data.owned || []), ...(data.member || [])];
      setProjects(all);
      // Active project = user's active_project_id, else first project
      const active = all.find((p) => p.id === user.active_project_id) || all[0] || null;
      setActiveProject(active);
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.active_project_id]);

  const loadPendingInvites = useCallback(async () => {
    if (!user) { setPendingInvites([]); return; }
    try {
      const { data } = await api.get("/invites/pending");
      setPendingInvites(data || []);
    } catch {
      setPendingInvites([]);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProjects();
    loadPendingInvites();
  }, [user?.id]);

  const switchProject = async (projectId) => {
    await api.post(`/projects/${projectId}/activate`);
    // Refresh user so active_project_id is updated in auth context
    await refresh();
    const found = projects.find((p) => p.id === projectId);
    setActiveProject(found || null);
    setDataKey((k) => k + 1);
  };

  const createProject = async (name, description = "") => {
    const { data } = await api.post("/projects", { name, description });
    await refresh();
    await loadProjects();
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
    const { data } = await api.post(`/invite/accept?token=${token}`);
    // Backend returns updated user with new active_project_id — refresh auth
    await refresh();
    await loadProjects();
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
