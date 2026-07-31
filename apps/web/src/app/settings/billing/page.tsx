import { Suspense } from "react";

import { BillingPage } from "@/features/settings/billing-page";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-600">Loading billing…</p>}>
      <BillingPage />
    </Suspense>
  );
}
