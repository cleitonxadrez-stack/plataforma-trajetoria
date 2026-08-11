"use client";

// src/components/EntrarForm.tsx
// Wrapper de LoginForm aceitando `?redirect=` da URL.

import { LoginForm } from "./LoginForm";
import { useSearchParams } from "next/navigation";

export function EntrarForm() {
  const sp = useSearchParams();
  const redirect = sp.get("redirect") ?? undefined;
  return <LoginForm redirectTo={redirect} />;
}
