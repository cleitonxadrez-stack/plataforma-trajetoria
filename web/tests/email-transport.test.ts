// tests/email-transport.test.ts
// Item #7 — 8 specs para email-transport (sem rede real).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildFollowUpEmail,
} from "../lib/queue/followup-email";
import {
  consoleTransport,
  describeTransport,
  sendEmail,
  smtpTransport,
  webhookTransport,
  type EmailMessage,
} from "../lib/queue/email-transport";

const sampleMsg: EmailMessage = {
  to: "user@example.com",
  subject: "Teste",
  text: "Oi",
  topic: "recovery.followup",
};

describe("email-transport", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.FOLLOWUP_NOTIFY_ENABLED;
    delete process.env.SMTP_HOST;
    delete process.env.EMAIL_WEBHOOK_URL;
    delete process.env.SMTP_PASSWORD;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("consoleTransport sempre ok, marca dryRun=true", async () => {
    const r = await consoleTransport(sampleMsg);
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(typeof r.transportId).toBe("string");
    expect(r.transportId.length).toBeGreaterThan(0);
  });

  it("describeTransport → console quando desabilitado", () => {
    const d = describeTransport();
    expect(d.enabled).toBe(false);
    expect(d.provider).toBe("console");
  });

  it("describeTransport → smtp quando FOLLOWUP_NOTIFY_ENABLED=true + SMTP_HOST presente", () => {
    process.env.FOLLOWUP_NOTIFY_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    const d = describeTransport();
    expect(d).toEqual({ enabled: true, provider: "smtp" });
  });

  it("describeTransport → webhook quando só EMAIL_WEBHOOK_URL presente", () => {
    process.env.FOLLOWUP_NOTIFY_ENABLED = "true";
    process.env.EMAIL_WEBHOOK_URL = "https://api.resend.com/emails";
    const d = describeTransport();
    expect(d).toEqual({ enabled: true, provider: "webhook" });
  });

  it("smtpTransport devolve erro quando nodemailer ausente", async () => {
    process.env.FOLLOWUP_NOTIFY_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    const r = await smtpTransport(sampleMsg);
    expect(r.transportId).toBe("smtp");
    // sem nodemailer instalado → false + erro
    expect(typeof r.error).toBe("string");
    expect(r.dryRun).toBe(false);
  });

  it("webhookTransport devolve erro quando EMAIL_WEBHOOK_URL ausente", async () => {
    process.env.FOLLOWUP_NOTIFY_ENABLED = "true";
    const r = await webhookTransport(sampleMsg);
    expect(r.transportId).toBe("webhook");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ausente/i);
  });

  it("sendEmail roteia para console quando FOLLOWUP_NOTIFY_ENABLED=false (padrão)", async () => {
    const r = await sendEmail(sampleMsg);
    expect(r.transportId).toMatch(/^console-/);
    expect(r.dryRun).toBe(true);
  });

  it("buildFollowUpEmail monta subject + corpo com instituição e intervalo", () => {
    const out = buildFollowUpEmail({
      notification: {
        requestId: "r1",
        userId: "u1",
        institutionId: "i1",
        institutionName: "UNIPAR",
        daysPast: 32,
      },
      userEmail: "user@example.com",
      userFullName: "Ada",
      institutionName: "UNIPAR",
      consentTextVersion: "v1",
      daysInterval: 30,
    });
    expect(out.to).toBe("user@example.com");
    expect(out.subject).toMatch(/UNIPAR/);
    expect(out.text).toMatch(/Ada/);
    expect(out.text).toMatch(/30 dias/);
    expect(out.text).toMatch(/UNIPAR/);
    expect(out.topic).toBe("recovery.followup");
  });
});
