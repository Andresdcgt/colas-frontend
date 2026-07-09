import { useCallback, useState } from "react";
import Badge from "../ui/badge/Badge";
import Button from "../ui/button/Button";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import {
  createPaciente,
  getPacientes,
  validarAfiliacionIgss,
  type AfiliacionIgssResult,
  type Paciente,
} from "../../lib/api";
import { parseMrz } from "../../lib/mrz/parser";
import type { MrzParsed } from "../../lib/mrz/types";
import { useMrzReader } from "../../lib/mrz/useMrzReader";
import IgssConsultaLoader, { conEsperaIgss } from "./IgssConsultaLoader";

type Props = {
  disabled?: boolean;
  tenantId?: string;
  showInlineResult?: boolean;
  embedded?: boolean;
  onPacienteSelected: (paciente: Paciente, afiliacion: AfiliacionIgssResult) => void;
  onClear: () => void;
};

type Step = "idle" | "review" | "validating" | "ready" | "error";

function formatCuiGrouped(cui: string): string {
  const d = cui.replace(/\D/g, "");
  if (d.length !== 13) return cui;
  return `${d.slice(0, 4)} ${d.slice(4, 9)} ${d.slice(9, 13)}`;
}

export default function MrzAfiliadoPanel({
  disabled,
  tenantId,
  showInlineResult = true,
  embedded = false,
  onPacienteSelected,
  onClear,
}: Props) {
  const [captureEl, setCaptureEl] = useState<HTMLInputElement | null>(null);
  const [cuiManual, setCuiManual] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<MrzParsed | null>(null);
  const [pendingReview, setPendingReview] = useState<MrzParsed | null>(null);
  const [afiliacion, setAfiliacion] = useState<AfiliacionIgssResult | null>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);

  const reset = useCallback(() => {
    setCuiManual("");
    setStep("idle");
    setError("");
    setParsed(null);
    setPendingReview(null);
    setAfiliacion(null);
    setPaciente(null);
    onClear();
    captureEl?.focus();
  }, [onClear, captureEl]);

  const procesarDocumento = useCallback(
    async (mrz: MrzParsed) => {
      setParsed(mrz);
      setPendingReview(null);
      setStep("validating");
      setError("");

      try {
        const resultado = await conEsperaIgss(
          validarAfiliacionIgss({
            cui: mrz.cui,
            nombre: mrz.nombre,
            apellido: mrz.apellido,
            fecha_nacimiento: mrz.fechaNacimiento ?? undefined,
          })
        );
        setAfiliacion(resultado);

        if (!resultado.elegible) {
          setStep("error");
          setError(resultado.mensaje);
          return;
        }

        let encontrado: Paciente | null = null;
        const { pacientes } = await getPacientes({ dni: mrz.cui });
        encontrado = pacientes.find((p) => p.dni.replace(/\D/g, "") === mrz.cui) ?? pacientes[0] ?? null;

        if (!encontrado) {
          encontrado = await createPaciente({
            nombre: mrz.nombre || "Sin nombre",
            apellido: mrz.apellido || "Sin apellido",
            dni: mrz.cui,
            ...(tenantId ? { tenant_id: tenantId } : {}),
          });
        }

        onPacienteSelected(encontrado, resultado);

        if (showInlineResult) {
          setPaciente(encontrado);
          setStep("ready");
        } else {
          setCuiManual("");
          setStep("idle");
          setParsed(null);
          setAfiliacion(null);
          setPaciente(null);
        }
      } catch (e) {
        setStep("error");
        setError(e instanceof Error ? e.message : "Error al procesar documento");
      }
    },
    [onPacienteSelected, showInlineResult, tenantId]
  );

  const handleScan = useCallback(
    (mrz: MrzParsed) => {
      if (disabled || step === "validating") return;
      if (mrz.checksumsOk) {
        void procesarDocumento(mrz);
      } else {
        setPendingReview(mrz);
        setStep("review");
        setError("");
      }
    },
    [disabled, step, procesarDocumento]
  );

  const handleReaderError = useCallback((err: { reason: string }) => {
    setError(`No se pudo leer el MRZ (${err.reason}). Verifica el documento o ingresa el CUI manualmente.`);
    setStep("error");
  }, []);

  const readerState = useMrzReader(handleScan, handleReaderError, {
    hidCaptureElement: captureEl,
    disabled: disabled || step === "validating" || step === "review",
  });

  const handlePaste = (text: string) => {
    const result = parseMrz(text);
    if (result.ok) {
      handleScan(result.data);
    } else {
      handleReaderError(result.error);
    }
  };

  const validarCuiManual = async () => {
    const cui = cuiManual.replace(/\D/g, "");
    if (cui.length < 8) {
      setError("Ingresa un CUI/DPI valido (minimo 8 digitos).");
      setStep("error");
      return;
    }
    await procesarDocumento({
      format: "unknown",
      documentNumber: cui,
      cui,
      apellido: "",
      nombre: "",
      fechaNacimiento: null,
      sexo: null,
      nacionalidad: null,
      fechaVencimiento: null,
      checksumsOk: true,
      raw: "",
    });
  };

  const showResult = step === "ready" && paciente && afiliacion;
  const scanning = step === "idle" && !disabled;

  return (
    <div
      className={
        embedded
          ? ""
          : "rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/60 to-white p-4 dark:border-brand-800 dark:from-brand-500/5 dark:to-gray-900"
      }
    >
      {!embedded && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <Label>Lector MRZ — afiliación IGSS</Label>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Escanea DPI o pasaporte. Se verifica si el paciente esta al dia segun estatutos IGSS.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {readerState.agentConnected && (
              <Badge color="light" size="sm" variant="light">
                Agente conectado
              </Badge>
            )}
            {readerState.hidActive && (
              <Badge color="light" size="sm" variant="light">
                HID activo
              </Badge>
            )}
            {afiliacion?.fuente === "mock" && (
              <Badge color="light" size="sm" variant="light">
                Modo simulación
              </Badge>
            )}
          </div>
        </div>
      )}

      <input
        ref={setCaptureEl}
        type="text"
        readOnly
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text.length > 40) {
            e.preventDefault();
            handlePaste(text);
          }
        }}
        className="sr-only"
      />

      {step === "validating" && (
        <IgssConsultaLoader
          compact
          pacienteNombre={
            parsed?.nombre && parsed?.apellido
              ? `${parsed.apellido}, ${parsed.nombre}`
              : cuiManual
                ? `CUI ${cuiManual}`
                : undefined
          }
        />
      )}

      {step === "review" && pendingReview && (
        <div className="space-y-3" data-mrz-modal>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-500/10">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Lectura con advertencia
            </p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              Los dígitos de control del MRZ no coinciden. Revisa los datos antes de continuar.
            </p>
            <dl className="mt-3 space-y-1 text-sm text-gray-800 dark:text-gray-200">
              <div className="flex gap-2">
                <dt className="text-gray-500">CUI</dt>
                <dd className="font-mono">{formatCuiGrouped(pendingReview.cui)}</dd>
              </div>
              {(pendingReview.apellido || pendingReview.nombre) && (
                <div className="flex gap-2">
                  <dt className="text-gray-500">Nombre</dt>
                  <dd>
                    {[pendingReview.apellido, pendingReview.nombre].filter(Boolean).join(", ")}
                  </dd>
                </div>
              )}
              {pendingReview.fechaNacimiento && (
                <div className="flex gap-2">
                  <dt className="text-gray-500">Nacimiento</dt>
                  <dd>{pendingReview.fechaNacimiento}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void procesarDocumento(pendingReview)}>
              Continuar de todos modos
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              Reintentar
            </Button>
          </div>
        </div>
      )}

      {!showResult && step !== "validating" && step !== "review" && (
        <div className="space-y-3">
          {scanning && (
            <p className="flex h-11 items-center rounded-lg border border-dashed border-brand-300 bg-white/80 px-3 text-sm text-gray-500 dark:border-brand-700 dark:bg-gray-900/50 dark:text-gray-400">
              {readerState.lastError
                ? "Error en la última lectura — escanea de nuevo"
                : "Listo para escanear — coloca el documento en el lector"}
            </p>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">O ingresar CUI manualmente</Label>
              <Input
                value={cuiManual}
                onChange={(e) => setCuiManual(e.target.value.replace(/\D/g, ""))}
                placeholder="Ej. 1234567890101"
                disabled={disabled}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || cuiManual.length < 8}
              onClick={() => void validarCuiManual()}
              className="mb-0.5 shrink-0"
            >
              Validar
            </Button>
          </div>
        </div>
      )}

      {error && step === "error" && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-800 dark:bg-red-500/10 dark:text-red-200">
          {error}
          <button type="button" className="ml-2 underline" onClick={reset}>
            Reintentar
          </button>
        </div>
      )}

      {showResult && (
        <div className="mt-1 space-y-3">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50/80 px-4 py-3 dark:border-green-800 dark:bg-green-500/10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="success" size="sm" variant="light">
                  Paciente al Dia
                </Badge>
                {afiliacion.tipo_afiliacion && (
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {afiliacion.tipo_afiliacion}
                  </span>
                )}
              </div>
              <p className="mt-1 font-medium text-gray-900 dark:text-white">
                {paciente.apellido}, {paciente.nombre}
              </p>
              <p className="text-xs text-gray-500">
                CUI {formatCuiGrouped(paciente.dni)}
                {afiliacion.numero_afiliacion && ` · Afil. ${afiliacion.numero_afiliacion}`}
              </p>
              {parsed?.fechaNacimiento && (
                <p className="text-xs text-gray-500">Nac. {parsed.fechaNacimiento}</p>
              )}
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-300"
            >
              Cambiar
            </button>
          </div>
          <p className="text-xs text-gray-500">{afiliacion.mensaje}</p>
        </div>
      )}

      {!showResult && step !== "error" && step !== "review" && !embedded && (
        <p className="mt-3 text-[11px] text-gray-400">
          Tip dev: CUI terminado en 0 = no afiliado · en 1 = moroso · otro = elegible (simulación).
          También puedes pegar un MRZ crudo en el área de escaneo.
        </p>
      )}
    </div>
  );
}
