// lib/queue/email-transport.ts
// Transporte abstrato de e-mail transacional.
// Política: dry-run quando FOLLOWUP_NOTIFY_ENABLED!=true (default console).
//
// Implementações disponíveis (todas opcionais via env):
//   - console        — sempre presente; usado em dev e dry-run
//   - smtp (nodemailer) — SMTP_HOST + SMTP_USER + SMTP_PASSWORD
//   - webhook        — Resend-compatible: POST JSON em EMAIL_WEBHOOK_URL
//
// Sem dependência hard de nodemailer/Resend — import via try/catch lazy.

import { log } from "../observability/log";

// ════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Tag livre — usado na métrica e no log (ex.: "recovery.followup"). */
  topic?: string;
}

export interface EmailResult {
  ok: boolean;
  transportId: string;
  error?: string;
  dryRun: boolean;
}

// ════════════════════════════════════════════════════════
// CONSOLE — sempre disponível
// ════════════════════════════════════════════════════════

export async function consoleTransport(msg: EmailMessage): Promise<EmailResult> {
  const id = `console-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  log({
    level: "info",
    scope: "email",
    event: "console.send",
    msg: `[dry-run] e-mail para ${msg.to}`,
    data: { topic: msg.topic ?? null, subject: msg.subject, transportId: id },
  });
  return { ok: true, transportId: id, dryRun: true };
}

// ════════════════════════════════════════════════════════
// SMTP via nodemailer — opt-in (SMTP_HOST presente)
// ════════════════════════════════════════════════════════

export async function smtpTransport(msg: EmailMessage): Promise<EmailResult> {
  try {
    const mod = await import("nodemailer" as string).catch(() => null);
    if (!mod) {
      return {
        ok: false,
        transportId: "smtp",
        error: "nodemailer não instalado",
        dryRun: false,
      };
    }
    const nodemailer = mod as unknown as {
      createTransport: (cfg: Record<string, unknown>) => {
        sendMail: (m: Record<string, unknown>) => Promise<{ messageId?: string }>;
      };
    };
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    const info = await transporter.sendMail({
      from: msg.from ?? process.env.EMAIL_FROM ?? "noreply@plataforma.local",
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo,
    });
    return {
      ok: true,
      transportId: String(info.messageId ?? "smtp"),
      dryRun: false,
    };
  } catch (e) {
    return {
      ok: false,
      transportId: "smtp",
      error: String((e as Error).message ?? e).slice(0, 200),
      dryRun: false,
    };
  }
}

// ════════════════════════════════════════════════════════
// WEBHOOK (Resend-compatível) — opt-in
// ════════════════════════════════════════════════════════

export async function webhookTransport(msg: EmailMessage): Promise<EmailResult> {
  const url = process.env.EMAIL_WEBHOOK_URL;
  if (!url) {
    return { ok: false, transportId: "webhook", error: "EMAIL_WEBHOOK_URL ausente", dryRun: false };
  }
  try {
    const secret = process.env.EMAIL_WEBHOOK_SECRET;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["Authorization"] = `Bearer ${secret}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: msg.from ?? process.env.EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        topic: msg.topic,
        replyTo: msg.replyTo,
      }),
    });
    if (!res.ok) {
      return { ok: false, transportId: "webhook", error: `HTTP ${res.status}`, dryRun: false };
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, transportId: j.id ?? "webhook", dryRun: false };
  } catch (e) {
    return {
      ok: false,
      transportId: "webhook",
      error: String((e as Error).message ?? e).slice(0, 200),
      dryRun: false,
    };
  }
}

// ════════════════════════════════════════════════════════
// DISPATCHER
// ════════════════════════════════════════════════════════

/**
 * Regra única (CLAUDE.md): se FOLLOWUP_NOTIFY_ENABLED !== "true", nunca envia
 * e-mail real — só loga via console. Default conservador.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (process.env.FOLLOWUP_NOTIFY_ENABLED !== "true") {
    return consoleTransport(msg);
  }
  // habilitado — escolhe transporte pelo env
  if (process.env.SMTP_HOST) return smtpTransport(msg);
  if (process.env.EMAIL_WEBHOOK_URL) return webhookTransport(msg);
  // fallback seguro: log só (nunca envia sem provedor configurado)
  return consoleTransport(msg);
}

/** Helper de diagnóstico: diz qual seria o transporte efetivo. */
export function describeTransport(): {
  enabled: boolean;
  provider: "console" | "smtp" | "webhook";
} {
  const enabled = process.env.FOLLOWUP_NOTIFY_ENABLED === "true";
  if (!enabled) return { enabled, provider: "console" };
  if (process.env.SMTP_HOST) return { enabled, provider: "smtp" };
  if (process.env.EMAIL_WEBHOOK_URL) return { enabled, provider: "webhook" };
  return { enabled, provider: "console" };
}
