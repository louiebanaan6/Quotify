import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, formatApiErrorDetail, LOGO_URL } from "../lib/api";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [step, setStep] = useState("credentials"); // "credentials" | "otp"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Step 1: submit email + password → backend sends OTP
  const submitCredentials = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api.post("/auth/login", { email, password });
      setStep("otp");
      toast.success("Code sent! Check your email.");
    } catch (ex) {
      setErr(formatApiErrorDetail(ex.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  // Step 2: submit OTP → get token & redirect
  const submitOtp = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await login(email, otp);
      toast.success("Welcome back!");
      nav(loc.state?.from || "/", { replace: true });
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
            {step === "credentials" ? "Welcome back" : "Check your email"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === "credentials"
              ? "Log in to manage your quotes"
              : `We sent a 6-digit code to ${email}`}
          </p>
        </div>

        {step === "credentials" ? (
          <form onSubmit={submitCredentials} className="q-card p-7 space-y-4" data-testid="login-form">
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Email</label>
              <input
                data-testid="login-email"
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="q-input mt-1.5"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Password</label>
              <input
                data-testid="login-password"
                type="password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="q-input mt-1.5"
                placeholder="••••••••"
              />
            </div>
            <div className="text-right">
              <Link to="/forgot-password" className="text-xs q-link">Forgot password?</Link>
            </div>
            {err && <div className="text-sm text-red-600" data-testid="login-error">{err}</div>}
            <button data-testid="login-submit" disabled={busy} className="q-btn-primary w-full justify-center">
              {busy ? "Sending code…" : "Continue"}
            </button>
            <div className="text-sm text-gray-500 text-center pt-2">
              New to Quotify? <Link to="/register" data-testid="goto-register" className="q-link">Create account</Link>
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
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <div className="text-sm text-gray-500 text-center pt-2 space-x-3">
              <button type="button" onClick={() => { setStep("credentials"); setErr(""); setOtp(""); }} className="q-link">
                ← Back
              </button>
              <span>·</span>
              <button type="button" onClick={resendOtp} className="q-link">
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
