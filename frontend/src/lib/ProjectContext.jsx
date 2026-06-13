// frontend/src/lib/ProjectContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadProjects = async () => {
    if (!user) { setProjects([]); setActiveProject(null); return; }
    setLoading(true);
    try {
      const { data } = await api.get("/projects");
      const all = [...(data.owned || []), ...(data.member || [])];
      setProjects(all);
      // Find active project
      const active = all.find(p => p.id === user.active_project_id) || all[0] || null;
      setActiveProject(active);
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadProjects(); }, [user?.id]);

  const switchProject = async (projectId) => {
    await api.post(`/projects/${projectId}/activate`);
    const found = projects.find(p => p.id === projectId);
    setActiveProject(found || null);
  };

  const createProject = async (name, description = "") => {
    const { data } = await api.post("/projects", { name, description });
    await loadProjects();
    return data;
  };

  const deleteProject = async (projectId) => {
    await api.delete(`/projects/${projectId}`);
    await loadProjects();
  };

  return (
    <ProjectContext.Provider value={{ projects, activeProject, loading, loadProjects, switchProject, createProject, deleteProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
