import { useCallback, useEffect, useRef, useState } from "react";
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
import { isMrzComplete, parseMrz } from "../../lib/mrz/parser";
import type { MrzParsed } from "../../lib/mrz/types";
import IgssConsultaLoader, { conEsperaIgss } from "./IgssConsultaLoader";

type Props = {
  disabled?: boolean;
  tenantId?: string;
  showInlineResult?: boolean;
  onPacienteSelected: (paciente: Paciente, afiliacion: AfiliacionIgssResult) => void;
  onClear: () => void;
};

type Step = "idle" | "validating" | "ready" | "error";

export default function MrzAfiliadoPanel({
  disabled,
  tenantId,
  showInlineResult = true,
  onPacienteSelected,
  onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mrzBuffer, setMrzBuffer] = useState("");
  const [cuiManual, setCuiManual] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<MrzParsed | null>(null);
  const [afiliacion, setAfiliacion] = useState<AfiliacionIgssResult | null>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);

  const reset = useCallback(() => {
    setMrzBuffer("");
    setCuiManual("");
    setStep("idle");
    setError("");
    setParsed(null);
    setAfiliacion(null);
    setPaciente(null);
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  const procesarDocumento = useCallback(
    async (mrz: MrzParsed) => {
      setParsed(mrz);
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
          setMrzBuffer("");
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

  const handleMrzInput = (value: string) => {
    setMrzBuffer(value);
    if (isMrzComplete(value)) {
      const mrz = parseMrz(value);
      if (mrz) {
        setMrzBuffer("");
        void procesarDocumento(mrz);
      }
    }
  };

  const handleMrzKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && mrzBuffer.trim()) {
      e.preventDefault();
      const mrz = parseMrz(mrzBuffer);
      if (!mrz) {
        setError("No se pudo leer el MRZ. Verificá el documento o ingresá el CUI manualmente.");
        setStep("error");
        return;
      }
      setMrzBuffer("");
      void procesarDocumento(mrz);
    }
  };

  const validarCuiManual = async () => {
    const cui = cuiManual.replace(/\D/g, "");
    if (cui.length < 8) {
      setError("Ingresá un CUI/DPI válido (mínimo 8 dígitos).");
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
      raw: "",
    });
  };

  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const showResult = step === "ready" && paciente && afiliacion;

  return (
    <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/60 to-white p-4 dark:border-brand-800 dark:from-brand-500/5 dark:to-gray-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <Label>Lector MRZ — afiliación IGSS</Label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Escaneá DPI o pasaporte. Se valida derecho a atención según estatutos IGSS.
          </p>
        </div>
        {afiliacion?.fuente === "mock" && (
          <Badge color="light" size="sm" variant="light">
            Modo simulación
          </Badge>
        )}
      </div>

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

      {!showResult && step !== "validating" && (
        <div className="space-y-3">
          <div>
            <input
              ref={inputRef}
              type="text"
              value={mrzBuffer}
              onChange={(e) => handleMrzInput(e.target.value)}
              onKeyDown={handleMrzKeyDown}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text.includes("\n") || text.length > 40) {
                  e.preventDefault();
                  handleMrzInput(text);
                }
              }}
              disabled={disabled}
              placeholder="Enfocá aquí y escaneá el documento…"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full rounded-lg border border-brand-300 bg-white px-3 font-mono text-sm tracking-wide dark:border-brand-700 dark:bg-gray-900 dark:text-white"
            />
          </div>

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
              type="button"
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
                  Derecho a atención
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
                CUI {paciente.dni}
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

      {!showResult && step !== "error" && (
        <p className="mt-3 text-[11px] text-gray-400">
          Tip dev: CUI terminado en 0 = no afiliado · en 1 = moroso · otro = elegible (simulación).
        </p>
      )}
    </div>
  );
}
