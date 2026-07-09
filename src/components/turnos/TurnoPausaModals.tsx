import { useState } from "react";
import Button from "../ui/button/Button";
import Label from "../form/Label";
import TextArea from "../form/input/TextArea";
import { Modal } from "../ui/modal";
import { pausarTurno, reanudarTurno, type Turno } from "../../lib/api";

type PausarProps = {
  turno: Turno | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function PausarTurnoModal({ turno, onClose, onSuccess }: PausarProps) {
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cerrar = () => {
    if (loading) return;
    setMotivo("");
    setError("");
    onClose();
  };

  const confirmar = async () => {
    if (!turno) return;
    setLoading(true);
    setError("");
    try {
      await pausarTurno(turno.id, motivo);
      setMotivo("");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al pausar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={!!turno} onClose={cerrar} className="max-w-md">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pausar turno #{turno?.numero_turno}</h2>
        {turno && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {turno.paciente_apellido}, {turno.paciente_nombre}
          </p>
        )}
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          El ticket se retira de la cola activa pero conserva su lugar. No ira al final como al reencolar.
        </p>
        <div className="mt-4">
          <Label>Motivo (opcional)</Label>
          <TextArea
            rows={3}
            value={motivo}
            onChange={setMotivo}
            placeholder="Ej. fue al baño, salio un momento…"
            disabled={loading}
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" size="sm" onClick={cerrar} disabled={loading}>
            Cancelar
          </Button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void confirmar()}
            className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Pausando…" : "Pausar turno"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type ReanudarProps = {
  turno: Turno | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function ReanudarTurnoModal({ turno, onClose, onSuccess }: ReanudarProps) {
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState<"siguiente" | "esperar" | null>(null);
  const [error, setError] = useState("");

  const cerrar = () => {
    if (loading) return;
    setMotivo("");
    setError("");
    onClose();
  };

  const ejecutar = async (accion: "siguiente" | "esperar") => {
    if (!turno) return;
    setLoading(accion);
    setError("");
    try {
      await reanudarTurno(turno.id, accion, motivo);
      setMotivo("");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al reanudar");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Modal isOpen={!!turno} onClose={cerrar} className="max-w-md">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Reanudar turno #{turno?.numero_turno}
        </h2>
        {turno && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {turno.paciente_apellido}, {turno.paciente_nombre}
            {turno.motivo_pausa ? ` · ${turno.motivo_pausa}` : ""}
          </p>
        )}
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Coloca en el siguiente espacio si aun no hay turno asignado en consultorio, o sigue esperando si la persona
          aun no regresa.
        </p>
        <div className="mt-4">
          <Label>Nota (opcional)</Label>
          <TextArea
            rows={2}
            value={motivo}
            onChange={setMotivo}
            placeholder="Ej. aun en baño, regresa en 5 min…"
            disabled={!!loading}
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            className="w-full justify-center"
            disabled={!!loading}
            onClick={() => void ejecutar("siguiente")}
          >
            {loading === "siguiente" ? "Reanudando…" : "Colocar en siguiente turno"}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center"
            disabled={!!loading}
            onClick={() => void ejecutar("esperar")}
          >
            {loading === "esperar" ? "Guardando…" : "Seguir esperando"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={cerrar} disabled={!!loading}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
