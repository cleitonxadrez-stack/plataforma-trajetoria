// lib/admin/access.ts
// Controle de acesso ao /admin por lista de e-mails (env ADMIN_EMAILS).
// Sem a env definida, NINGUÉM é admin (seguro por padrão).

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
