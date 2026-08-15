// src/components/NavHeader.tsx
// Wrapper server: descobre auth + foto/iniciais do usuário e renderiza o NavBar.
// Oculto na impressão (@media print em globals.css).

import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";

export async function NavHeader() {
  let authed = false;
  let photoUrl: string | null = null;
  let initials = "·";
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    authed = !!data.user;
    if (authed && data.user) {
      const { data: pd } = await sb.from("personal_data").select("full_name").eq("user_id", data.user.id).maybeSingle<{ full_name: string }>();
      const name = pd?.full_name ?? (data.user.email ?? "");
      const parts = name.trim().split(/\s+/).filter(Boolean);
      initials = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "·";
      const { data: foto } = await sb.from("personal_documents").select("document_id").eq("category", "FOTO").limit(1).maybeSingle<{ document_id: string }>();
      photoUrl = foto?.document_id ? `/api/documentos/${foto.document_id}` : null;
    }
  } catch {
    authed = false;
  }
  return <NavBar authed={authed} photoUrl={photoUrl} initials={initials} />;
}
