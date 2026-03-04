import { useEffect, useRef } from "react";
import { subscribeTurnosUpdated, onReconnect } from "../lib/socket.js";

/**
 * Suscribe a actualizaciones en tiempo real de turnos vía Socket.io.
 * Cuando el backend emite "turnos:updated" para la misma fecha, se llama a onUpdate.
 * También refresca al reconectar por si se perdió algún evento.
 */
export function useTurnosSocket(fecha: string, onUpdate: () => void): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const unsub = subscribeTurnosUpdated(fecha, () => onUpdateRef.current());
    return unsub;
  }, [fecha]);

  useEffect(() => {
    const unsub = onReconnect(() => onUpdateRef.current());
    return unsub;
  }, []);
}
