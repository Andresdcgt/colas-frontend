/**
 * Anunciador de turnos — audio neural del backend; fallback al navegador con el mismo guion.
 */

import { getApiUrl } from "./api.js";
import { buildAnnouncementText } from "./announcement-script.js";

function playAttentionChime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    playTone(523.25, now, 0.18);
    playTone(659.25, now + 0.22, 0.25);
    setTimeout(() => void ctx.close(), 700);
  } catch {
    // ignore
  }
}

function buildAudioUrl(options: AnnounceLlamadoOptions): string {
  const q = new URLSearchParams({
    numero_turno: options.numero_turno,
    consultorio_nombre: options.consultorio_nombre,
    veces_llamado: String(options.veces_llamado ?? 1),
  });
  return getApiUrl(`/api/turnos/anuncio-audio?${q.toString()}`);
}

function playMp3Blob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    audio.onended = () => {
      URL.revokeObjectURL(objectUrl);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Error reproduciendo audio"));
    };
    void audio.play().catch((e) => {
      URL.revokeObjectURL(objectUrl);
      reject(e);
    });
  });
}

async function announceWithBrowser(options: AnnounceLlamadoOptions): Promise<void> {
  if (!("speechSynthesis" in window)) return;

  const text = buildAnnouncementText(options);

  window.speechSynthesis.cancel();
  await new Promise((r) => setTimeout(r, 100));

  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((v) => /es-mx|es-es|es-gt|es-us/i.test(v.lang) && /natural|online|google|microsoft/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith("es")) ||
    null;

  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? "es-MX";
    if (voice) u.voice = voice;
    u.rate = 0.9;
    u.pitch = 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export interface AnnounceLlamadoOptions {
  numero_turno: string;
  consultorio_nombre: string;
  veces_llamado?: number;
  chime?: boolean;
}

export async function announceLlamado(options: AnnounceLlamadoOptions): Promise<void> {
  const { chime = true } = options;

  if (chime) {
    playAttentionChime();
    await new Promise((r) => setTimeout(r, 350));
  }

  const url = buildAudioUrl(options);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    const blob = await res.blob();
    await playMp3Blob(blob);
  } catch {
    await announceWithBrowser(options);
  }
}

export async function previewAnnouncement(): Promise<void> {
  await announceLlamado({
    numero_turno: "042",
    consultorio_nombre: "Consultorio 101",
    veces_llamado: 1,
  });
}
