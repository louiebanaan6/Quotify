// frontend/src/lib/ProjectContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
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

  // Fetch all projects from API, optionally force a specific active project id
  const _fetchProjects = async (forceActiveId) => {
    setLoading(true);
    try {
      const { data } = await api.get("/projects");
      const all = [...(data.owned || []), ...(data.member || [])];
      setProjects(all);

      if (forceActiveId) {
        const found = all.find((p) => p.id === forceActiveId);
        setActiveProject(found || all[0] || null);
      } else {
        // Use whatever the server says is active via user.active_project_id
        const { data: me } = await api.get("/auth/me");
        const activeId = me?.active_project_id;
        const found = all.find((p) => p.id === activeId) || all[0] || null;
        setActiveProject(found);
      }
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoading(false);
    }
  };

  const _fetchPendingInvites = async () => {
    try {
      const { data } = await api.get("/invites/pending");
      setPendingInvites(data || []);
    } catch {
      setPendingInvites([]);
    }
  };

  // Reload whenever user logs in/out
  useEffect(() => {
    if (user?.id) {
      _fetchProjects();
      _fetchPendingInvites();
    } else {
      setProjects([]);
      setActiveProject(null);
      setPendingInvites([]);
    }
  }, [user?.id]);

  const loadProjects = () => _fetchProjects();
  const loadPendingInvites = () => _fetchPendingInvites();

  const switchProject = async (projectId) => {
    await api.post(`/projects/${projectId}/activate`);
    const found = projects.find((p) => p.id === projectId);
    setActiveProject(found || null);
    setDataKey((k) => k + 1);
  };

  const createProject = async (name, description = "") => {
    const { data } = await api.post("/projects", { name, description });
    await _fetchProjects(data.id);
    setDataKey((k) => k + 1);
    return data;
  };

  const deleteProject = async (projectId) => {
    await api.delete(`/projects/${projectId}`);
    await _fetchProjects();
    setDataKey((k) => k + 1);
  };

  const leaveProject = async (projectId) => {
    await api.post(`/projects/${projectId}/leave`);
    await _fetchProjects();
    setDataKey((k) => k + 1);
  };

  const acceptInvite = async (token) => {
    // POST to backend — returns {ok, project_id, project_name, token}
    const { data } = await api.post(`/invite/accept?token=${token}`);
    if (data.ok) {
      // Save token so Bearer header works cross-origin
      if (data.token) localStorage.setItem("quotify_token", data.token);
      // Force reload with the accepted project as active
      await _fetchProjects(data.project_id);
      await _fetchPendingInvites();
      setDataKey((k) => k + 1);
    }
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
