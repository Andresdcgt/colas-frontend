type Props = {
  pacienteNombre?: string;
  compact?: boolean;
};

export default function IgssConsultaLoader({ pacienteNombre, compact }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-brand-200 bg-brand-50/90 dark:border-brand-800 dark:bg-brand-500/10 ${
        compact ? "px-4 py-5" : "px-6 py-8"
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative h-11 w-11">
        <div className="absolute inset-0 rounded-full border-[3px] border-brand-200 dark:border-brand-800" />
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-brand-500" />
        <div className="absolute inset-[30%] rounded-full bg-brand-500/20" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-800 dark:text-gray-200">
        Consultando afiliación IGSS…
      </p>
      <p className="mt-1 max-w-xs text-center text-xs text-gray-500 dark:text-gray-400">
        {pacienteNombre
          ? `Verificando si ${pacienteNombre} esta al dia`
          : "Verificando si el paciente esta al dia segun estatutos IGSS"}
      </p>
      <div className="mt-3 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Mínimo visible para simular latencia de consulta IGSS en desarrollo. */
export async function conEsperaIgss<T>(promesa: Promise<T>, minMs = 1400): Promise<T> {
  const [resultado] = await Promise.all([promesa, new Promise<void>((r) => setTimeout(r, minMs))]);
  return resultado;
}
