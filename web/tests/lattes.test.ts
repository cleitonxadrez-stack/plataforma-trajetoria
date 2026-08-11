// tests/lattes.test.ts
// Parser Lattes: filtra dados sensíveis, preserva itens, marca FLAG-POTENCIAL-INOVACAO.

import { describe, it, expect } from "vitest";
import { parseLattesXml } from "../lib/lattes/parser";

const XML_FIXTURE = `<?xml version="1.0"?>
<CURRICULO-VITAE NUMERO-IDENTIFICADOR="K4000001P5" DATA-ATUALIZACAO="20260101">
  <DADOS-GERAIS NOME-COMPLETO="Maria de Souza">
    <CPF="111.222.333-44"/>
    <ENDERECO="Rua Falsa, 123"/>
    <TELEFONE="(11) 99999-9999"/>
  </DADOS-GERAIS>
  <PRODUCAO-BIBLIOGRAFICA>
    <ARTIGO-PUBLICADO
      TITULO-DO-TRABALHO="Modelos generativos em periódicos de baixa indexação"
      ANO-DO-TRABALHO="2023"
      DOI="10.1234/example.2023"
      ISNN="0000-0000"
      FLAG-POTENCIAL-INOVACAO="SIM"/>
    <ARTIGO-PUBLICADO
      TITULO-DO-TRABALHO="Estudo sobre visão computacional"
      ANO-DO-TRABALHO="2022"
      DOI="10.1234/example.2022"/>
    <CAPITULO-LIVRO
      TITULO-DO-TRABALHO="Introduction to Data Mining (book chapter)"
      ANO-DO-TRABALHO="2022"
      ISBN="978-0-123456-78-9"/>
  </PRODUCAO-BIBLIOGRAFICA>
</CURRICULO-VITAE>`;

describe("lattes/parser.ts — privacidade", () => {
  it("CPF, ENDERECO, TELEFONE e RG são filtrados e contados", () => {
    const out = parseLattesXml(XML_FIXTURE);
    expect(out.sensitiveIgnored).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(out)).not.toContain("111.222.333-44");
    expect(JSON.stringify(out)).not.toContain("Rua Falsa");
  });
});

describe("lattes/parser.ts — estrutura", () => {
  it("captura nome completo e Lattes ID", () => {
    const out = parseLattesXml(XML_FIXTURE);
    expect(out.fullName).toBe("Maria de Souza");
    expect(out.lattesId).toBe("K4000001P5");
  });

  it("extrai 3 itens com naturezas distintas", () => {
    const out = parseLattesXml(XML_FIXTURE);
    expect(out.items.length).toBe(3);
    const types = out.items.map(i => i.itemType);
    expect(types).toEqual(expect.arrayContaining(["ARTIGO-PUBLICADO", "CAPITULO-LIVRO"]));
    expect(new Set(types).size).toBe(2);
  });

  it("deduplica por (tag, título, ano, doi)", () => {
    const dup = `<CURRICULO-VITAE NUMERO-IDENTIFICADOR="X">
      <ARTIGO-PUBLICADO TITULO-DO-TRABALHO="A" ANO-DO-TRABALHO="2022" DOI="10.1/a"/>
      <ARTIGO-PUBLICADO TITULO-DO-TRABALHO="A" ANO-DO-TRABALHO="2022" DOI="10.1/a"/>
    </CURRICULO-VITAE>`;
    const out = parseLattesXml(dup);
    expect(out.items.length).toBe(1);
  });

  it("flag FLAG-POTENCIAL-INOVACAO=SIM → flaggedInnovation=true", () => {
    const out = parseLattesXml(XML_FIXTURE);
    const ino = out.items.find(i => i.title.includes("generativos"));
    expect(ino?.flaggedInnovation).toBe(true);
  });

  it("todo item importado pelo XML é flaggedLattes=true", () => {
    const out = parseLattesXml(XML_FIXTURE);
    expect(out.items.every(i => i.flaggedLattes)).toBe(true);
  });
});
