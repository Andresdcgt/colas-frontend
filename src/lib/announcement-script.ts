/** Guion conversacional — debe coincidir con colas-backend/src/tts/build-announcement-text.ts */
export const ANNOUNCEMENT_SCRIPT_VERSION = "5";

const DIGITOS = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
] as const;

function spellTicket(numero: string): string {
  const digits = numero.replace(/\D/g, "").padStart(3, "0").slice(-3);
  return digits
    .split("")
    .map((d) => DIGITOS[Number(d)] ?? d)
    .join(" ... ");
}

export function buildAnnouncementText(options: {
  numero_turno: string;
  consultorio_nombre: string;
  veces_llamado?: number;
}): string {
  const { numero_turno, consultorio_nombre, veces_llamado = 1 } = options;
  const ticket = spellTicket(numero_turno);
  const consultorio = consultorio_nombre.trim() || "consultorio de atención";

  if (veces_llamado > 1) {
    return [
      "Disculpe la interrupción.",
      "...",
      "Repetimos el llamado.",
      "...",
      `Le toca el turno ... ${ticket}.`,
      "...",
      `Por favor, acérquese a ${consultorio}.`,
    ].join(" ");
  }

  return [
    "Hola.",
    "...",
    `Le llamamos con el turno ... ${ticket}.`,
    "...",
    `Por favor, acérquese a ${consultorio}.`,
  ].join(" ");
}
