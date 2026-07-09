import { useEffect, useRef, useState } from "react";
import { parseMrz, remapLatamHidToMrz } from "./parser";
import type { AgentSerialStatus, MrzParsed, MrzReaderError } from "./types";

export function getAgentBaseUrl(): string {
  const raw = import.meta.env.VITE_AGENT_URL?.trim();
  if (raw && raw.length > 0) {
    return raw.replace(/\/$/, "");
  }
  try {
    const loc = globalThis.location;
    if (loc && typeof loc.hostname === "string" && loc.hostname.length > 0) {
      const proto =
        loc.protocol && loc.protocol !== ":" && loc.protocol.length > 0 ? loc.protocol : "http:";
      return `${proto}//${loc.hostname}:4000`;
    }
  } catch {
    /* sin window */
  }
  return "http://127.0.0.1:4000";
}

const HID_DEBOUNCE_MS = 280;
const HID_MIN_CHARS = 60;
const TD1_TOTAL = 90;
const TD3_TOTAL = 88;
const FOCUS_INTERVAL_MS = 320;

/** No robar foco si el usuario está en otro control del formulario (p. ej. select de consultorio). */
function shouldDeferMrzCaptureFocus(captureEl: HTMLElement): boolean {
  const active = document.activeElement;
  if (!active || active === captureEl || active === document.body) return false;
  if (active.closest("[data-mrz-modal]")) return true;
  return !!active.closest(
    "select, textarea, input:not([aria-hidden]), button, a[href], label, [role='listbox'], [role='option']"
  );
}

export type ReaderHookOptions = {
  enableHidFallback?: boolean;
  hidCaptureElement?: HTMLElement | null;
  disabled?: boolean;
};

export type ReaderState = {
  agentConnected: boolean;
  hidActive: boolean;
  serial: AgentSerialStatus | null;
  lastError: string | null;
};

export function useMrzReader(
  onScan: (data: MrzParsed) => void,
  onError?: (error: MrzReaderError) => void,
  options: ReaderHookOptions = {}
): ReaderState {
  const enableHidFallback = options.enableHidFallback ?? true;
  const hidCaptureElement = options.hidCaptureElement ?? null;
  const disabled = options.disabled ?? false;

  const [state, setState] = useState<ReaderState>({
    agentConnected: false,
    hidActive: false,
    serial: null,
    lastError: null,
  });

  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  useEffect(() => {
    let es: EventSource | null = null;
    let mounted = true;
    try {
      es = new EventSource(`${getAgentBaseUrl()}/events`);
      es.addEventListener("open", () => {
        if (!mounted) return;
        setState((s) => ({ ...s, agentConnected: true }));
      });
      es.addEventListener("error", () => {
        if (!mounted) return;
        setState((s) => ({ ...s, agentConnected: false }));
      });
      es.addEventListener("agent:status", (ev) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as {
            status: { drivers: { mrz: { serial: AgentSerialStatus } } };
          };
          setState((s) => ({ ...s, serial: payload.status.drivers.mrz.serial }));
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("mrz:scan", (ev) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as {
            data: {
              format: "TD1" | "TD3";
              cui: string;
              document_number: string;
              first_surname: string;
              second_surname?: string;
              first_given: string;
              other_given?: string;
              birth_date: string;
              expiry_date?: string;
              sex: "M" | "F" | "X";
              nationality?: string;
              checksums_ok: boolean;
              raw_lines: string[];
            };
          };
          const d = payload.data;
          const mrz: MrzParsed = {
            format: d.format,
            documentNumber: d.document_number,
            cui: d.cui,
            apellido: [d.first_surname, d.second_surname].filter(Boolean).join(" "),
            nombre: [d.first_given, d.other_given].filter(Boolean).join(" "),
            fechaNacimiento: d.birth_date,
            fechaVencimiento: d.expiry_date ?? null,
            sexo: d.sex,
            nacionalidad: d.nationality ?? null,
            checksumsOk: d.checksums_ok,
            raw: d.raw_lines.join("\n"),
          };
          onScanRef.current(mrz);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("mrz:error", (ev) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as { error: MrzReaderError };
          onErrorRef.current?.(payload.error);
          setState((s) => ({ ...s, lastError: payload.error.reason }));
        } catch {
          /* ignore */
        }
      });
    } catch {
      setState((s) => ({ ...s, agentConnected: false }));
    }
    return () => {
      mounted = false;
      es?.close();
    };
  }, []);

  const serialOpen = state.serial?.state === "open";

  useEffect(() => {
    if (disabled || !enableHidFallback || serialOpen) {
      setState((s) => ({ ...s, hidActive: false }));
      return;
    }
    const el = hidCaptureElement;
    if (!el) {
      setState((s) => ({ ...s, hidActive: false }));
      return;
    }

    let buffer = "";
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const processBuffer = (): void => {
      const remapped = remapLatamHidToMrz(buffer);
      buffer = "";
      if (debounce) {
        clearTimeout(debounce);
        debounce = null;
      }
      if (remapped.length < HID_MIN_CHARS) return;

      const result = parseMrz(remapped);
      if (result.ok) {
        setState((s) => ({ ...s, lastError: null }));
        onScanRef.current(result.data);
      } else {
        onErrorRef.current?.(result.error);
        setState((s) => ({ ...s, lastError: result.error.reason }));
      }
    };

    const scheduleProcess = (): void => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(processBuffer, HID_DEBOUNCE_MS);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        buffer = "";
        setState((s) => ({ ...s, lastError: null }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        scheduleProcess();
        return;
      }
      if (
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "AltGraph" ||
        e.key === "Meta" ||
        e.key === "CapsLock"
      ) {
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        buffer += e.key;
        const remappedLen = remapLatamHidToMrz(buffer).length;
        if (remappedLen === TD1_TOTAL || remappedLen === TD3_TOTAL) {
          processBuffer();
          return;
        }
        scheduleProcess();
      }
    };

    el.addEventListener("keydown", onKey, true);
    setState((s) => ({ ...s, hidActive: true }));

    return () => {
      el.removeEventListener("keydown", onKey, true);
      if (debounce) clearTimeout(debounce);
      setState((s) => ({ ...s, hidActive: false }));
    };
  }, [disabled, enableHidFallback, serialOpen, hidCaptureElement]);

  useEffect(() => {
    if (disabled || !hidCaptureElement) return;
    const el = hidCaptureElement;
    const refocus = (): void => {
      if (shouldDeferMrzCaptureFocus(el)) return;
      if (document.activeElement !== el) {
        el.focus({ preventScroll: true });
      }
    };
    refocus();
    const id = setInterval(refocus, FOCUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [disabled, hidCaptureElement]);

  return state;
}
