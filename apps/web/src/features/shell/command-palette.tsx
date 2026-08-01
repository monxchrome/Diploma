"use client";

import { Command, FolderKanban, Home, Search, Settings, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const destinations = [
  { href: "/home#composer", icon: Command, label: "New analysis" },
  { href: "/home", icon: Home, label: "Home" },
  { href: "/projects", icon: FolderKanban, label: "Projects" },
  { href: "/settings/profile", icon: Settings, label: "Settings" },
];

export function CommandPalette({
  onClose,
  open,
  projects,
}: Readonly<{ onClose: () => void; open: boolean; projects: { id: string; name: string }[] }>) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) {
      window.setTimeout(() => setQuery(""), 0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!open) return null;
  const normalized = query.toLowerCase();
  const matches = destinations.filter((item) => item.label.toLowerCase().includes(normalized));
  const matchedProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(normalized),
  );
  function go(href: string): void {
    onClose();
    router.push(href);
  }
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-start bg-slate-950/40 px-4 pt-[12vh]"
      onMouseDown={onClose}
      role="dialog"
      aria-label="Search workspace"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-700">
          <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
          <input
            aria-label="Search workspace"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages and projects…"
            ref={inputRef}
            value={query}
          />
          <button
            aria-label="Close search"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:hover:bg-slate-800"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {matches.length > 0 ? (
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Navigate
            </p>
          ) : null}
          {matches.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
                key={item.href}
                onClick={() => go(item.href)}
                type="button"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
          {matchedProjects.length > 0 ? (
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Projects
            </p>
          ) : null}
          {matchedProjects.map((project) => (
            <button
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
              key={project.id}
              onClick={() => go(`/projects/${project.id}`)}
              type="button"
            >
              <FolderKanban className="h-4 w-4" aria-hidden="true" />
              {project.name}
            </button>
          ))}
          {matches.length === 0 && matchedProjects.length === 0 ? (
            <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
              Nothing found in your accessible workspace.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
