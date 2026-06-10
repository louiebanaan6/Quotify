import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import QuotesList from "@/pages/QuotesList";
import QuoteForm from "@/pages/QuoteForm";
import QuoteDetail from "@/pages/QuoteDetail";
import Clients from "@/pages/Clients";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";

function Protected({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Loading…</div>;
  }
  if (user === null) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" richColors closeButton />
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/quotes" element={<Protected><QuotesList /></Protected>} />
            <Route path="/quotes/new" element={<Protected><QuoteForm /></Protected>} />
            <Route path="/quotes/:id" element={<Protected><QuoteDetail /></Protected>} />
            <Route path="/quotes/:id/edit" element={<Protected><QuoteForm /></Protected>} />
            <Route path="/clients" element={<Protected><Clients /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="/billing" element={<Protected><Billing /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
