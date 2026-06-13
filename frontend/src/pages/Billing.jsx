import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { api } from "../lib/api";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

export default function Billing() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session_id");
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let attempts = 0; let stopped = false;
    setPolling(true);
    const poll = async () => {
      while (!stopped && attempts < 10) {
        attempts++;
        try {
          const { data } = await api.get(`/billing/status/${sessionId}`);
          if (data.payment_status === "paid") {
            toast.success("Welcome to Pro!");
            refresh();
            setParams({}, { replace: true });
            setPolling(false);
            return;
          }
          if (data.status === "expired") {
            toast.error("Checkout expired");
            setPolling(false);
            return;
          }
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 2000));
      }
      setPolling(false);
    };
    poll();
    return () => { stopped = true; };
  }, [sessionId]);

  const upgrade = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/billing/checkout", { origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) {
      toast.error("Could not start checkout");
      setBusy(false);
    }
  };

  const isPro = user?.plan === "pro";

  const freeFeatures = [
    "Up to 3 quotes",
    "Up to 2 projects",
    "PDF export",
    "Email delivery",
    "Client management",
  ];

  const proFeatures = [
    "Unlimited quotes",
    "Unlimited projects",
    "Team members (up to 5)",
    "PDF export with your logo",
    "Priority email delivery",
    "Custom email signature",
    "Quote status tracking",
    "Priority support",
  ];

  return (
    <AppLayout title="Billing">
      {polling && (
        <div className="q-card p-4 mb-6 text-sm text-blue-700" style={{ background: "#EFF6FF" }}>
          Confirming your payment…
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {/* Free */}
        <div className={`q-card p-7 ${!isPro ? "ring-2 ring-[#0066FF]" : ""}`}>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold" style={{ fontFamily: "Manrope" }}>Free</h3>
            {!isPro && <span className="q-badge q-badge-sent">Current plan</span>}
          </div>
          <div className="mt-3 mb-5">
            <span className="text-4xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>€0</span>
            <span className="text-sm text-gray-500 ml-1">forever</span>
          </div>
          <ul className="space-y-2.5 mb-6">
            {freeFeatures.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <Check size={16} className="text-emerald-500 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>
          <button disabled className="q-btn-secondary w-full justify-center opacity-60">
            {!isPro ? "Current plan" : "Downgrade"}
          </button>
        </div>

        {/* Pro */}
        <div className={`q-card p-7 ${isPro ? "ring-2 ring-[#0066FF]" : ""}`}>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold" style={{ fontFamily: "Manrope" }}>Pro</h3>
            {isPro && <span className="q-badge q-badge-sent">Current plan</span>}
          </div>
          <div className="mt-3 mb-5">
            <span className="text-4xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>€49</span>
            <span className="text-sm text-gray-500 ml-1">/month</span>
          </div>
          <ul className="space-y-2.5 mb-6">
            {proFeatures.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <Check size={16} className="text-emerald-500 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>
          {isPro ? (
            <button disabled className="q-btn-secondary w-full justify-center opacity-60">Active</button>
          ) : (
            <button
              onClick={upgrade}
              disabled={busy}
              className="q-btn-primary w-full justify-center"
            >
              <Sparkles size={16} /> {busy ? "Redirecting…" : "Upgrade to Pro"}
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
