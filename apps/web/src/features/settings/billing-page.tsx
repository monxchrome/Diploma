"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";
import {
  cancelBillingSubscription,
  completeFakeCheckout,
  fetchBillingPlans,
  fetchBillingSubscription,
  openBillingPortal,
  resumeBillingSubscription,
  startCheckout,
} from "@/features/projects/projects-api";

export function BillingPage() {
  const { apiRequest, status } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const completedSessionId = useRef<string | null>(null);
  const enabled = status === "authenticated";
  const plans = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => fetchBillingPlans(apiRequest),
    enabled,
  });
  const subscription = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => fetchBillingSubscription(apiRequest),
    enabled,
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["billing"] });
  const checkout = useMutation({
    mutationFn: (planCode: "PRO" | "TEAM") => startCheckout(apiRequest, planCode),
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
  });
  const portal = useMutation({
    mutationFn: () => openBillingPortal(apiRequest),
    onSuccess: ({ portalUrl }) => window.location.assign(portalUrl),
  });
  const cancel = useMutation({
    mutationFn: () => cancelBillingSubscription(apiRequest),
    onSuccess: invalidate,
  });
  const resume = useMutation({
    mutationFn: () => resumeBillingSubscription(apiRequest),
    onSuccess: invalidate,
  });
  const fakeCheckout = useMutation({
    mutationFn: (sessionId: string) => completeFakeCheckout(apiRequest, sessionId),
    onSuccess: invalidate,
  });
  const fakeSessionId = searchParams.get("session_id");
  useEffect(() => {
    if (
      !fakeSessionId?.startsWith("fake_checkout_") ||
      completedSessionId.current === fakeSessionId ||
      fakeCheckout.isPending
    ) {
      return;
    }
    completedSessionId.current = fakeSessionId;
    fakeCheckout.mutate(fakeSessionId);
  }, [fakeCheckout, fakeSessionId]);
  const current = subscription.data;

  return (
    <AppShell>
      <section className="grid gap-6">
        <div>
          <p className="text-sm font-medium text-teal-700">Settings</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Billing</h2>
          <p className="mt-2 text-sm text-slate-600">
            Subscription changes take effect only after a verified provider webhook.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-600">Current plan</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {current?.planCode ?? "Loading..."}
              </p>
              <p className="mt-1 text-sm text-slate-600">Status: {current?.status ?? "-"}</p>
              {current?.currentPeriodEnd ? (
                <p className="mt-1 text-sm text-slate-600">
                  Current period ends {new Date(current.currentPeriodEnd).toLocaleDateString()}
                </p>
              ) : null}
              {current?.cancelAtPeriodEnd ? (
                <p className="mt-1 text-sm font-medium text-amber-700">
                  Cancellation is scheduled at period end.
                </p>
              ) : null}
              {current?.status === "PAST_DUE" ? (
                <p className="mt-1 text-sm font-medium text-amber-700">
                  Payment needs attention. Existing data remains available while the provider
                  updates status.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {current && current.planCode !== "FREE" ? (
                <Button
                  aria-label="Open billing management portal"
                  variant="ghost"
                  disabled={portal.isPending}
                  onClick={() => portal.mutate()}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Manage billing
                </Button>
              ) : null}
              {current && current.planCode !== "FREE" && !current.cancelAtPeriodEnd ? (
                <Button
                  aria-label="Cancel subscription at period end"
                  variant="ghost"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  Cancel at period end
                </Button>
              ) : null}
              {current && current.planCode !== "FREE" && current.cancelAtPeriodEnd ? (
                <Button
                  aria-label="Resume subscription"
                  disabled={resume.isPending}
                  onClick={() => resume.mutate()}
                >
                  Resume subscription
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.data?.map((plan) => (
            <article
              key={plan.code}
              className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-slate-950">{plan.displayName}</h3>
              <p className="mt-2 min-h-10 text-sm text-slate-600">{plan.description}</p>
              <p className="mt-2 text-sm font-medium text-slate-700">{plan.displayPrice}</p>
              <dl className="mt-4 grid gap-2 text-sm text-slate-700">
                <div className="flex justify-between gap-3">
                  <dt>Projects</dt>
                  <dd>{String(plan.entitlements.maximumOwnedProjects)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Monthly analyses</dt>
                  <dd>{String(plan.entitlements.monthlyAnalysisRuns)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>External research</dt>
                  <dd>
                    {plan.entitlements.externalResearchAvailable ? "Included" : "Unavailable"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Experiments</dt>
                  <dd>{plan.entitlements.experimentsAvailable ? "Included" : "Unavailable"}</dd>
                </div>
              </dl>
              {plan.code === "PRO" || plan.code === "TEAM" ? (
                <Button
                  className="mt-5 w-full"
                  aria-label={`Choose ${plan.displayName} plan`}
                  disabled={!plan.checkoutAvailable || checkout.isPending}
                  onClick={() => checkout.mutate(plan.code === "PRO" ? "PRO" : "TEAM")}
                >
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  Choose {plan.displayName}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
        {checkout.isError ||
        fakeCheckout.isError ||
        portal.isError ||
        cancel.isError ||
        resume.isError ? (
          <p className="text-sm font-medium text-rose-700" role="alert">
            Billing action could not be completed. No plan change is assumed until the provider
            confirms it.
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}
