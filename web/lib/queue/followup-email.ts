// lib/queue/followup-email.ts
// Bridge entre `planFollowUps()` e o transport real.
// Mantido PURO: recebe a request plan + lookup de email do usuário e gera
// `EmailMessage[]` — caller decide se envia (já com dry-run aplicado).

import type { FollowUpNotification } from "./followup";

export interface FollowUpEmailInput {
  notification: FollowUpNotification;
  userEmail: string;
  userFullName: string;
  institutionName: string;
  consentTextVersion: string;
  daysInterval: number;
}

export function buildFollowUpEmail(input: FollowUpEmailInput): {
  to: string;
  from?: string;
  subject: string;
  text: string;
  topic: "recovery.followup";
} {
  const { userEmail, userFullName, institutionName, daysInterval } = input;
  return {
    to: userEmail,
    subject: `[Plataforma Trajetória] Pendência há ${daysInterval} dias — ${institutionName}`,
    text:
      `Olá, ${userFullName}.\n\n` +
      `Já se passaram ${daysInterval} dias desde a última tentativa com ${institutionName} ` +
      `sobre a carta de cobrança enviada. Caso tenha obtido resposta, ignore; caso contrário, ` +
      `sugerimos novo envio pelo painel em /pendencias.\n\n` +
      `Esta é uma mensagem automática. Não respondemos diretamente a este endereço.\n` +
      `— Plataforma Trajetória`,
    topic: "recovery.followup",
  };
}
