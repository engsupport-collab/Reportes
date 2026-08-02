import Link from "next/link";
import { notFound } from "next/navigation";

import {
  eliminarAdjuntoAction,
  subirAdjuntosAction,
} from "@/actions/attachments";
import { cambiarEstadoAction, eliminarReporteAction } from "@/actions/reports";
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
} from "@/components/reports/report-actions";
import { SignatureBlock } from "@/components/reports/signature-block";
import { ViaticoList } from "@/components/reports/viatico-list";
import { ViaticoUploader } from "@/components/reports/viatico-uploader";
import { MAX_ARCHIVOS_POR_REPORTE } from "@/lib/archivos";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { formatFechaLarga, formatInstante } from "@/lib/fechas";
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

export default async function DetalleReportePage({ params }: Params) {
  const user = await requireAccesoReportes();
  const { id } = await params;

  const reporte = await obtenerReporte(id);

  // Mismo resultado si el reporte no existe o si es de otra persona: decir
  // "existe pero no es tuyo" confirmaría qué identificadores son reales.
  if (!reporte || !puedeAccederAReporte(user, reporte)) {
    notFound();
  }

  const adjuntos = await listarAdjuntos(reporte.id);
  const viaticos = await listarViaticos(reporte.id);
  const sinAdjuntos = adjuntos.length === 0;
  const editado = reporte.updatedBy !== null;
  const esAdmin = user.role === "admin";

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl space-y-5">
        {/* El detalle es la misma página para los dos roles; solo cambia a
            dónde vuelve, para no dejar al admin en una lista que no es la suya. */}
        <Link
          href={esAdmin ? "/admin/reportes" : "/reportes"}
          className="inline-block text-sm font-medium text-muted transition hover:text-text"
        >
          ← Volver a {esAdmin ? "todos los reportes" : "mis reportes"}
        </Link>

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
            <Dato
              etiqueta="No. orden de compra"
              valor={reporte.purchaseOrderNo ?? "Sin asignar"}
            />
            <Dato
              etiqueta="Fecha del trabajo"
              valor={formatFechaLarga(reporte.workDate)}
            />
            <Dato etiqueta="Creado por" valor={reporte.authorName} />
            <Dato
              etiqueta="Creado el"
              valor={formatInstante(reporte.createdAt)}
            />
          </dl>

          <div className="mt-6">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              Detalles del trabajo
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
              <p className="mt-2 text-sm italic text-muted">Sin detalles.</p>
            )}
          </div>

          {editado ? (
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted">
              Última edición: {formatInstante(reporte.updatedAt)}
              {reporte.updatedBy !== reporte.authorId
                ? " · modificado por un administrador"
                : ""}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text">
              Archivos adjuntos
            </h3>
            <span className="text-xs text-muted">
              {adjuntos.length} de {MAX_ARCHIVOS_POR_REPORTE}
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text">Viáticos</h3>
            <span className="text-xs text-muted">{viaticos.length}</span>
          </div>

          <div className="space-y-4">
            <ViaticoList viaticos={viaticos} onEliminar={eliminarViaticoAction} />
            <ViaticoUploader action={agregarViaticoAction.bind(null, reporte.id)} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text">Firma</h3>
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

        <div className="flex flex-wrap items-center gap-3">
          <EstadoToggle
            action={cambiarEstadoAction.bind(null, reporte.id)}
            status={reporte.status}
            sinAdjuntos={sinAdjuntos}
          />

          <Link
            href={`/reportes/${reporte.id}/editar`}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
          >
            Editar
          </Link>

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
                Para eliminarlo, vuelve a ponerlo en proceso
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
