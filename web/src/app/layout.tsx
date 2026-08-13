import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trajetória360 — Trajetória acadêmica documentada e verificável",
  description:
    "SaaS que transforma o currículo acadêmico de declaração em trajetória documentada e verificável.",
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
