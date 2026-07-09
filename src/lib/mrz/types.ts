export type MrzFormat = "TD1" | "TD3" | "unknown";

export type MrzParsed = {
  format: MrzFormat;
  documentNumber: string;
  /** CUI / DPI limpio (13 dígitos cuando aplica en TD1). */
  cui: string;
  apellido: string;
  nombre: string;
  fechaNacimiento: string | null;
  sexo: "M" | "F" | "X" | null;
  nacionalidad: string | null;
  fechaVencimiento: string | null;
  /** Si todos los checksums ICAO 7-3-1 pasan. */
  checksumsOk: boolean;
  raw: string;
};

export type MrzParseError = {
  raw: string;
  reason:
    | "unknown_format"
    | "invalid_line_lengths"
    | "invalid_dates"
    | "empty_input";
  detail?: string;
};

export type MrzParseResult =
  | { ok: true; data: MrzParsed }
  | { ok: false; error: MrzParseError };

export type MrzReaderError = { raw: string; reason: string; detail?: string };

export type AgentSerialStatus = {
  enabled: boolean;
  state: "disabled" | "connecting" | "open" | "closed" | "error";
  path?: string;
  baud?: number;
  last_error?: string;
  last_opened_at?: string;
  last_scan_at?: string;
};

export type AfiliacionIgssResult = {
  elegible: boolean;
  codigo: string;
  mensaje: string;
  numero_afiliacion: string | null;
  nombre_oficial: string | null;
  tipo_afiliacion: string | null;
  fecha_vigencia: string | null;
  fuente: "igss" | "mock";
  validado_at: string;
};
