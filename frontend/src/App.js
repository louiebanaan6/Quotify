import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { ProjectProvider } from "@/lib/ProjectContext";
import { Toaster } from "sonner";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import AcceptInvite from "@/pages/AcceptInvite";
import Dashboard from "@/pages/Dashboard";
import QuotesList from "@/pages/QuotesList";
import QuoteForm from "@/pages/QuoteForm";
import QuoteDetail from "@/pages/QuoteDetail";
import InvoicesList from "@/pages/InvoicesList";
import InvoiceDetail from "@/pages/InvoiceDetail";
import Clients from "@/pages/Clients";
import Billing from "@/pages/Billing";

function Protected({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Loading...</div>
  );
  if (user === null) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
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
          <I18nProvider>
            <ProjectProvider>
              <Toaster position="top-right" richColors closeButton />
              <Routes>
                {/* Public */}
                <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
                <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
                <Route path="/invite/accept" element={<AcceptInvite />} />

                {/* Protected */}
                <Route path="/" element={<Protected><Dashboard /></Protected>} />
                <Route path="/quotes" element={<Protected><QuotesList /></Protected>} />
                <Route path="/quotes/new" element={<Protected><QuoteForm /></Protected>} />
                <Route path="/quotes/:id" element={<Protected><QuoteDetail /></Protected>} />
                <Route path="/quotes/:id/edit" element={<Protected><QuoteForm /></Protected>} />
                <Route path="/invoices" element={<Protected><InvoicesList /></Protected>} />
                <Route path="/invoices/:id" element={<Protected><InvoiceDetail /></Protected>} />
                <Route path="/clients" element={<Protected><Clients /></Protected>} />
                <Route path="/billing" element={<Protected><Billing /></Protected>} />

                {/* /profile redirects to home — modal opens from sidebar */}
                <Route path="/profile" element={<Navigate to="/" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ProjectProvider>
          </I18nProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
