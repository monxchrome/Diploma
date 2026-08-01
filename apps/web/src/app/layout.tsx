import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";
import { getWebConfig } from "@/lib/config";

import "./globals.css";

export const metadata: Metadata = {
  description: "A focused workspace for evidence-informed decisions.",
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
