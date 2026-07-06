import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { getPantallaPublica, type PantallaPublicaTurno } from "../lib/api";
import { announceLlamado } from "../lib/announcer";
import { subscribeTurnoLlamado, subscribeTurnosUpdated, type TurnoLlamadoPayload } from "../lib/socket";

function TurnoDisplay({ turno, destacado }: { turno: PantallaPublicaTurno; destacado?: boolean }) {
  return (
    <div
      className={`rounded-2xl border-2 px-8 py-6 text-center transition-all ${
        destacado
          ? "animate-pulse border-amber-400 bg-amber-500/20 shadow-lg shadow-amber-500/20"
          : "border-white/20 bg-white/5"
      }`}
    >
      <p className="text-sm font-medium uppercase tracking-widest text-amber-300/90">
        {destacado ? "Ahora llamando" : "En atención"}
      </p>
      <p className="mt-2 font-mono text-7xl font-black text-white sm:text-8xl">{turno.numero_turno}</p>
      <p className="mt-3 text-2xl font-semibold text-amber-100 sm:text-3xl">{turno.consultorio_nombre}</p>
      {turno.veces_llamado > 1 && (
        <p className="mt-2 text-sm text-amber-200/70">Llamada {turno.veces_llamado}</p>
      )}
    </div>
  );
}

export default function PantallaEspera() {
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get("tenant")?.trim() || "";
  const [fecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Awaited<ReturnType<typeof getPantallaPublica>> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [ultimoLlamado, setUltimoLlamado] = useState<PantallaPublicaTurno | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const lastSpokenRef = useRef<string>("");

  const load = useCallback(async () => {
    if (!tenantSlug) {
      setError("Falta el parámetro ?tenant=slug-de-clinica en la URL");
      setLoading(false);
      return;
    }
    try {
      const res = await getPantallaPublica(tenantSlug, fecha);
      setData(res);
      setError("");
      const principal = res.llamados[0];
      if (principal) {
        setUltimoLlamado(principal);
        const key = `${principal.numero_turno}-${principal.ultima_llamada_at}-${principal.veces_llamado}`;
        if (key !== lastSpokenRef.current && audioEnabled) {
          lastSpokenRef.current = key;
          void announceLlamado({
            numero_turno: principal.numero_turno,
            consultorio_nombre: principal.consultorio_nombre,
            veces_llamado: principal.veces_llamado,
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, fecha, audioEnabled]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (!tenantSlug) return;
    const unsub1 = subscribeTurnosUpdated(fecha, load);
    const unsub2 = subscribeTurnoLlamado(fecha, (payload: TurnoLlamadoPayload) => {
      setUltimoLlamado({
        numero_turno: payload.numero_turno,
        consultorio_nombre: payload.consultorio_nombre,
        veces_llamado: payload.veces_llamado,
        estado: "llamado",
        ultima_llamada_at: new Date().toISOString(),
        consultorio_id: "",
      });
      const key = `${payload.numero_turno}-${payload.veces_llamado}-${Date.now()}`;
      lastSpokenRef.current = key;
      if (audioEnabled) {
        void announceLlamado({
          numero_turno: payload.numero_turno,
          consultorio_nombre: payload.consultorio_nombre,
          veces_llamado: payload.veces_llamado,
        });
      }
      load();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [fecha, tenantSlug, load, audioEnabled]);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("dark");
    return () => el.classList.remove("dark");
  }, []);

  if (!tenantSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-8 text-center text-white">
        <div>
          <PageMeta title="Pantalla de espera" description="Vista pública para sala" />
          <h1 className="text-3xl font-bold">Pantalla de espera</h1>
          <p className="mt-4 text-gray-400">
            Agrega el slug de la clínica en la URL:
          </p>
          <code className="mt-2 block rounded bg-gray-800 px-4 py-2 text-amber-300">
            /pantalla-espera?tenant=igss-zona-1
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      {!audioEnabled && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/95 p-6">
          <div className="max-w-md text-center">
            <p className="text-2xl font-bold text-white">Pantalla de espera</p>
            <p className="mt-3 text-gray-400">
              Pulse el botón para activar el audio. El navegador requiere un clic antes de anunciar turnos.
            </p>
            <button
              type="button"
              onClick={() => setAudioEnabled(true)}
              className="mt-8 rounded-2xl bg-amber-500 px-10 py-4 text-lg font-semibold text-gray-950 shadow-lg hover:bg-amber-400"
            >
              Activar pantalla y audio
            </button>
          </div>
        </div>
      )}

      <PageMeta title={`Pantalla de espera — ${data?.tenant_name ?? tenantSlug}`} description="Sala de espera" />

      <header className="border-b border-white/10 px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400/80">Instituto de Seguridad Social</p>
            <h1 className="text-xl font-bold sm:text-2xl">{data?.tenant_name ?? "Cargando…"}</h1>
          </div>
          <p className="text-right text-sm text-gray-400">
            {new Date().toLocaleDateString("es-GT", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 sm:px-10">
        {error && (
          <p className="mb-6 rounded-lg bg-red-500/20 px-4 py-3 text-red-200">{error}</p>
        )}

        {loading && !data ? (
          <p className="py-24 text-center text-gray-500">Conectando…</p>
        ) : (
          <>
            <section className="mb-10">
              {ultimoLlamado || (data?.llamados.length ?? 0) > 0 ? (
                <TurnoDisplay
                  turno={ultimoLlamado ?? data!.llamados[0]}
                  destacado
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-white/20 py-20 text-center">
                  <p className="text-2xl text-gray-400">Espere a ser llamado</p>
                  <p className="mt-2 text-gray-500">Su turno aparecerá en esta pantalla</p>
                </div>
              )}
            </section>

            {data && data.llamados.length > 1 && (
              <section className="mb-10">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  También llamados
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.llamados.slice(1, 4).map((t) => (
                    <TurnoDisplay key={`${t.numero_turno}-${t.consultorio_id}`} turno={t} />
                  ))}
                </div>
              </section>
            )}

            {data && data.resumen_consultorios.length > 0 && (
              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Personas en espera por consultorio
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.resumen_consultorios.map((r) => (
                    <div
                      key={r.consultorio_nombre}
                      className="flex items-center justify-between rounded-xl bg-white/5 px-5 py-4"
                    >
                      <span className="font-medium text-gray-200">{r.consultorio_nombre}</span>
                      <span className="font-mono text-2xl font-bold text-amber-400">{r.pendientes}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-gray-950/90 px-6 py-3 text-center text-xs text-gray-500">
        Por favor permanezca atento cuando se llame su número · Sin nombres en pantalla por privacidad
      </footer>
    </div>
  );
}
