// lib/domain/dedupe.ts
// Regra GERAL de deduplicação de itens, aplicada em todo o site (currículo,
// trajetória, contagens). Dois itens do MESMO bucket (seção/tipo) são
// duplicados quando os títulos normalizados são iguais ou um contém o outro.
// Vence o de MAIOR score — a convenção é priorizar quem tem comprovante (R),
// depois o título mais descritivo. Assim a versão documentada sempre prevalece.

export function normTitle(t: string): string {
  // NFD separa acentos em marcas combinantes (não-ASCII) → removidas ao filtrar ASCII.
  return t.normalize("NFD").replace(/[^\x00-\x7F]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Igualdade ou contenção com fronteira de palavra (evita casar trechos curtos). */
function titlesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length < 8) return false; // curto demais → não colapsa por contenção
  return l === s || l.includes(" " + s + " ") || l.startsWith(s + " ") || l.endsWith(" " + s);
}

export interface DedupeMeta { title: string; bucket: string; score: number }

/**
 * Retorna os itens sem duplicatas. `meta` extrai título/bucket/score de cada
 * item; quando dois colidem no mesmo bucket, mantém o de maior score.
 */
export function dedupeItems<T>(items: T[], meta: (t: T) => DedupeMeta): T[] {
  const reps = new Map<string, { title: string; score: number; keep: T }[]>();
  const removed = new Set<T>();

  for (const it of items) {
    const m = meta(it);
    const n = normTitle(m.title);
    const arr = reps.get(m.bucket) ?? [];
    const dup = arr.find((r) => titlesMatch(r.title, n));
    if (dup) {
      if (m.score > dup.score) {
        removed.add(dup.keep); // o representante anterior perde
        dup.keep = it; dup.title = n; dup.score = m.score;
      } else {
        removed.add(it);
      }
    } else {
      arr.push({ title: n, score: m.score, keep: it });
      reps.set(m.bucket, arr);
    }
  }
  return items.filter((it) => !removed.has(it));
}
