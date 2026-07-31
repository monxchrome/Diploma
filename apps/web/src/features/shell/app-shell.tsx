"use client";

import { cn } from "@dip/ui";
import {
  CreditCard,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { useAuth } from "@/features/auth/auth-provider";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/projects", icon: FolderKanban, label: "Projects" },
  { href: "/settings/profile", icon: UserRound, label: "Profile" },
  { href: "/settings/sessions", icon: ShieldCheck, label: "Sessions" },
  { href: "/settings/billing", icon: CreditCard, label: "Billing" },
  { href: "/settings/usage", icon: Gauge, label: "Usage" },
];

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-teal-700">Decision Intelligence</p>
              <h1 className="mt-1 text-xl font-semibold text-slate-950">
                {user?.displayName ?? "Workspace"}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-teal-700 text-white"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
              <Button variant="ghost" onClick={() => void logout()}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Logout
              </Button>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </ProtectedRoute>
  );
}
