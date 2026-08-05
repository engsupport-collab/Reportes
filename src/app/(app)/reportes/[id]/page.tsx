import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  eliminarAdjuntoAction,
  subirAdjuntosAction,
} from "@/actions/attachments";
import {
  cambiarEstadoAction,
  eliminarReporteAction,
  finalizarReporteAction,
} from "@/actions/reports";
import { borrarFirmaAction, firmarReporteAction } from "@/actions/signature";
import {
  agregarViaticoAction,
  eliminarViaticoAction,
} from "@/actions/viaticos";
import { AppShell } from "@/components/app-shell";
import { AttachmentList } from "@/components/reports/attachment-list";
import { AttachmentUploader } from "@/components/reports/attachment-uploader";
import {
  Clasificacion,
  EstadoBadge,
  Faltantes,
} from "@/components/reports/badges";
import {
  EliminarReporte,
  EstadoToggle,
  FinalizarReporte,
} from "@/components/reports/report-actions";
import { SignatureBlock } from "@/components/reports/signature-block";
import { ViaticoList } from "@/components/reports/viatico-list";
import { ViaticoUploader } from "@/components/reports/viatico-uploader";
import { MAX_ARCHIVOS_POR_REPORTE } from "@/lib/archivos";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { formatFechaLarga, formatInstante } from "@/lib/fechas";
import { formatearMonto } from "@/lib/moneda";
import { listarAdjuntos } from "@/lib/queries/attachments";
import { obtenerReporte } from "@/lib/queries/reports";
import { listarViaticos } from "@/lib/queries/viaticos";

type Params = { params: Promise<{ id: string }> };

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {etiqueta}
      </dt>
      <dd className="mt-1 text-sm text-text">{valor}</dd>
    </div>
  );
}

/** Detalle de un reporte de viáticos: solo los gastos y a qué reporte pertenecen. */
async function DetalleViatico({
  reporte,
  esAdmin,
  t,
}: {
  reporte: NonNullable<Awaited<ReturnType<typeof obtenerReporte>>>;
  esAdmin: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"reportDetail">>>;
}) {
  const gastos = await listarViaticos(reporte.id);
  const total = gastos.reduce((suma, g) => suma + (g.amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={esAdmin ? "/admin/reportes" : "/reportes"}
          className="inline-block text-sm font-medium text-muted transition hover:text-text"
        >
          {t("volver", {
            destino: esAdmin ? t("todosLosReportes") : t("misReportes"),
          })}
        </Link>

        <a
          href={`/api/reportes/${reporte.id}/pdf`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-muted"
        >
          {t("descargarReporte")}
        </a>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text">
                {t("viaticosTitulo")}
              </h2>
              {esAdmin ? (
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                  {reporte.companyName}
                </span>
              ) : null}
            </div>
            {/* El enlace a la cotización de origen solo tiene sentido para el
                admin: es la única vista que existe de ella — mismo criterio
                que en el detalle de un reporte de servicio. */}
            {esAdmin && reporte.quoteId ? (
              <Link
                href={`/admin/cotizaciones/${reporte.quoteId}`}
                className="mt-0.5 inline-block text-sm text-brand hover:underline"
              >
                {t("justificaA", { proyecto: reporte.projectName })}
              </Link>
            ) : (
              <p className="mt-0.5 text-sm text-muted">
                {t("justificaA", { proyecto: reporte.projectName })}
              </p>
            )}
          </div>
          <EstadoBadge status={reporte.status} />
        </div>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <Dato etiqueta={t("creadoPor")} valor={reporte.authorName} />
          <Dato etiqueta={t("creadoEl")} valor={formatInstante(reporte.createdAt)} />
          <Dato etiqueta={t("totalGastos")} valor={formatearMonto(total, reporte.currency)} />
        </dl>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text">{t("gastos")}</h3>
          <span className="text-xs text-muted">{gastos.length}</span>
        </div>

        <div className="space-y-4">
          <ViaticoList
            viaticos={gastos}
            moneda={reporte.currency}
            onEliminar={eliminarViaticoAction}
          />
          <ViaticoUploader
            action={agregarViaticoAction.bind(null, reporte.id)}
            moneda={reporte.currency}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <EstadoToggle
          action={cambiarEstadoAction.bind(null, reporte.id)}
          status={reporte.status}
          sinAdjuntos={false}
        />

        <div className="ml-auto">
          {reporte.status === "en_proceso" ? (
            <EliminarReporte action={eliminarReporteAction.bind(null, reporte.id)} />
          ) : (
            <p className="text-xs text-muted">{t("volverEnProceso")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function DetalleReportePage({ params }: Params) {
  const user = await requireAccesoReportes();
  const { id } = await params;

  const reporte = await obtenerReporte(id);

  // Mismo resultado si el reporte no existe o si es de otra persona: decir
  // "existe pero no es tuyo" confirmaría qué identificadores son reales.
  if (!reporte || !puedeAccederAReporte(user, reporte)) {
    notFound();
  }

  const esAdmin = user.role === "admin";
  const t = await getTranslations("reportDetail");

  // Un reporte de viáticos es una pantalla distinta: casi ningún campo del
  // reporte de servicio le aplica (ni orden, ni firma, ni adjuntos de
  // evidencia), así que tiene su propio detalle en vez de esconder secciones
  // de este.
  if (reporte.type === "viaticos") {
    return (
      <AppShell user={user}>
        <DetalleViatico reporte={reporte} esAdmin={esAdmin} t={t} />
      </AppShell>
    );
  }

  const adjuntos = await listarAdjuntos(reporte.id);
  const sinAdjuntos = adjuntos.length === 0;
  const editado = reporte.updatedBy !== null;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl space-y-5">
        {/* El detalle es la misma página para los dos roles; solo cambia a
            dónde vuelve, para no dejar al admin en una lista que no es la suya. */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href={esAdmin ? "/admin/reportes" : "/reportes"}
            className="inline-block text-sm font-medium text-muted transition hover:text-text"
          >
            {t("volver", {
              destino: esAdmin ? t("todosLosReportes") : t("misReportes"),
            })}
          </Link>

          <a
            href={`/api/reportes/${reporte.id}/pdf`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-muted"
          >
            {t("descargarReporte")}
          </a>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text">
                  {reporte.projectName}
                </h2>
                {/* El admin ve reportes de las dos empresas mezclados; sin
                    esto, nada en esta pantalla diría de cuál es este. */}
                {esAdmin ? (
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                    {reporte.companyName}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-muted">{reporte.clientName}</p>
            </div>
            <EstadoBadge status={reporte.status} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
            <Clasificacion
              serviceType={reporte.serviceType}
              etiquetas={reporte.etiquetas}
            />
            <Faltantes
              status={reporte.status}
              attachmentCount={adjuntos.length}
              tieneFirma={reporte.signatureUrl !== null}
              purchaseOrderNo={reporte.purchaseOrderNo}
            />
          </div>

          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                {t("cotizacion")}
              </dt>
              <dd className="mt-1 text-sm text-text">
                {/* El enlace a la cotización de origen solo tiene sentido para
                    el admin: es la única vista que existe de ella. */}
                {esAdmin && reporte.quoteId ? (
                  <Link
                    href={`/admin/cotizaciones/${reporte.quoteId}`}
                    className="text-brand hover:underline"
                  >
                    {reporte.quoteNumber ?? t("sinAsignar")}
                  </Link>
                ) : (
                  (reporte.quoteNumber ?? t("sinAsignar"))
                )}
              </dd>
            </div>
            <Dato
              etiqueta={t("ordenCompra")}
              valor={reporte.purchaseOrderNo ?? t("sinAsignar")}
            />
            <Dato
              etiqueta={t("fechaTrabajo")}
              valor={formatFechaLarga(reporte.workDate)}
            />
            <Dato etiqueta={t("creadoPor")} valor={reporte.authorName} />
            <Dato
              etiqueta={t("creadoEl")}
              valor={formatInstante(reporte.createdAt)}
            />
          </dl>

          <div className="mt-6">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              {t("detallesTrabajo")}
            </h3>
            {reporte.details ? (
              // whitespace-pre-line conserva los saltos de línea que escribió
              // el empleado, sin permitir HTML: React escapa el contenido.
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text">
                {reporte.details}
              </p>
            ) : (
              // Sin alerta ni badge — el detalle es opcional a propósito, y su
              // ausencia no es un pendiente, solo la falta de una nota.
              <p className="mt-2 text-sm italic text-muted">{t("sinDetalles")}</p>
            )}
          </div>

          {editado ? (
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted">
              {t("ultimaEdicion", { fecha: formatInstante(reporte.updatedAt) })}
              {reporte.updatedBy !== reporte.authorId
                ? t("modificadoAdmin")
                : ""}
            </p>
          ) : null}
        </div>

        {/* Editar va justo aquí, encima de los adjuntos: es el orden real del
            trabajo — se corrige lo que quedó mal escrito y recién entonces se
            empiezan a subir los documentos. Al final de la pantalla quedaba
            después de todo lo que venía a corregir. */}
        <div className="flex justify-end">
          <Link
            href={`/reportes/${reporte.id}/editar`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
          >
            {t("editar")}
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text">
              {t("archivosAdjuntos")}
            </h3>
            <span className="text-xs text-muted">
              {t("deTotal", { count: adjuntos.length, max: MAX_ARCHIVOS_POR_REPORTE })}
            </span>
          </div>

          <div className="space-y-4">
            <AttachmentList
              adjuntos={adjuntos}
              onEliminar={eliminarAdjuntoAction}
            />
            <AttachmentUploader
              action={subirAdjuntosAction.bind(null, reporte.id)}
              restantes={MAX_ARCHIVOS_POR_REPORTE - adjuntos.length}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text">{t("firma")}</h3>
          <SignatureBlock
            // Se pasa la ruta autenticada, nunca la del almacenamiento.
            firmaUrl={reporte.signatureUrl ? `/api/firmas/${reporte.id}` : null}
            firmanteNombre={reporte.signatureName}
            firmadoEl={
              reporte.signedAt ? formatInstante(reporte.signedAt) : null
            }
            nombrePorDefecto={reporte.clientName}
            onFirmar={firmarReporteAction.bind(null, reporte.id)}
            onBorrar={borrarFirmaAction.bind(null, reporte.id)}
          />
        </div>

        <div className="flex flex-wrap items-start gap-3">
          {/* Cerrar el reporte y mandárselo al cliente son el mismo gesto, y
              por eso el mismo botón: ver FinalizarReporte. Volver a ponerlo en
              proceso no manda nada, así que sigue siendo el toggle de siempre. */}
          {reporte.status === "en_proceso" ? (
            <FinalizarReporte
              action={finalizarReporteAction.bind(null, reporte.id)}
              correoRegistrado={reporte.signatureEmail}
              sinAdjuntos={sinAdjuntos}
            />
          ) : (
            <EstadoToggle
              action={cambiarEstadoAction.bind(null, reporte.id)}
              status={reporte.status}
              sinAdjuntos={sinAdjuntos}
            />
          )}

          <div className="ml-auto">
            {reporte.status === "en_proceso" ? (
              <EliminarReporte
                action={eliminarReporteAction.bind(null, reporte.id)}
              />
            ) : (
              // Un reporte terminado es el registro de un trabajo hecho. Para
              // borrarlo hay que devolverlo antes a "en proceso", y eso queda
              // anotado en el historial de edición.
              <p className="text-xs text-muted">
                {t("volverEnProceso")}
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
