type IgssLogoProps = {
  /** full: login y sidebar expandido · compact: sidebar colapsado */
  variant?: "full" | "compact" | "hero";
  className?: string;
};

const LOGO_SRC = "/LOGO-IGSS-2025.png";
const LOGO_ALT = "Instituto Guatemalteco de Seguridad Social — IGSS";

export default function IgssLogo({ variant = "full", className = "" }: IgssLogoProps) {
  if (variant === "hero") {
    return (
      <div
        className={`flex flex-col items-center text-center ${className}`}
        aria-label={LOGO_ALT}
      >
        <div className="rounded-2xl bg-white/95 p-4 shadow-2xl shadow-black/20 ring-1 ring-white/20 backdrop-blur-sm">
          <img
            src={LOGO_SRC}
            alt={LOGO_ALT}
            className="h-36 w-auto max-w-[220px] object-contain sm:h-44 sm:max-w-[260px]"
            width={260}
            height={260}
          />
        </div>
        <p className="mt-6 max-w-xs text-lg font-semibold leading-snug tracking-tight text-white">
          Instituto Guatemalteco de Seguridad Social
        </p>
        <p className="mt-2 text-sm font-medium uppercase tracking-[0.2em] text-white/60">
          Sistema de turnos
        </p>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <img
        src={LOGO_SRC}
        alt={LOGO_ALT}
        className={`h-10 w-10 shrink-0 rounded-lg object-cover object-center ring-1 ring-gray-200/80 dark:ring-gray-700 ${className}`}
        width={40}
        height={40}
      />
    );
  }

  return (
    <img
      src={LOGO_SRC}
      alt={LOGO_ALT}
      className={`h-auto max-h-[72px] w-full max-w-[168px] object-contain object-left ${className}`}
      width={168}
      height={72}
    />
  );
}
