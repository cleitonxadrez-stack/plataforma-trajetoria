// src/app/privacidade/page.tsx
// Política de Privacidade (LGPD). Pública. RASCUNHO — revise com um advogado
// antes de publicar como documento legal definitivo.

import Link from "next/link";

export const metadata = { title: "Privacidade — Trajetória360" };

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 priv">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Legal</p>
      <h1 className="serif text-4xl text-[#0B2341] mb-2">Política de Privacidade</h1>
      <p className="text-stone-500 mb-8">Em conformidade com a Lei nº 13.709/2018 (LGPD). Vigência: agosto de 2026.</p>

      <section className="priv-sec">
        <h2>1. Quem trata seus dados</h2>
        <p>A plataforma <strong>Trajetória360</strong> é a controladora dos dados pessoais coletados aqui. Dúvidas ou solicitações sobre seus dados: <strong>[defina seu e-mail de contato/encarregado]</strong>.</p>
      </section>

      <section className="priv-sec">
        <h2>2. Quais dados coletamos</h2>
        <ul>
          <li><strong>Cadastro:</strong> e-mail e senha (a senha é guardada apenas como hash — nunca em texto).</li>
          <li><strong>Perfil acadêmico:</strong> nome, dados de citação, formação, produção (Lattes), e os dados que você opta por preencher (CPF, RG, título de eleitor, dados de contato, bancários, etc.).</li>
          <li><strong>Documentos:</strong> os comprovantes que você envia (certificados, diplomas, declarações).</li>
          <li><strong>Uso:</strong> registros técnicos de acesso e operação, para segurança e funcionamento.</li>
        </ul>
      </section>

      <section className="priv-sec">
        <h2>3. Para que usamos</h2>
        <p>Exclusivamente para prestar o serviço: organizar sua trajetória, gerar currículos, dossiês e documentos, e permitir a verificação pública que <em>você</em> optar por ativar. <strong>Não vendemos seus dados.</strong></p>
      </section>

      <section className="priv-sec">
        <h2>4. Base legal</h2>
        <p>Tratamos seus dados com base na <strong>execução do contrato</strong> (prestar o serviço que você contratou) e no seu <strong>consentimento</strong> para dados sensíveis e para tornar qualquer informação pública. O consentimento pode ser retirado a qualquer momento.</p>
      </section>

      <section className="priv-sec">
        <h2>5. Com quem compartilhamos</h2>
        <p>Apenas com os provedores de infraestrutura necessários para o serviço funcionar (operadores), sob contrato:</p>
        <ul>
          <li><strong>Supabase</strong> — banco de dados e autenticação</li>
          <li><strong>Cloudflare R2</strong> — armazenamento dos seus arquivos</li>
          <li><strong>Vercel</strong> — hospedagem da aplicação</li>
        </ul>
        <p>Nenhum dado é compartilhado para publicidade ou vendido a terceiros.</p>
      </section>

      <section className="priv-sec">
        <h2>6. Como protegemos</h2>
        <ul>
          <li><strong>Isolamento por conta (RLS):</strong> cada usuário só acessa os próprios dados.</li>
          <li><strong>Criptografia em trânsito (HTTPS)</strong> e <strong>em repouso</strong> (disco).</li>
          <li><strong>Senhas com hash</strong> (bcrypt) — irreversível.</li>
          <li>Acesso administrativo restrito e auditado.</li>
        </ul>
      </section>

      <section className="priv-sec">
        <h2>7. Seus direitos (LGPD)</h2>
        <p>Você pode, a qualquer momento:</p>
        <ul>
          <li><strong>Acessar e exportar</strong> seus dados — já disponível em <Link href="/exportar/dados" className="priv-link">Exportar → Dados pessoais</Link>.</li>
          <li><strong>Corrigir</strong> dados incorretos.</li>
          <li><strong>Excluir</strong> sua conta e seus dados (direito ao esquecimento).</li>
          <li><strong>Revogar consentimento</strong> e portar seus dados.</li>
        </ul>
        <p>Para exercer qualquer direito, use o contato do item 1. Atendemos no prazo legal.</p>
      </section>

      <section className="priv-sec">
        <h2>8. Retenção e exclusão</h2>
        <p>Mantemos seus dados enquanto sua conta existir. Ao solicitar exclusão, removemos seus dados pessoais e documentos, ressalvadas obrigações legais de guarda. Registros técnicos mínimos podem ser mantidos para segurança.</p>
      </section>

      <section className="priv-sec">
        <h2>9. Alterações</h2>
        <p>Podemos atualizar esta política. Mudanças relevantes serão comunicadas na plataforma.</p>
      </section>

      <p className="priv-foot">
        <Link href="/" className="priv-link">← Voltar ao início</Link>
      </p>
    </main>
  );
}
