// lib/queue/pgboss.ts
// pg-boss — fila dentro do próprio Postgres. Zero servidor extra.
//
// Jobs conhecidos do projeto (vide docs/05-fluxos.md §"Mapa de Jobs"):
//   - extract-cascade        : passo 1..6 da cascata em um documento
//   - identity-resolve       : resolve DOI / ISBN / ISSN em bases externas
//   - normalize              : cria versão otimizada do original
//   - re-extract             : re-cascata após correção humana

import PgBoss from "pg-boss";

let _boss: PgBoss | null = null;

export async function boss(): Promise<PgBoss> {
  if (_boss) return _boss;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[queue] DATABASE_URL não definida — pg-boss não inicializou.");
  _boss = new PgBoss({
    connectionString: url,
    max: 4,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 30,  // 30 segundos, cresce com tentativas
  });
  await _boss.start();
  return _boss;
}

export type JobName =
  | "extract-cascade"
  | "identity-resolve"
  | "normalize"
  | "re-extract"
  | "compute-indicators"
  | "parse-edital"
  | "generate-dossier-pdf"
  | "pdf-generate"
  | "import-lattes-xml"
  | "detect-duplicates"
  | "recovery-build"
  | "follow-up-requests";

export async function enqueue(name: JobName, data: Record<string, unknown>): Promise<string | null> {
  const b = await boss();
  return b.send(name, data);
}

export async function work<T extends Record<string, unknown>>(
  name: JobName,
  handler: (data: T) => Promise<void>,
): Promise<void> {
  const b = await boss();
  await b.work(name, async ([job]) => {
    try {
      await handler(job.data as T);
    } catch (err) {
      // Em caso de erro, pg-boss retenta até retryLimit automaticamente.
      // Aqui só logamos — em produção vai para Sentry ou audit_logs.
      // eslint-disable-next-line no-console
      console.error(`[queue:${name}]`, err);
      throw err;
    }
  });
}

export async function scheduleDaily(name: JobName, cronTime: string): Promise<void> {
  const b = await boss();
  await b.schedule(name, cronTime);
}

/** Shutdown limpo — usar em sinais de terminação. */
export async function stop(): Promise<void> {
  if (_boss) { await _boss.stop({ graceful: true, wait: true }); _boss = null; }
}
