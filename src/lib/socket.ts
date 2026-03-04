import { io } from "socket.io-client";
import { getSocketUrl } from "./api.js";

let socket: ReturnType<typeof io> | null = null;

function getSocket() {
  if (!socket) {
    socket = io(getSocketUrl(), {
      path: "/socket.io",
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export type TurnosUpdatedPayload = { fecha: string };

/**
 * Suscribe a actualizaciones en tiempo real de turnos.
 * El servidor emite "turnos:updated" con { fecha } cuando se crea o actualiza un turno.
 * @param callback Se llama cuando la fecha del evento coincide con la fecha que pasas.
 * @returns Función para cancelar la suscripción.
 */
export function subscribeTurnosUpdated(
  fecha: string,
  callback: () => void
): () => void {
  const s = getSocket();
  const handler = (payload: TurnosUpdatedPayload) => {
    if (payload?.fecha === fecha) callback();
  };
  s.on("turnos:updated", handler);
  return () => {
    s.off("turnos:updated", handler);
  };
}

/**
 * Refresca datos cuando el socket se reconecta (por si se perdió algún evento).
 */
export function onReconnect(callback: () => void): () => void {
  const s = getSocket();
  s.on("connect", callback);
  return () => s.off("connect", callback);
}
