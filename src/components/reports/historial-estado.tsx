import type { getTranslations } from "next-intl/server";

import { formatInstante } from "@/lib/fechas";
import type { EventoEstadoReporte } from "@/lib/queries/reports";

type T = Awaited<ReturnType<typeof getTranslations<"reportDetail">>>;

/** Qué pasó, en una frase. Los datos del evento salen de su `metadata`. */
function titulo(evento: EventoEstadoReporte, t: T): string {
  const { datos } = evento;
  switch (evento.tipo) {
    case "finalizado":
      return t("eventoFinalizado");
    case "reabierto":
      return t("eventoReabierto");
    case "correo_enviado":
      // Los envíos anteriores a la copia a administración no la traen.
      return datos.copia
        ? t("eventoCorreoEnviadoConCopia", { correo: datos.para ?? "", copia: datos.copia })
        : t("eventoCorreoEnviado", { correo: datos.para ?? "" });
    case "correo_fallido":
      return t("eventoCorreoFallido", { correo: datos.para ?? "" });
    case "correo_corregido":
      return t("eventoCorreoCorregido", { de: datos.de ?? "", a: datos.a ?? "" });
  }
}

/**
 * Línea de tiempo de un reporte: cierres, reaperturas y cada envío al cliente.
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
  t: T;
}) {
  if (eventos.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-text">{t("historialTitulo")}</h3>
      <ol className="space-y-4">
        {eventos.map((e) => (
          <li
            key={e.id}
            className={`border-l-2 pl-3 ${
              e.tipo === "correo_fallido" ? "border-danger" : "border-border"
            }`}
          >
            <p
              className={`break-words text-sm font-medium ${
                e.tipo === "correo_fallido" ? "text-danger" : "text-text"
              }`}
            >
              {titulo(e, t)}
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
            {/* El porqué de un envío fallido, tal como lo dio el servidor: es
                lo que hay que mirar cuando alguien avisa de que no le llegó. */}
            {e.tipo === "correo_fallido" && e.datos.causa ? (
              <p className="mt-1 text-xs text-muted">
                {t("detalleTecnico", { detalle: e.datos.causa })}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
