import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail, LOGO_URL } from "../lib/api";
import { toast } from "sonner";

export default function ForgotPassword() {
  const nav = useNavigate();
  const [step, setStep] = useState("email"); // "email" | "otp"
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submitEmail = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api.post("/auth/forgot-password", { email });
      setStep("otp");
      toast.success("Check your email for the reset code.");
    } catch (ex) {
      setErr(formatApiErrorDetail(ex.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setErr("");
    if (newPassword !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { email, otp, new_password: newPassword });
      toast.success("Password reset! You can now log in.");
      nav("/login");
    } catch (ex) {
      setErr(formatApiErrorDetail(ex.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={LOGO_URL} alt="Quotify" className="h-14 w-auto object-contain mb-4" />
          <h1 className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>
            {step === "email" ? "Reset password" : "Set new password"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === "email"
              ? "Enter your email and we'll send a reset code"
              : `Enter the code sent to ${email} and your new password`}
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={submitEmail} className="q-card p-7 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Email</label>
              <input
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="q-input mt-1.5"
                placeholder="you@company.com"
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button disabled={busy} className="q-btn-primary w-full justify-center">
              {busy ? "Sending…" : "Send reset code"}
            </button>
            <div className="text-sm text-gray-500 text-center pt-2">
              <Link to="/login" className="q-link">← Back to login</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={submitReset} className="q-card p-7 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Reset code</label>
              <input
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
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">New password</label>
              <input
                type="password" required
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="q-input mt-1.5"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 tracking-wide uppercase">Confirm password</label>
              <input
                type="password" required
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="q-input mt-1.5"
                placeholder="••••••••"
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button disabled={busy} className="q-btn-primary w-full justify-center">
              {busy ? "Resetting…" : "Reset password"}
            </button>
            <div className="text-sm text-gray-500 text-center pt-2 space-x-3">
              <button type="button" onClick={() => { setStep("email"); setErr(""); }} className="q-link">
                ← Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
