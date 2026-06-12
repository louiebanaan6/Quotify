import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, formatApiErrorDetail, LOGO_URL } from "../lib/api";
import { toast } from "sonner";

export default function Register() {
  const { login } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState("form"); // "form" | "otp"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submitForm = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { register } = await import("../lib/auth").then(m => ({ register: null }));
      // Call API directly
      const res = await api.post("/auth/register", { name, email, password });
      // res.data = { requires_otp: true, email }
      setStep("otp");
      toast.success("Account created! Check your email for the login code.");
    } catch (ex) {
      setErr(formatApiErrorDetail(ex.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await login(email, otp);
      toast.success("Welcome to Quotify!");
      nav("/", { replace: true });
    } catch (ex) {
      setErr(formatApiErrorDetail(ex.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  const resendOtp = async () => {
    setErr("");
    try {
      await api.post("/auth/login", { email, password });
      toast.success("New code sent!");
    } catch (ex) {
      toast.error("Could not resend code.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={LOGO_URL} alt="Quotify" className="h-14 w-auto object-contain mb-4" />
          <h1 className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>
            {step === "form" ? "Create your account" : "Check your email"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === "form"
              ? "Start sending professional quotes in minutes"
              : `We sent a 6-digit code to ${email}`}
          </p>
        </div>

        {step === "form" ? (
          <form onSubmit={submitForm} className="q-card p-7 space-y-4" data-testid="register-form">
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Name</label>
              <input
                data-testid="register-name"
                type="text" required
                value={name} onChange={(e) => setName(e.target.value)}
                className="q-input mt-1.5"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Email</label>
              <input
                data-testid="register-email"
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="q-input mt-1.5"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Password</label>
              <input
                data-testid="register-password"
                type="password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="q-input mt-1.5"
                placeholder="At least 8 characters"
              />
            </div>
            {err && <div className="text-sm text-red-600" data-testid="register-error">{err}</div>}
            <button data-testid="register-submit" disabled={busy} className="q-btn-primary w-full justify-center">
              {busy ? "Creating account…" : "Create account"}
            </button>
            <div className="text-sm text-gray-500 text-center pt-2">
              Already registered? <Link to="/login" className="q-link">Sign in</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={submitOtp} className="q-card p-7 space-y-4" data-testid="otp-form">
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Verification code</label>
              <input
                data-testid="otp-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="q-input mt-1.5 text-center text-2xl tracking-[0.5em] font-semibold"
                placeholder="000000"
              />
              <p className="text-xs text-gray-400 mt-2 text-center">Code expires in 10 minutes</p>
            </div>
            {err && <div className="text-sm text-red-600" data-testid="otp-error">{err}</div>}
            <button data-testid="otp-submit" disabled={busy} className="q-btn-primary w-full justify-center">
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
            <div className="text-sm text-gray-500 text-center pt-2 space-x-3">
              <button type="button" onClick={resendOtp} className="q-link">Resend code</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
