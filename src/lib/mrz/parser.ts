import type { MrzFormat, MrzParsed } from "./types";

/** Normaliza texto crudo del lector MRZ (keyboard wedge). */
export function normalizeMrzRaw(input: string): string[] {
  return input
    .toUpperCase()
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[^A-Z0-9<]/g, "").trim())
    .filter(Boolean);
}

function parseDateYYMMDD(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const mm = value.slice(2, 4);
  const dd = value.slice(4, 6);
  const year = yy >= 40 ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}

function splitNames(field: string): { apellido: string; nombre: string } {
  const parts = field.split("<<").filter(Boolean);
  const apellido = (parts[0] ?? "").replace(/</g, " ").trim();
  const nombre = (parts.slice(1).join(" ") || "").replace(/</g, " ").trim();
  return { apellido, nombre };
}

function cleanDocumentNumber(raw: string): string {
  return raw.replace(/</g, "").trim();
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function detectFormat(lines: string[]): MrzFormat {
  if (lines.length >= 3 && lines.every((l) => l.length >= 28 && l.length <= 32)) return "TD1";
  if (lines.length >= 2 && lines.every((l) => l.length >= 42 && l.length <= 46)) return "TD3";
  if (lines.length === 2) return "TD3";
  if (lines.length >= 3) return "TD1";
  return "unknown";
}

function padLines(lines: string[], format: MrzFormat): string[] {
  const len = format === "TD1" ? 30 : 44;
  return lines.map((l) => l.padEnd(len, "<").slice(0, len));
}

function parseTd1(lines: string[]): MrzParsed | null {
  const [l1, l2, l3] = padLines(lines, "TD1");
  const documentNumber = cleanDocumentNumber(l1.slice(5, 14));
  const nacionalidad = l2.slice(15, 18).replace(/</g, "") || null;
  const fechaNacimiento = parseDateYYMMDD(l2.slice(0, 6));
  const sexo = (l2[7] as "M" | "F" | "X") || null;
  const fechaVencimiento = parseDateYYMMDD(l2.slice(8, 14));
  const { apellido, nombre } = splitNames(l3);
  const cui = onlyDigits(documentNumber) || documentNumber;

  return {
    format: "TD1",
    documentNumber,
    cui,
    apellido: titleCase(apellido),
    nombre: titleCase(nombre),
    fechaNacimiento,
    sexo: sexo === "M" || sexo === "F" ? sexo : "X",
    nacionalidad,
    fechaVencimiento,
    raw: lines.join("\n"),
  };
}

function parseTd3(lines: string[]): MrzParsed | null {
  const [l1, l2] = padLines(lines, "TD3");
  const { apellido, nombre } = splitNames(l1.slice(5));
  const documentNumber = cleanDocumentNumber(l2.slice(0, 9));
  const nacionalidad = l2.slice(10, 13).replace(/</g, "") || null;
  const fechaNacimiento = parseDateYYMMDD(l2.slice(13, 19));
  const sexo = (l2[20] as "M" | "F" | "X") || null;
  const fechaVencimiento = parseDateYYMMDD(l2.slice(21, 27));
  const cui = onlyDigits(documentNumber) || documentNumber;

  return {
    format: "TD3",
    documentNumber,
    cui,
    apellido: titleCase(apellido),
    nombre: titleCase(nombre),
    fechaNacimiento,
    sexo: sexo === "M" || sexo === "F" ? sexo : "X",
    nacionalidad,
    fechaVencimiento,
    raw: lines.join("\n"),
  };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Parsea MRZ de DPI (TD1) o pasaporte (TD3). */
export function parseMrz(input: string): MrzParsed | null {
  const lines = normalizeMrzRaw(input);
  if (lines.length < 2) return null;

  const format = detectFormat(lines);
  if (format === "TD1" && lines.length >= 3) return parseTd1(lines);
  if (format === "TD3") return parseTd3(lines.slice(0, 2));

  return null;
}

/** ¿El buffer parece MRZ completo? (lector terminó de enviar) */
export function isMrzComplete(input: string): boolean {
  const lines = normalizeMrzRaw(input);
  const format = detectFormat(lines);
  if (format === "TD1") return lines.length >= 3;
  if (format === "TD3") return lines.length >= 2;
  return lines.length >= 2 && lines.join("").length > 60;
}
