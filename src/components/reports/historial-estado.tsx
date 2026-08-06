import type { getTranslations } from "next-intl/server";

import { formatInstante } from "@/lib/fechas";
import type { EventoEstadoReporte } from "@/lib/queries/reports";

/**
 * Línea de tiempo de cierres y reaperturas de un reporte.
 *
 * Puramente informativa —de servidor, sin ninguna acción— porque eso es
 * justo lo que es: un hecho ya ocurrido, no algo que se edite. Se lee de
 * arriba hacia abajo en el orden en que pasó, no con lo último primero: es
 * una historia, no una bandeja de novedades.
 *
 * No se muestra si la lista viene vacía —un reporte que nunca se terminó no
 * tiene nada que contar todavía— en vez de mostrar una tarjeta con un
 * "sin eventos" que no le dice nada a nadie.
 */
export function HistorialEstado({
  eventos,
  t,
}: {
  eventos: EventoEstadoReporte[];
  t: Awaited<ReturnType<typeof getTranslations<"reportDetail">>>;
}) {
  if (eventos.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-text">{t("historialTitulo")}</h3>
      <ol className="space-y-4">
        {eventos.map((e) => (
          <li key={e.id} className="border-l-2 border-border pl-3">
            <p className="text-sm font-medium text-text">
              {e.tipo === "finalizado" ? t("eventoFinalizado") : t("eventoReabierto")}
            </p>
            <p className="text-xs text-muted">
              {t("eventoPorYCuando", {
                nombre: e.userName ?? t("usuarioEliminado"),
                fecha: formatInstante(e.createdAt),
              })}
            </p>
            {e.motivo ? (
              <p className="mt-1 text-xs text-text">
                {t("motivoLabel")}: {e.motivo}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
