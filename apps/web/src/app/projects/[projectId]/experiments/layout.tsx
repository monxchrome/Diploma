import type { ReactNode } from "react";

import { AppShell } from "@/features/shell/app-shell";

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
