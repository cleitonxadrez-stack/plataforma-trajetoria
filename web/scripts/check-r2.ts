// scripts/check-r2.ts
// Preflight R2 — roda ANTES do deploy pra validar credenciais + buckets.
// Uso:
//   DATABASE_URL=... npx tsx scripts/check-r2.ts
// Saída:
//   exit 0 → tudo OK
//   exit 1 → erro de credencial/bucket
//   exit 2 → R2ConfigError (variáveis faltando)

import { preflight, getR2Config, R2ConfigError } from "@/lib/storage/r2";

async function main() {
  console.log("[check-r2] validando credenciais…");
  let cfg;
  try {
    cfg = getR2Config();
  } catch (e) {
    if (e instanceof R2ConfigError) {
      console.error(`[check-r2] ✗ FALTAM: ${e.missing.join(", ")}`);
      console.error(`[check-r2] Defina no .env ou exporte no shell antes de rodar.`);
      process.exit(2);
    }
    throw e;
  }

  // Mascara secret no log.
  const masked = `${cfg.accessKeyId.slice(0, 4)}…${cfg.accessKeyId.slice(-4)}`;
  console.log(`[check-r2] endpoint=${cfg.endpoint}`);
  console.log(`[check-r2] accessKeyId=${masked}`);
  console.log(`[check-r2] buckets: frio=${cfg.bucketFrio}  quente=${cfg.bucketQuente}`);

  console.log("[check-r2] executando preflight…");
  const r = await preflight({ presignedTtlSec: 600 });

  if (!r.ok) {
    console.error(`[check-r2] ✗ falhou: ${r.error}${r.code ? ` (code=${r.code})` : ""}`);
    console.error(`[check-r2] provável causa: token sem permissões de read/write nos 2 buckets.`);
    process.exit(1);
  }

  console.log(`[check-r2] ✓ HeadBucket OK nos 2 buckets`);
  console.log(`[check-r2] ✓ PutObject + GetObject + Delete em ${r.writeAndDeleteMs}ms`);
  console.log(`[check-r2] ✓ presigned URL gerada (TTL=${r.presignedTtlSec}s) — URL preview não exibe (vazio por design).`);
  console.log(`[check-r2] OK. Pronto para deploy.`);
}

main()
  .then(() => process.exit(0)) // encerra já: o S3Client mantém sockets keep-alive vivos
  .catch((e) => {
    console.error("[check-r2] erro inesperado:", e);
    process.exit(1);
  });
