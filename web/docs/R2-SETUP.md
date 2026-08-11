# Cloudflare R2 — provisionamento + validação

Passos exatos para ligar o storage da Plataforma Trajetória no Cloudflare R2.
Tempo estimado: 15 minutos.

## 1. Criar conta Cloudflare + ativar R2

- Acesse https://dash.cloudflare.com → R2 → "Create bucket"
- Plano free: 10 GB armazenamento + 10 M reads/mês — suficiente para começar

## 2. Criar BUCKETS (NÃO use defaults)

Crie **dois buckets** com nomes exatos:

| Bucket | Uso | Lifecycle (recomendado) |
|---|---|---|
| `plataforma-frio` | Originais imutáveis (raw uploads, XML Lattes, PDFs brutos) | sem expiração — manter 7 anos por compliance acadêmico |
| `plataforma-quente` | Versões otimizadas servidas via CDN | otimizar após 30 dias, expirar após 365 dias (reprocessar via worker) |

**Importante**: mantenha os dois privados. Nenhum "Public bucket" deve estar habilitado.

## 3. Gerar API TOKEN com escopo limitado

R2 → Manage R2 API Tokens → Create API token:

- **Token name**: `plataforma-trajetoria-prod`
- **Permissions**: Object Read & Write
- **Bucket scope**: Specific buckets → selecione APENAS `plataforma-frio` e `plataforma-quente`
- **TTL**: 90 dias (renove periodicamente)

O token retorna **Access Key ID** e **Secret Access Key** — anote, são exibidos UMA vez.

## 4. Endpoint

Em `Account ID` → R2 → você vê o endpoint do tipo:
```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```
Esse é o valor de `R2_ENDPOINT`.

## 5. Configurar no Vercel

Vercel → Project → Settings → Environment Variables (Production + Preview + Development):

| Nome | Valor | Notas |
|---|---|---|
| `R2_ENDPOINT` | https://ACCOUNT_ID.r2.cloudflarestorage.com | |
| `R2_ACCESS_KEY_ID` | r2_xxx | |
| `R2_SECRET_ACCESS_KEY` | xxx | |
| `R2_BUCKET_FRIO` | plataforma-frio | opcional — default |
| `R2_BUCKET_QUENTE` | plataforma-quente | opcional — default |

## 6. Validar LOCAL antes do deploy

```bash
# Carrega do .env.example copiado → .env.local
export $(grep -v '^#' .env.local | xargs)

# Pré-flight que escreve/ler/apaga um probe nos 2 buckets
npx tsx scripts/check-r2.ts
```

Saída esperada:
```
[check-r2] endpoint=https://…r2.cloudflarestorage.com
[check-r2] accessKeyId=r2_xx…xx
[check-r2] buckets: frio=plataforma-frio  quente=plataforma-quente
[check-r2] executando preflight…
[check-r2] ✓ HeadBucket OK nos 2 buckets
[check-r2] ✓ PutObject + GetObject + Delete em 145ms
[check-r2] ✓ presigned URL gerada (TTL=600s) — URL preview não exibe (vazio por design).
[check-r2] OK. Pronto para deploy.
```

Códigos de saída:
- 0 → tudo OK
- 1 → token sem permissão / bucket não criado
- 2 → variável de ambiente faltando (`R2ConfigError`)

## 7. Validar em PRODUÇÃO depois do deploy

```bash
./scripts/smoke-deploy.sh https://SEU-DOMINIO.example
```

O script chama `GET /api/health?ready=1` que checa Supabase + R2 e retorna 200 se ambos OK. Se voltar 503, abra o JSON retornado — seção `checks.r2` traz a mensagem exata.

## 8. Rotação de credenciais

A cada 90 dias (TTL do token):
1. Criar novo token
2. Atualizar env vars no Vercel (redeploy automático trigga container novo)
3. Revogar token antigo no dashboard Cloudflare

## Falhas comuns

| Mensagem | Causa | Ação |
|---|---|---|
| `config ausente: R2_ACCESS_KEY_ID` | .env sem a var | copiar do Cloudflare + reiniciar terminal |
| `403 Forbidden` no HeadBucket | token sem permissão no bucket | recriar token com bucket scope correto |
| `NoSuchBucket` | bucket não existe | criar buckets `plataforma-frio` e `plataforma-quente` |
| `S3 API request fails` | endpoint errado | conferir `R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com` |
| Custo alto de egress | muitos downloads via presigned URL | presigned URL expira em 600 s — revisar quem está chamando |
