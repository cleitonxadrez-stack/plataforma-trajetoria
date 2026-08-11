// lib/domain/actions/review.ts
// Server action: confirmar / corrigir / descartar extração.
//
// REGRA (CLAUDE.md §"IA nunca decide sozinha"):
//   *Nada entra como CONFIRMADO sem ação humana*. O fluxo pedido é:
//     "Identificamos estas informações. Confirme ou edite."
//   Só após clique o documento passa de PENDENTE → CONFIRMADO.
//
// Em paralelo com B3, esta action cria a vinculação N:N `evidences` quando
// o usuário confirma + seleciona um `academic_items` no mesmo fluxo.

"use server";

import { createClient } from "@/lib/supabase/server";

export type ReviewAction = "CONFIRMAR" | "CORRIGIR" | "DESCARTAR";

export interface ReviewPayload {
  documentId: string;
  action: ReviewAction;
  /** Campos editados — usados quando action=CORRIGIR */
  fields?: {
    documentType?: string;
    title?: string;
    institutionName?: string;
    year?: number;
    eventName?: string;
    cargaHoraria?: number;
    doi?: string;
  };
  /** Quando CONFIRMAR e o usuário escolheu um item acadêmico existente */
  bindTo?: { itemId: string; role?: "PRIMARY" | "PARCIAL" | "REFERENCIA" };
}

export type ReviewResult = { ok: true } | { ok: false; error: string };

export async function reviewExtraction(input: ReviewPayload): Promise<ReviewResult> {
  const supabase = await createClient();
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) return { ok: false, error: "Não autenticado." };
  const userId = userData.user.id;

  // ── DESCARTAR: soft-delete do documento ────────────────────────
  if (input.action === "DESCARTAR") {
    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString(), processing_status: "DESCARTADO" })
      .eq("id", input.documentId)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // ── CONFIRMAR ou CORRIGIR — atualiza o documento ─────────────
  const updates: Record<string, unknown> = {
    processing_status: input.action === "CONFIRMAR" ? "CONFIRMADO" : "CORRIGIDO",
  };
  if (input.action === "CORRIGIR" && input.fields) {
    // Persistimos correções em uma coluna extra — não tocamos na original (CLAUDE.md).
    updates["extracted_text"] = JSON.stringify(input.fields);
  }
  const { error: docErr } = await supabase
    .from("documents")
    .update(updates)
    .eq("id", input.documentId)
    .eq("user_id", userId);
  if (docErr) return { ok: false, error: docErr.message };

  // ── Se o usuário escolheu vincular a um item — cria evidence ──
  if (input.bindTo && (input.action === "CONFIRMAR" || input.action === "CORRIGIR")) {
    const { error: eviErr } = await supabase
      .from("evidences")
      .upsert({
        user_id: userId,
        item_id: input.bindTo.itemId,
        document_id: input.documentId,
        role: input.bindTo.role ?? "PRIMARY",
        confidence: "0.95",
      }, { onConflict: "item_id,document_id" });
    if (eviErr) return { ok: false, error: eviErr.message };
  }

  return { ok: true };
}
