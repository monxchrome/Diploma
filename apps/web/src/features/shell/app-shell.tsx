"use client";

import { cn } from "@dip/ui";
import { useQuery } from "@tanstack/react-query";
import {
  Beaker,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { fetchProjects } from "@/features/projects/projects-api";

import { CommandPalette } from "./command-palette";

const navigation = [
  { href: "/home#composer", icon: Plus, label: "New analysis" },
  { href: "/home", icon: Home, label: "Home" },
  { href: "/projects", icon: FolderKanban, label: "Projects" },
  { href: "/experiments", icon: Beaker, label: "Experiments" },
  { href: "/settings/profile", icon: Settings, label: "Settings" },
];

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { apiRequest, logout, status, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const projectsQuery = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchProjects(apiRequest, { status: "active" }),
    queryKey: ["projects", "active"],
  });

  const [sidebarReady, setSidebarReady] = useState(false);

  useEffect(() => {
    window.setTimeout(() => {
      setCollapsed(window.localStorage.getItem("dip:sidebar-collapsed") === "true");
      setSidebarReady(true);
    }, 0);
  }, []);
  useEffect(() => {
    if (sidebarReady) window.localStorage.setItem("dip:sidebar-collapsed", String(collapsed));
  }, [collapsed, sidebarReady]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
          <button
            aria-label="Open navigation"
            className="rounded-lg p-2 text-slate-700 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-200"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link className="font-semibold text-slate-950 dark:text-white" href="/home">
            Decision Intelligence
          </Link>
          <button
            aria-label="Search"
            className="rounded-lg p-2 text-slate-700 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-200"
            onClick={() => setPaletteOpen(true)}
            type="button"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        {mobileOpen ? (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
        ) : null}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white p-3 transition-transform dark:border-slate-800 dark:bg-slate-950 lg:z-20 lg:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
            collapsed ? "lg:w-20" : "lg:w-72",
          )}
        >
          <div className="mb-6 flex h-10 items-center justify-between gap-2 px-1">
            <Link
              className={cn(
                "min-w-0 font-semibold text-slate-950 dark:text-white",
                collapsed && "lg:sr-only",
              )}
              href="/home"
            >
              Decision Intelligence
            </Link>
            <button
              aria-label={
                mobileOpen
                  ? "Close navigation"
                  : collapsed
                    ? "Expand navigation"
                    : "Collapse navigation"
              }
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => {
                if (mobileOpen) setMobileOpen(false);
                else setCollapsed((value) => !value);
              }}
              type="button"
            >
              {mobileOpen ? (
                <X className="h-5 w-5 lg:hidden" aria-hidden="true" />
              ) : collapsed ? (
                <PanelLeftOpen className="hidden h-5 w-5 lg:block" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="hidden h-5 w-5 lg:block" aria-hidden="true" />
              )}
            </button>
          </div>

          <button
            className="mb-2 flex h-10 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => setPaletteOpen(true)}
            title={collapsed ? "Search" : undefined}
            type="button"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className={cn(collapsed && "lg:sr-only")}>Search</span>
            <kbd
              className={cn(
                "ml-auto rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-slate-700",
                collapsed && "lg:hidden",
              )}
            >
              ⌘K
            </kbd>
          </button>
          <nav aria-label="Main navigation" className="grid gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const routePath = item.href.split("#")[0] ?? item.href;
              const active =
                item.href === "/home#composer"
                  ? false
                  : item.href === "/home"
                    ? pathname === "/" || pathname === "/home"
                    : pathname.startsWith(routePath);
              return (
                <Link
                  className={cn(
                    "flex h-11 min-w-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700",
                    active
                      ? "bg-teal-700 text-white"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                    collapsed && "lg:justify-center lg:px-0",
                  )}
                  href={item.href}
                  key={item.label}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={cn("min-w-0 truncate", collapsed && "lg:sr-only")}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className={cn("mt-7 grid gap-2", collapsed && "lg:hidden")}>
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recent projects
            </p>
            {projectsQuery.data?.data.slice(0, 4).map((project) => (
              <Link
                className="truncate rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                href={`/projects/${project.id}`}
                key={project.id}
                onClick={() => setMobileOpen(false)}
              >
                {project.name}
              </Link>
            ))}
          </div>
          <div className="mt-auto border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className={cn("mb-2 px-3", collapsed && "lg:hidden")}>
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                {user?.displayName}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
            </div>
            <Button
              className={cn("w-full justify-start", collapsed && "lg:justify-center lg:px-0")}
              onClick={() => void logout()}
              title={collapsed ? "Log out" : undefined}
              type="button"
              variant="ghost"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={cn(collapsed && "lg:sr-only")}>Log out</span>
            </Button>
          </div>
        </aside>
        <main
          className={cn("min-w-0 px-4 py-7 sm:px-6 lg:py-10", collapsed ? "lg:pl-28" : "lg:pl-80")}
        >
          {children}
        </main>
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          open={paletteOpen}
          projects={projectsQuery.data?.data ?? []}
        />
      </div>
    </ProtectedRoute>
  );
}
