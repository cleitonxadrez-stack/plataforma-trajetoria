// lib/lattes/decode.ts
// Decodifica os bytes do XML Lattes respeitando o encoding declarado.
// O Lattes exporta em ISO-8859-1; ler como UTF-8 corrompe os acentos.
// Funciona no browser e no Node (TextDecoder é global nos dois).

export function decodeXmlBytes(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // O cabeçalho <?xml ... encoding="..."?> é sempre ASCII.
  const head = new TextDecoder("latin1").decode(u8.subarray(0, 200));
  const enc = head.match(/encoding=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "utf-8";
  const label =
    /(8859|latin|1252|iso)/.test(enc) ? "iso-8859-1" :
    /utf/.test(enc) ? "utf-8" : enc;
  try {
    return new TextDecoder(label).decode(u8);
  } catch {
    return new TextDecoder("utf-8").decode(u8);
  }
}
