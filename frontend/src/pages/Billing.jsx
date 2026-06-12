import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { api } from "../lib/api";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

export default function Billing() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
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
            toast.success("Welcome to Pro! 🎉");
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
    // eslint-disable-next-line
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

  const Card = ({ name, price, features, current, action }) => (
    <div className={`q-card p-7 ${current ? "ring-2 ring-[#0066FF]" : ""}`} data-testid={`plan-${name.toLowerCase()}`}>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-lg font-semibold" style={{ fontFamily: "Manrope" }}>{name}</h3>
        {current && <span className="q-badge q-badge-sent">Current plan</span>}
      </div>
      <div className="mt-3 mb-5">
        <span className="text-4xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>{price}</span>
        {price !== "Free" && <span className="text-sm text-gray-500 ml-1">/month</span>}
      </div>
      <ul className="space-y-2.5 mb-6">
        {features.map((f, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700"><Check size={16} className="text-emerald-500 shrink-0 mt-0.5"/> {f}</li>
        ))}
      </ul>
      {action}
    </div>
  );

  return (
    <AppLayout title="Billing">
      {polling && (
        <div className="q-card p-4 mb-6 text-sm text-blue-700" style={{ background: "#EFF6FF" }} data-testid="polling-status">
          Confirming your payment…
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        <Card
          name="Free"
          price="Free"
          current={!isPro}
          features={["Up to 3 quotes", "PDF export", "Email delivery", "Client management"]}
          action={!isPro ? <button disabled className="q-btn-secondary w-full justify-center opacity-60">Current plan</button> : null}
        />
        <Card
          name="Pro"
          price="€49"
          current={isPro}
          features={["Unlimited quotes", "Priority email delivery", "Premium PDF layouts", "All Free features"]}
          action={
            isPro
              ? <button disabled className="q-btn-secondary w-full justify-center opacity-60">Active</button>
              : <button data-testid="upgrade-btn" onClick={upgrade} disabled={busy} className="q-btn-primary w-full justify-center"><Sparkles size={16}/> {busy ? "Redirecting…" : "Upgrade to Pro"}</button>
          }
        />
      </div>
    </AppLayout>
  );
}
