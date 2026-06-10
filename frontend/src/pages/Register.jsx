import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatApiErrorDetail, LOGO_URL } from "../lib/api";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await register(name, email, password);
      toast.success("Account created");
      nav("/", { replace: true });
    } catch (e) {
      setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-black overflow-hidden mb-4">
            <img src={LOGO_URL} alt="Quotify" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>Create your account</h1>
          <p className="text-sm text-gray-500 mt-1">Start sending professional quotes in minutes</p>
        </div>
        <form onSubmit={submit} className="q-card p-7 space-y-4" data-testid="register-form">
          <div>
            <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Name</label>
            <input data-testid="register-name" required value={name} onChange={(e) => setName(e.target.value)} className="q-input mt-1.5" placeholder="John Doe" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Email</label>
            <input data-testid="register-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="q-input mt-1.5" placeholder="you@company.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Password</label>
            <input data-testid="register-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="q-input mt-1.5" placeholder="At least 6 characters" />
          </div>
          {err && <div className="text-sm text-red-600" data-testid="register-error">{err}</div>}
          <button data-testid="register-submit" disabled={busy} className="q-btn-primary w-full justify-center">{busy ? "Creating…" : "Create account"}</button>
          <div className="text-sm text-gray-500 text-center pt-2">
            Already registered? <Link to="/login" data-testid="goto-login" className="q-link">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
