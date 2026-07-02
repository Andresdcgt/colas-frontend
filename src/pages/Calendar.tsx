import { useState, useRef, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg } from "@fullcalendar/core";
import { Modal } from "../components/ui/modal";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { useAuth } from "../context/AuthContext";
import { filterByTenant } from "../lib/tenant-filter";
import { getTurnos, type Turno } from "../lib/api";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  llamado: "Llamado",
  en_atencion: "En atención",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  no_show: "No asistió",
};

function turnoToEvent(t: Turno): { id: string; title: string; start: string; extendedProps: Turno } {
  const h = String(t.hora);
  const hora = h.length > 5 ? h.slice(0, 5) : h;
  const startTime = hora.includes(":") && hora.split(":").length === 2 ? `${hora}:00` : hora;
  return {
    id: t.id,
    title: `${t.numero_turno} — ${t.paciente_apellido ?? ""}, ${t.paciente_nombre ?? ""}${t.consultorio_nombre ? ` (${t.consultorio_nombre})` : ""}`,
    start: `${t.fecha}T${startTime}`,
    extendedProps: t,
  };
}

const Calendar: React.FC = () => {
  const { user } = useAuth();
  const isRoot = user?.role === "root";
  const [events, setEvents] = useState<{ id: string; title: string; start: string; extendedProps: Turno }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const loadTurnos = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    setError("");
    const fecha_desde = start.toISOString().slice(0, 10);
    const fecha_hasta = end.toISOString().slice(0, 10);
    try {
      const { turnos } = await getTurnos({ fecha_desde, fecha_hasta });
      setEvents(filterByTenant(turnos, user?.tenantId, isRoot).map(turnoToEvent));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar turnos");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId, isRoot]);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      loadTurnos(arg.start, arg.end);
    },
    [loadTurnos]
  );

  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    const t = (clickInfo.event.extendedProps as Turno) ?? null;
    setSelectedTurno(t);
  }, []);

  return (
    <>
      <PageMeta title="Agenda | Colas Turnos" description="Agenda de turnos del día" />
      <PageBreadcrumb pageTitle="Agenda de turnos" />
      {error && (
        <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {loading && (
        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">Cargando turnos…</p>
      )}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="custom-calendar">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={events}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            eventContent={(eventInfo) => (
              <div className="fc-event-main fc-event-turno p-1 rounded-sm truncate">
                <span className="fc-event-time">{eventInfo.timeText}</span>
                <span className="fc-event-title">{eventInfo.event.title}</span>
              </div>
            )}
            locale="es"
            buttonText={{
              today: "Hoy",
              month: "Mes",
              week: "Semana",
              day: "Día",
            }}
          />
        </div>
      </div>

      <Modal
        isOpen={!!selectedTurno}
        onClose={() => setSelectedTurno(null)}
        className="max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900"
      >
        {selectedTurno && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Turno {selectedTurno.numero_turno}
            </h3>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Paciente</dt>
                <dd className="font-medium">
                  {selectedTurno.paciente_apellido}, {selectedTurno.paciente_nombre}
                  {selectedTurno.paciente_dni ? ` — DNI ${selectedTurno.paciente_dni}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Consultorio</dt>
                <dd className="font-medium">{selectedTurno.consultorio_nombre ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Fecha y hora</dt>
                <dd className="font-medium">
                  {selectedTurno.fecha} {String(selectedTurno.hora).slice(0, 5)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Estado</dt>
                <dd className="font-medium">
                  {ESTADO_LABEL[selectedTurno.estado] ?? selectedTurno.estado}
                </dd>
              </div>
              {selectedTurno.observaciones && (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Observaciones</dt>
                  <dd className="font-medium">{selectedTurno.observaciones}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </>
  );
};

export default Calendar;
