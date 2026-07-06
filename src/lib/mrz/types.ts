export type MrzFormat = "TD1" | "TD3" | "unknown";

export type MrzParsed = {
  format: MrzFormat;
  documentNumber: string;
  /** CUI / DPI limpio (solo dígitos cuando aplica) */
  cui: string;
  apellido: string;
  nombre: string;
  fechaNacimiento: string | null;
  sexo: "M" | "F" | "X" | null;
  nacionalidad: string | null;
  fechaVencimiento: string | null;
  raw: string;
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
