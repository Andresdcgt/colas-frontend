import { useEffect, useState } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import {
  getConsultoriosColasResumen,
  reasignarTurno,
  type ConsultorioColaResumen,
  type Turno,
} from "../../lib/api";

type Props = {
  turno: Turno | null;
  fecha: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function TrasladarTurnoModal({ turno, fecha, onClose, onSuccess }: Props) {
  const [consultorioId, setConsultorioId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [consultorios, setConsultorios] = useState<ConsultorioColaResumen[]>([]);

  useEffect(() => {
    if (!turno) return;
    setConsultorioId("");
    setMotivo("");
    setError("");
    setLoadingList(true);
    getConsultoriosColasResumen({ fecha })
      .then((data) => setConsultorios(data.consultorios || []))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error al cargar consultorios")
      )
      .finally(() => setLoadingList(false));
  }, [turno?.id, fecha]);

  const opciones = consultorios.filter((c) => c.consultorio_id !== turno?.consultorio_id);

  const handleSubmit = async () => {
    if (!turno) return;
    if (!consultorioId) {
      setError("Elegí un consultorio destino.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await reasignarTurno(turno.id, {
        consultorio_id_destino: consultorioId,
        motivo: motivo.trim() || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al trasladar turno");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={!!turno} onClose={onClose} className="max-w-lg">
      <div className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Trasladar a otro consultorio
        </h2>
        {turno && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Turno <strong className="font-mono">#{turno.numero_turno}</strong> —{" "}
            {turno.paciente_apellido}, {turno.paciente_nombre}
            <br />
            <span className="text-xs text-gray-500">
              Desde: {turno.consultorio_nombre ?? "Consultorio actual"}
            </span>
          </p>
        )}
        <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
          El número de ticket se mantiene. El paciente entra al final de la cola del consultorio
          destino en estado <strong>en espera</strong>.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="trasladar-consultorio"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Consultorio destino
            </label>
            <select
              id="trasladar-consultorio"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={consultorioId}
              onChange={(e) => setConsultorioId(e.target.value)}
              disabled={loading || loadingList}
            >
              <option value="">Seleccioná un consultorio</option>
              {opciones.map((c) => (
                <option key={c.consultorio_id} value={c.consultorio_id}>
                  {c.consultorio_nombre}
                  {c.medico_nombre ? ` — Dr/a ${c.medico_nombre}` : ""} · {c.pacientes_en_cola}{" "}
                  en cola
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="trasladar-motivo"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Motivo (opcional)
            </label>
            <textarea
              id="trasladar-motivo"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. derivación a especialista, consultorio equivocado…"
              disabled={loading}
            />
          </div>

          {loadingList && (
            <p className="text-xs text-gray-500">Cargando consultorios…</p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              size="md"
              variant="outline"
              disabled={loading}
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              size="md"
              disabled={loading || loadingList}
              onClick={() => void handleSubmit()}
              className="w-full sm:w-auto"
            >
              {loading ? "Trasladando…" : "Trasladar turno"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
