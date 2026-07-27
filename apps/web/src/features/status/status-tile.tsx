import type { ServiceStatus } from "@dip/contracts";
import { cn } from "@dip/ui";
import type { LucideIcon } from "lucide-react";

type StatusTileProps = {
  icon: LucideIcon;
  label: string;
  status?: ServiceStatus;
  value?: string;
};

const statusClasses: Record<ServiceStatus, string> = {
  degraded: "border-amber-200 bg-amber-50 text-amber-800",
  down: "border-red-200 bg-red-50 text-red-800",
  ok: "border-teal-200 bg-teal-50 text-teal-800",
};

export function StatusTile({ icon: Icon, label, status, value }: StatusTileProps) {
  const content = status ?? value ?? "Unknown";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 break-words text-lg font-semibold text-slate-950">{content}</p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border",
            status ? statusClasses[status] : "border-slate-200 bg-slate-50 text-slate-600",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
