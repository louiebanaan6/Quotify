// frontend/src/pages/AcceptInvite.jsx
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useProject } from "../lib/ProjectContext";

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const { user, refresh } = useAuth();
  const { loadProjects, loadPendingInvites } = useProject();

  const [status, setStatus] = useState("loading"); // loading | success | needs_account | error
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setError("Invalid invite link."); return; }
    accept();
  }, [token]);

  const accept = async () => {
    try {
      const { data } = await api.post(`/invite/accept?token=${token}`);

      if (data.needs_account) {
        // Not logged in / no account — redirect to register with token
        navigate(`/register?invite=${token}&email=${encodeURIComponent(data.email)}`);
        return;
      }

      if (data.ok) {
        // Save token so Bearer header works cross-origin
        if (data.token) localStorage.setItem("quotify_token", data.token);
        setProjectName(data.project_name || "the project");
        await refresh();
        await loadProjects();
        await loadPendingInvites();
        setStatus("success");
        setTimeout(() => navigate("/"), 2000);
      }
    } catch (e) {
      setStatus("error");
      setError(e.response?.data?.detail || "Something went wrong.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] px-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8 text-center">
        <div className="mb-6">
          <img src="/logo.svg" alt="Quotify" className="h-8 mx-auto" onError={(e) => { e.target.style.display = "none"; }} />
        </div>

        {status === "loading" && (
          <>
            <div className="w-10 h-10 border-4 border-[#0066FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 text-sm">Accepting invitation...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2" style={{ fontFamily: "Manrope" }}>
              Joined!
            </h2>
            <p className="text-sm text-gray-500">
              You have joined <strong>{projectName}</strong>. Redirecting to dashboard...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2" style={{ fontFamily: "Manrope" }}>
              Invalid invite
            </h2>
            <p className="text-sm text-gray-500 mb-5">{error}</p>
            <button onClick={() => navigate("/")} className="q-btn-primary w-full justify-center">
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
