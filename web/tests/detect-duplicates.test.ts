// tests/detect-duplicates.test.ts
// Item #4+ — detecção de duplicatas em academic_items.
// 12 specs puras (sem DB).

import { describe, it, expect } from "vitest";
import {
  classifyDuplicate,
  findDuplicates,
  normalizeDoi,
  normalizeIsbn,
  normalizeIssn,
  PROBABLE_DUPLICATE_SCORE,
  STRONG_DUPLICATE_SCORE,
} from "../lib/domain/detect-duplicates";

const base: import("../lib/domain/detect-duplicates").DuplicateCandidateInput = {
  id: "cand-1",
  itemType: "ARTIGO",
  title: "Federated Learning for Medical Imaging: a survey",
  titleEn: null,
  year: 2024,
  doi: "10.1234/example.2024",
  isbn: null,
  issn: null,
  authors: ["Souza", "Pereira"],
  orcid: null,
  lattesId: null,
};

describe("detect-duplicates — normalizadores", () => {
  it("normalizeDoi lowercase + valida prefixo 10.", () => {
    expect(normalizeDoi(" 10.1234/ABC.XYZ ")).toBe("10.1234/abc.xyz");
    expect(normalizeDoi("hello")).toBe(null);
    expect(normalizeDoi("10.123456/something")).toBe("10.123456/something");
    expect(normalizeDoi("")).toBe(null);
    expect(normalizeDoi(null)).toBe(null);
  });
  it("normalizeIsbn limpa traços/espaços (ISBN-13)", () => {
    expect(normalizeIsbn("978-85-123-4567-8")).toBe("9788512345678");
    expect(normalizeIsbn("978 85 123 4567 8")).toBe("9788512345678");
    expect(normalizeIsbn("1234")).toBe(null);
  });
  it("normalizeIssn aceita com ou sem traço", () => {
    expect(normalizeIssn("0123-4567")).toBe("0123-4567");
    expect(normalizeIssn("01234567")).toBe("0123-4567");
    expect(normalizeIssn("0123-456X")).toBe("0123-456X");
    expect(normalizeIssn("9999-9999")).toBe("9999-9999"); // formato válido; check-digit não validado
    expect(normalizeIssn("AB12-3456")).toBe(null);
  });
});

describe("detect-duplicates — matching forte", () => {
  it("DOI idêntico ⇒ score 1.0, reason=doi", () => {
    const m = findDuplicates(base, [
      { ...base, id: "x-1" },
    ]);
    expect(m.length).toBe(1);
    expect(m[0]?.reason).toBe("doi");
    expect(m[0]?.score).toBe(1.0);
  });
  it("ISBN canônico idêntico ⇒ reason=isbn", () => {
    const a = { ...base, id: "i-a", doi: null, isbn: "978-85-123-4567-8" };
    const b = { ...base, id: "i-b", doi: null, isbn: "978-85-123-4567-8" };
    const m = findDuplicates(a, [b]);
    expect(m.length).toBe(1);
    expect(m[0]?.reason).toBe("isbn");
    expect(m[0]?.matchValue).toBe("9788512345678");
  });
  it("ISSN idêntico ⇒ reason=issn", () => {
    const a = { ...base, id: "i-a", doi: null, issn: "0123-4567" };
    const b = { ...base, id: "i-b", doi: null, issn: "0123 4567" };
    const m = findDuplicates(a, [b]);
    expect(m[0]?.reason).toBe("issn");
  });
});

describe("detect-duplicates — matching fraco", () => {
  it("título próximo + mesmo tipo + ano ±1 ⇒ provável", () => {
    const a: typeof base = { ...base, id: "a", doi: null };
    const b: typeof base = {
      ...base,
      id: "b",
      doi: null,
      title: "Federated Learning for Medical Imaging: a review",
      year: 2025, // ±1
    };
    const m = findDuplicates(a, [b]);
    expect(m.length).toBe(1);
    expect(m[0]?.reason).toBe("title-fuzzy");
    expect(m[0]?.score).toBeGreaterThanOrEqual(PROBABLE_DUPLICATE_SCORE);
    expect(m[0]?.score).toBeLessThan(STRONG_DUPLICATE_SCORE);
  });
  it("título próximo + ano distante (3 anos) ⇒ não casa", () => {
    const a = { ...base, id: "a", doi: null };
    const b = { ...base, id: "b", doi: null, year: 2027 };
    const m = findDuplicates(a, [b]);
    expect(m.length).toBe(0);
  });
  it("título próximo + tipo diferente ⇒ não casa", () => {
    const a = { ...base, id: "a", doi: null };
    const b = { ...base, id: "b", doi: null, itemType: "CAPITULO" };
    const m = findDuplicates(a, [b]);
    expect(m.length).toBe(0);
  });
});

describe("classifyDuplicate", () => {
  it("verdict=UNIQUE quando vazio", () => {
    expect(classifyDuplicate([]).verdict).toBe("UNIQUE");
  });
  it("verdict=AUTO_MERGE quando score 1.0", () => {
    expect(
      classifyDuplicate([{ itemId: "x", score: 1.0, reason: "doi", matchValue: "v" }]).verdict,
    ).toBe("AUTO_MERGE");
  });
  it("verdict=HUMAN_REVIEW quando score entre 0.70 e 0.95", () => {
    expect(
      classifyDuplicate([{ itemId: "x", score: 0.83, reason: "title-fuzzy", matchValue: "v" }]).verdict,
    ).toBe("HUMAN_REVIEW");
  });
});

describe("findDuplicates — invariantes", () => {
  it("ignora o próprio item id", () => {
    const m = findDuplicates(base, [base]);
    expect(m.length).toBe(0);
  });
  it("retorna vazio quando corpus vazio", () => {
    expect(findDuplicates(base, []).length).toBe(0);
  });
  it("ordena resultado por score descendente", () => {
    const doiDup = { ...base, id: "doi-dup", doi: "10.1234/X.X" };
    const weakDup = {
      ...base,
      id: "weak-dup",
      doi: null,
      title: "Federated Learning for Medical Imaging: a review",
      year: 2025,
    };
    const m = findDuplicates({ ...base, doi: "10.1234/X.X" }, [weakDup, doiDup]);
    expect(m[0]?.reason).toBe("doi");
  });
});
