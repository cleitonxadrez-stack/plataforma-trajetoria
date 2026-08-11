// app/api/dossies/route.ts
// POST /api/dossies — persiste metodologia + cria dossier.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TRAJETORIA_V1 } from "@/lib/domain/methodology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: ures, error: uerr } = await sb.auth.getUser();
  if (uerr || !ures?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const body = await req.json() as {
    methodId?: string;
    title: string;
    purpose?: string;
    method?: {
      title?: string;
      status: string;
      windowYears: number | null;
      applyCaps: boolean;
      coauthorRule: { threshold: number; factor: number } | null;
      rules: Array<{
        categoryLabel: string;
        itemType: string;
        qualisStratum: string | null;
        points: number;
        capPerYear: number | null;
        capPerCategory: number | null;
        capTotal: number | null;
        orderIndex: number;
      }>;
    };
  };

  if (!body.title?.trim()) return NextResponse.json({ error: "título obrigatório" }, { status: 400 });

  let methodId = body.methodId;
  let rulesToInsert: NonNullable<typeof body.method>["rules"] = [];

  if (body.method) {
    const m = body.method;
    const { data: rm, error: e1 } = await sb
      .from("ranking_methods")
      .insert({
        user_id: ures.user.id,
        name: m.title ?? body.title,
        version: 1,
        scope: "EDITAL",
        source_document_id: null,
        valid_from: null,
        valid_until: null,
        window_years: m.windowYears,
        apply_caps: m.applyCaps,
        coauthor_rule: m.coauthorRule,
        is_public: false,
        verified_by_user: false,
      })
      .select("id")
      .single();
    if (e1 || !rm) return NextResponse.json({ error: e1?.message ?? "erro ao criar método" }, { status: 500 });
    methodId = (rm as { id: string }).id;
    rulesToInsert = m.rules;
  } else if (methodId === "tray-v1" || !methodId) {
    // Pega o método público Trajetória v1 (seed). Se não existir, cria.
    const { data: existing } = await sb
      .from("ranking_methods")
      .select("id")
      .eq("name", TRAJETORIA_V1.method.name)
      .eq("is_public", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      methodId = (existing as { id: string }).id;
    } else {
      const { data: rm, error: e1 } = await sb
        .from("ranking_methods")
        .insert({
          user_id: ures.user.id,
          name: TRAJETORIA_V1.method.name,
          version: TRAJETORIA_V1.method.version,
          scope: TRAJETORIA_V1.method.scope,
          source_document_id: null,
          valid_from: TRAJETORIA_V1.method.validFrom,
          valid_until: TRAJETORIA_V1.method.validUntil,
          window_years: TRAJETORIA_V1.method.windowYears,
          apply_caps: TRAJETORIA_V1.method.applyCaps,
          coauthor_rule: TRAJETORIA_V1.method.coauthorRule,
          is_public: TRAJETORIA_V1.method.isPublic,
          verified_by_user: TRAJETORIA_V1.method.verifiedByUser,
        })
        .select("id")
        .single();
      if (e1 || !rm) return NextResponse.json({ error: e1?.message ?? "erro" }, { status: 500 });
      methodId = (rm as { id: string }).id;
      rulesToInsert = TRAJETORIA_V1.rules;
    }
    // Replica as regras (uma vez por sessão de usuário).
    const { data: existingRules } = await sb
      .from("ranking_rules")
      .select("id, category_label, item_type, qualis_stratum, points, cap_per_year, cap_per_category, cap_total, order_index, conditions")
      .eq("method_id", methodId)
      .is("deleted_at", null);
    if (!existingRules || existingRules.length === 0 && rulesToInsert.length === 0) {
      // First time — seed rules
      const rows = TRAJETORIA_V1.rules.map((r) => ({
        method_id: methodId,
        user_id: ures.user.id,
        category_label: r.categoryLabel,
        item_type: r.itemType,
        qualis_stratum: r.qualisStratum,
        points: r.points,
        cap_per_year: r.capPerYear,
        cap_per_category: r.capPerCategory,
        cap_total: r.capTotal,
        order_index: r.orderIndex,
        conditions: r.conditions,
      }));
      await sb.from("ranking_rules").insert(rows);
    } else if ((!existingRules || existingRules.length === 0) && rulesToInsert.length === 0) {
      // no-op
    }
    if ((!existingRules || existingRules.length === 0) && rulesToInsert.length > 0) {
      // was set above via TRAJETORIA_V1; if user supplied rules via method: payload, insert them.
      const rows = rulesToInsert.map((r) => ({
        method_id: methodId,
        user_id: ures.user.id,
        category_label: r.categoryLabel,
        item_type: r.itemType,
        qualis_stratum: r.qualisStratum,
        points: r.points,
        cap_per_year: r.capPerYear,
        cap_per_category: r.capPerCategory,
        cap_total: r.capTotal,
        order_index: r.orderIndex,
        conditions: null,
      }));
      await sb.from("ranking_rules").insert(rows);
    }
  }

  const { data: dossier, error: ed } = await sb
    .from("dossiers")
    .insert({
      user_id: ures.user.id,
      method_id: methodId,
      title: body.title,
      purpose: body.purpose ?? null,
      status: "RASCUNHO",
    })
    .select("id")
    .single();
  if (ed || !dossier) return NextResponse.json({ error: ed?.message ?? "erro ao criar dossiê" }, { status: 500 });
  return NextResponse.json({ id: (dossier as { id: string }).id });
}
