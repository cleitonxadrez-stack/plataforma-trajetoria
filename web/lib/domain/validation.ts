// lib/domain/validation.ts
// Validação SEM I/O — pura. Usada pelas Server Actions antes de chamar Supabase.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  const e = (email ?? "").trim();
  return e.length >= 3 && e.length <= 254 && EMAIL_RE.test(e);
}

export function isValidPassword(password: string): boolean {
  return (password ?? "").length >= 8;
}

export function isValidFullName(name: string): boolean {
  return (name ?? "").trim().length >= 3;
}
