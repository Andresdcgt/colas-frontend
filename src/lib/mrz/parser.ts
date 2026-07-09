import type { MrzFormat, MrzParseResult, MrzParsed } from "./types";

const TD1_LINE_LEN = 30;
const TD1_TOTAL = TD1_LINE_LEN * 3;
const TD3_LINE_LEN = 44;
const TD3_TOTAL = TD3_LINE_LEN * 2;

const WEIGHTS = [7, 3, 1] as const;

function charValue(c: string): number {
  if (c === "<") return 0;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return -1;
}

function icaoCheck(s: string): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const v = charValue(s.charAt(i));
    if (v < 0) return -1;
    sum += v * WEIGHTS[i % 3]!;
  }
  return sum % 10;
}

function expectCheck(field: string, expectedChar: string): boolean {
  if (expectedChar === "<") {
    return field.split("").every((c) => c === "<");
  }
  const exp = Number.parseInt(expectedChar, 10);
  if (Number.isNaN(exp)) return false;
  return icaoCheck(field) === exp;
}

/** Teclado latinoamericano HID: `;`→`<`, `:`→`>`. Aplicar antes de filtrar. */
export function remapLatamHidToMrz(input: string): string {
  return input.replace(/;/g, "<").replace(/:/g, ">");
}

function normalize(input: string): string {
  return remapLatamHidToMrz(input)
    .toUpperCase()
    .replace(/[^A-Z0-9<\n\r ]/g, "")
    .replace(/[\r\n]+/g, "\n");
}

function compact(s: string): string {
  return s.replace(/[\s\n]/g, "");
}

function detectFormatAndNormalize(
  input: string
): { format: Exclude<MrzFormat, "unknown">; compact: string } | null {
  const norm = compact(normalize(input));
  if (norm.length === 0) return null;

  const first = norm.charAt(0);
  const expects = (
    target: number
  ): { format: Exclude<MrzFormat, "unknown">; compact: string } | null => {
    const format: Exclude<MrzFormat, "unknown"> = target === TD1_TOTAL ? "TD1" : "TD3";
    if (norm.length === target) return { format, compact: norm };
    if (norm.length < target && target - norm.length <= 2) {
      return { format, compact: norm.padEnd(target, "<") };
    }
    return null;
  };

  if (first === "P") return expects(TD3_TOTAL);
  if (first === "I" || first === "A" || first === "C") return expects(TD1_TOTAL);
  if (norm.length === TD1_TOTAL) return { format: "TD1", compact: norm };
  if (norm.length === TD3_TOTAL) return { format: "TD3", compact: norm };
  return null;
}

function splitLines(compactStr: string, lineLen: number, count: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(compactStr.slice(i * lineLen, (i + 1) * lineLen));
  }
  return lines;
}

function parseDateYYMMDD(yyMMdd: string, pivotForBirth = true): string | null {
  if (!/^\d{6}$/.test(yyMMdd)) return null;
  const yy = Number.parseInt(yyMMdd.slice(0, 2), 10);
  const mm = Number.parseInt(yyMMdd.slice(2, 4), 10);
  const dd = Number.parseInt(yyMMdd.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYY = new Date().getUTCFullYear() % 100;
  const fullYear = pivotForBirth
    ? yy > currentYY + 5
      ? 1900 + yy
      : 2000 + yy
    : 2000 + yy;
  return `${fullYear}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
}

function parseNames(nameField: string): { apellido: string; nombre: string } {
  const trimmed = nameField.replace(/<+$/, "");
  const [surnamesRaw, givenRaw = ""] = trimmed.split("<<");
  const surnameTokens = surnamesRaw.split("<").filter(Boolean);
  const givenTokens = givenRaw.split("<").filter(Boolean);
  return {
    apellido: surnameTokens.join(" "),
    nombre: givenTokens.join(" "),
  };
}

function extractCuiFromOptional(optional: string, documentNumber: string): string {
  const docDigits = documentNumber.replace(/</g, "").replace(/\D/g, "");
  const optDigits = optional.replace(/</g, "").replace(/\D/g, "");
  if (docDigits.length === 9 && optDigits.length >= 4) {
    return docDigits + optDigits.slice(0, 4);
  }
  const m = /\d{13}/.exec(optDigits);
  if (m) return m[0];
  if (docDigits.length === 13) return docDigits;
  return docDigits || optDigits;
}

function sexFrom(raw: string): "M" | "F" | "X" {
  if (raw === "M" || raw === "F") return raw;
  return "X";
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toMrzParsed(
  format: Exclude<MrzFormat, "unknown">,
  lines: string[],
  fields: {
    documentNumber: string;
    cui: string;
    apellido: string;
    nombre: string;
    fechaNacimiento: string;
    fechaVencimiento: string | null;
    sexo: "M" | "F" | "X";
    nacionalidad: string | null;
    checksumsOk: boolean;
  }
): MrzParsed {
  return {
    format,
    documentNumber: fields.documentNumber,
    cui: fields.cui,
    apellido: titleCase(fields.apellido),
    nombre: titleCase(fields.nombre),
    fechaNacimiento: fields.fechaNacimiento,
    sexo: fields.sexo,
    nacionalidad: fields.nacionalidad,
    fechaVencimiento: fields.fechaVencimiento,
    checksumsOk: fields.checksumsOk,
    raw: lines.join("\n"),
  };
}

function parseTd1(lines: string[]): MrzParseResult {
  const [l1, l2, l3] = lines;
  if (!l1 || !l2 || !l3 || l1.length !== 30 || l2.length !== 30 || l3.length !== 30) {
    return { ok: false, error: { raw: lines.join("\n"), reason: "invalid_line_lengths" } };
  }

  const docNumber = l1.slice(5, 14);
  const docNumberCheck = l1.charAt(14);
  const optional1 = l1.slice(15, 30);

  const birth = l2.slice(0, 6);
  const birthCheck = l2.charAt(6);
  const sexChar = l2.charAt(7);
  const expiry = l2.slice(8, 14);
  const expiryCheck = l2.charAt(14);
  const nationality = l2.slice(15, 18);
  const optional2 = l2.slice(18, 29);
  const compositeCheck = l2.charAt(29);

  const { apellido, nombre } = parseNames(l3);

  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  const checksumsOk =
    expectCheck(docNumber, docNumberCheck) &&
    expectCheck(birth, birthCheck) &&
    expectCheck(expiry, expiryCheck) &&
    expectCheck(composite, compositeCheck);

  const fechaNacimiento = parseDateYYMMDD(birth, true);
  if (!fechaNacimiento) {
    return {
      ok: false,
      error: { raw: lines.join("\n"), reason: "invalid_dates", detail: "birth" },
    };
  }

  const cui = extractCuiFromOptional(optional1 + optional2, docNumber);

  return {
    ok: true,
    data: toMrzParsed("TD1", lines, {
      documentNumber: docNumber.replace(/</g, ""),
      cui,
      apellido,
      nombre,
      fechaNacimiento,
      fechaVencimiento: parseDateYYMMDD(expiry, false),
      sexo: sexFrom(sexChar),
      nacionalidad: nationality.replace(/</g, "") || null,
      checksumsOk,
    }),
  };
}

function parseTd3(lines: string[]): MrzParseResult {
  const [l1, l2] = lines;
  if (!l1 || !l2 || l1.length !== 44 || l2.length !== 44) {
    return { ok: false, error: { raw: lines.join("\n"), reason: "invalid_line_lengths" } };
  }

  const { apellido, nombre } = parseNames(l1.slice(5, 44));

  const docNumber = l2.slice(0, 9);
  const docNumberCheck = l2.charAt(9);
  const nationality = l2.slice(10, 13);
  const birth = l2.slice(13, 19);
  const birthCheck = l2.charAt(19);
  const sexChar = l2.charAt(20);
  const expiry = l2.slice(21, 27);
  const expiryCheck = l2.charAt(27);
  const personal = l2.slice(28, 42);
  const personalCheck = l2.charAt(42);
  const compositeCheck = l2.charAt(43);

  const composite =
    docNumber + docNumberCheck + birth + birthCheck + expiry + expiryCheck + personal + personalCheck;

  const checksumsOk =
    expectCheck(docNumber, docNumberCheck) &&
    expectCheck(birth, birthCheck) &&
    expectCheck(expiry, expiryCheck) &&
    (personalCheck === "<" || expectCheck(personal, personalCheck)) &&
    expectCheck(composite, compositeCheck);

  const fechaNacimiento = parseDateYYMMDD(birth, true);
  if (!fechaNacimiento) {
    return {
      ok: false,
      error: { raw: lines.join("\n"), reason: "invalid_dates", detail: "birth" },
    };
  }

  const cui = extractCuiFromOptional(personal, docNumber);

  return {
    ok: true,
    data: toMrzParsed("TD3", lines, {
      documentNumber: docNumber.replace(/</g, ""),
      cui,
      apellido,
      nombre,
      fechaNacimiento,
      fechaVencimiento: parseDateYYMMDD(expiry, false),
      sexo: sexFrom(sexChar),
      nacionalidad: nationality.replace(/</g, "") || null,
      checksumsOk,
    }),
  };
}

/** Parsea MRZ de DPI (TD1) o pasaporte (TD3) con checksums ICAO. */
export function parseMrz(input: string): MrzParseResult {
  if (!input || input.trim().length === 0) {
    return { ok: false, error: { raw: "", reason: "empty_input" } };
  }

  const detected = detectFormatAndNormalize(input);
  if (!detected) {
    return {
      ok: false,
      error: {
        raw: input,
        reason: "unknown_format",
        detail: `compact length ${compact(normalize(input)).length}`,
      },
    };
  }

  if (detected.format === "TD1") {
    return parseTd1(splitLines(detected.compact, TD1_LINE_LEN, 3));
  }
  return parseTd3(splitLines(detected.compact, TD3_LINE_LEN, 2));
}

/** ¿El buffer parece MRZ completo? (lector terminó de enviar) */
export function isMrzComplete(input: string): boolean {
  const norm = compact(normalize(input));
  if (norm.length >= TD1_TOTAL - 2 && norm.length <= TD1_TOTAL) return true;
  if (norm.length >= TD3_TOTAL - 2 && norm.length <= TD3_TOTAL) return true;
  return false;
}
