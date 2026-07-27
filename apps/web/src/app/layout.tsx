import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";
import { getWebConfig } from "@/lib/config";

import "./globals.css";

export const metadata: Metadata = {
  description: "Phase 1 infrastructure status for the Decision Intelligence Platform",
  title: "Decision Intelligence Platform",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  getWebConfig();

  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
