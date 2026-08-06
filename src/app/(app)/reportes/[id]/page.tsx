import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  eliminarAdjuntoAction,
  subirAdjuntosAction,
} from "@/actions/attachments";
import type { ReabrirState } from "@/actions/reports";
import {
  cambiarEstadoAction,
  eliminarReporteAction,
  finalizarReporteAction,
  reabrirReporteAction,
} from "@/actions/reports";
import { borrarFirmaAction, firmarReporteAction } from "@/actions/signature";
import {
  agregarViaticoAction,
  eliminarViaticoAction,
} from "@/actions/viaticos";
import { AttachmentList } from "@/components/reports/attachment-list";
import { AttachmentUploader } from "@/components/reports/attachment-uploader";
import {
  Clasificacion,
  EstadoBadge,
  Faltantes,
} from "@/components/reports/badges";
import { HistorialEstado } from "@/components/reports/historial-estado";
import {
  EliminarReporte,
  EstadoToggle,
  FinalizarReporte,
  ReabrirReporte,
} from "@/components/reports/report-actions";
import { SignatureBlock } from "@/components/reports/signature-block";
import { ViaticoList } from "@/components/reports/viatico-list";
import { ViaticoUploader } from "@/components/reports/viatico-uploader";
import { MAX_ARCHIVOS_POR_REPORTE } from "@/lib/archivos";
import { Saludo } from "@/components/saludo";
import {
  puedeAccederAReporte,
  reporteBloqueado,
  requireAccesoReportes,
} from "@/lib/auth-guard";
import { formatFechaLarga, formatInstante } from "@/lib/fechas";
import { formatearMonto, type Moneda } from "@/lib/moneda";
import { listarAdjuntos } from "@/lib/queries/attachments";
import {
  listarReportesDeCotizacion,
  type ReporteDeCotizacion,
} from "@/lib/queries/quotes";
import { listarEventosDeReporte, obtenerReporte } from "@/lib/queries/reports";
import { listarViaticos } from "@/lib/queries/viaticos";

type Params = {
  params: Promise<{ id: string }>;
  /**
   * `?vista=viaticos` cambia el selector de la pestaña (ver `SelectorVista`);
   * `?viaticoId=` elige cuál de varios viáticos hermanos ver en detalle
   * (ver `PestanaViaticos`).
   */
  searchParams: Promise<{ vista?: string; viaticoId?: string }>;
};

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

/**
 * El cuerpo de un reporte de viáticos: la ficha y la lista de gastos. Separado
 * de `DetalleViatico` para poder reutilizarlo tal cual dentro de la pestaña
 * "Viáticos" del reporte de servicio (ver `PestanaViaticos` más abajo), sin
 * duplicar el marcado ni la lógica en un segundo lugar.
 */
async function ContenidoViatico({
  reporte,
  esAdmin,
  t,
}: {
  reporte: NonNullable<Awaited<ReturnType<typeof obtenerReporte>>>;
  esAdmin: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"reportDetail">>>;
}) {
  const bloqueado = reporteBloqueado(reporte);
  const [gastos, eventos] = await Promise.all([
    listarViaticos(reporte.id),
    listarEventosDeReporte(reporte.id),
  ]);
  const total = gastos.reduce((suma, g) => suma + (g.amount ?? 0), 0);

  return (
    <>
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
            soloLectura={bloqueado}
          />
          {bloqueado ? (
            <p className="text-sm text-muted">{t("bloqueadoGastos")}</p>
          ) : (
            <ViaticoUploader
              action={agregarViaticoAction.bind(null, reporte.id)}
              moneda={reporte.currency}
            />
          )}
        </div>
      </div>

      <HistorialEstado eventos={eventos} t={t} />
    </>
  );
}

/**
 * Botón de reabrir, o el aviso de que hace falta un administrador —el mismo
 * corte para el reporte de servicio y para el de viáticos, factorizado aquí
 * para no repetirlo dos veces en este archivo.
 */
function AccionReabrir({
  esAdmin,
  action,
  tAcciones,
}: {
  esAdmin: boolean;
  action: (estado: ReabrirState, formData: FormData) => Promise<ReabrirState>;
  tAcciones: Awaited<ReturnType<typeof getTranslations<"reportActions">>>;
}) {
  if (!esAdmin) {
    return <p className="text-xs text-muted">{tAcciones("soloAdminReabre")}</p>;
  }
  return <ReabrirReporte action={action} />;
}

/** Detalle de un reporte de viáticos: cabecera propia + `ContenidoViatico`. */
async function DetalleViatico({
  reporte,
  esAdmin,
  t,
  tAcciones,
}: {
  reporte: NonNullable<Awaited<ReturnType<typeof obtenerReporte>>>;
  esAdmin: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"reportDetail">>>;
  tAcciones: Awaited<ReturnType<typeof getTranslations<"reportActions">>>;
}) {
  const bloqueado = reporteBloqueado(reporte);

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

      <ContenidoViatico reporte={reporte} esAdmin={esAdmin} t={t} />

      <div className="flex flex-wrap items-start gap-3">
        {bloqueado ? (
          <AccionReabrir
            esAdmin={esAdmin}
            action={reabrirReporteAction.bind(null, reporte.id)}
            tAcciones={tAcciones}
          />
        ) : (
          <EstadoToggle
            action={cambiarEstadoAction.bind(null, reporte.id)}
            status={reporte.status}
            sinAdjuntos={false}
          />
        )}

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

/**
 * Pestaña "Viáticos" dentro del reporte de servicio.
 *
 * Si solo hay un viático hermano, se muestra directo — no hay nada que
 * elegir. Si hay varios, primero aparece una lista (autor, fecha, total) y
 * SOLO al elegir uno se carga su detalle completo. Nunca se abre el primero
 * por defecto: eso sería una elección del sistema, no del usuario, y con
 * varios viáticos no hay forma de saber cuál esperaba ver.
 *
 * La selección viaja por la URL (`?viaticoId=`), no por estado de cliente —
 * mismo patrón que ya usa `SelectorVista` para la pestaña misma, y por la
 * misma razón: el servidor ya sabe resolver esto, no hace falta convertir la
 * página en un Client Component para ello.
 *
 * El detalle reutiliza `ContenidoViatico` tal cual, sin `EstadoToggle` ni
 * `EliminarReporte`: esas son acciones sobre el ciclo de vida de ESE reporte
 * de viáticos puntual (marcarlo terminado, borrarlo), y siguen viviendo
 * únicamente en su propia página (`/reportes/[id]` con ese id), igual que
 * hoy. Aquí se puede seguir agregando o quitando líneas de gasto — que es lo
 * que ya hacía `ContenidoViatico` sin ningún cambio.
 */
async function PestanaViaticos({
  reportId,
  moneda,
  hermanos,
  viaticoIdSeleccionado,
  esAdmin,
  t,
  tTipo,
}: {
  reportId: string;
  moneda: Moneda;
  /** Ya filtrados a los que este usuario puede ver. */
  hermanos: ReporteDeCotizacion[];
  viaticoIdSeleccionado: string | undefined;
  esAdmin: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"reportDetail">>>;
  tTipo: Awaited<ReturnType<typeof getTranslations<"nuevoReportePage">>>;
}) {
  const unico = hermanos.length === 1 ? hermanos[0] : undefined;
  // Si la URL trae un id que no es uno de los visibles (viejo, ajeno o
  // manipulado), se ignora y cae en la lista — nunca en un detalle al azar.
  const elegido = unico ?? hermanos.find((v) => v.id === viaticoIdSeleccionado);

  if (elegido) {
    const completo = await obtenerReporte(elegido.id);
    // No debería faltar: ya pasó por `puedeAccederAReporte` al armar
    // `hermanos`. Si de todos modos falta (se borró entre una consulta y la
    // otra), se cae a la lista en vez de romper la página.
    if (!completo) {
      return (
        <PestanaViaticos
          reportId={reportId}
          moneda={moneda}
          hermanos={hermanos.filter((v) => v.id !== elegido.id)}
          viaticoIdSeleccionado={undefined}
          esAdmin={esAdmin}
          t={t}
          tTipo={tTipo}
        />
      );
    }

    return (
      <div className="space-y-5">
        {unico ? null : (
          <Link
            href={`/reportes/${reportId}?vista=viaticos`}
            className="inline-block text-sm font-medium text-muted transition hover:text-text"
          >
            {t("volver", { destino: tTipo("tipoViaticos") })}
          </Link>
        )}
        <ContenidoViatico reporte={completo} esAdmin={esAdmin} t={t} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-text">{tTipo("tipoViaticos")}</h3>
      <ul className="space-y-2">
        {hermanos.map((v) => (
          <li key={v.id}>
            <Link
              href={`/reportes/${reportId}?vista=viaticos&viaticoId=${v.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm transition hover:border-brand"
            >
              <span className="min-w-0 truncate text-text">
                {v.authorName} · {formatInstante(v.createdAt)}
              </span>
              <span className="shrink-0 text-xs font-medium text-text">
                {formatearMonto(v.totalGastos, moneda)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Selector "Servicio / Viáticos (N)" encima del contenido del reporte.
 *
 * Es navegación de servidor pura — dos `<Link>` a la misma ruta con o sin
 * `?vista=viaticos`, igual patrón que ya usa `Paginacion` en
 * `report-list.tsx`. No hace falta estado de cliente: cada pestaña es
 * simplemente la misma página pidiendo otra cosa.
 *
 * Si no hay viáticos visibles, se muestra solo la etiqueta "Servicio", sin
 * enlace — no hay nada que elegir.
 */
function SelectorVista({
  reportId,
  mostrandoViaticos,
  totalViaticos,
  tTipo,
}: {
  reportId: string;
  mostrandoViaticos: boolean;
  totalViaticos: number;
  tTipo: Awaited<ReturnType<typeof getTranslations<"nuevoReportePage">>>;
}) {
  const pill = (activa: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition ${
      activa ? "bg-brand text-white" : "text-muted hover:bg-surface"
    }`;

  return (
    <div className="inline-flex gap-2 rounded-xl border border-border bg-surface-muted p-1">
      <Link
        href={`/reportes/${reportId}`}
        aria-current={!mostrandoViaticos ? "page" : undefined}
        className={pill(!mostrandoViaticos)}
      >
        {tTipo("tipoServicio")}
      </Link>
      {totalViaticos > 0 ? (
        <Link
          href={`/reportes/${reportId}?vista=viaticos`}
          aria-current={mostrandoViaticos ? "page" : undefined}
          className={pill(mostrandoViaticos)}
        >
          {tTipo("tipoViaticos")} ({totalViaticos})
        </Link>
      ) : null}
    </div>
  );
}

export default async function DetalleReportePage({ params, searchParams }: Params) {
  const user = await requireAccesoReportes();
  const [{ id }, { vista, viaticoId }] = await Promise.all([params, searchParams]);

  const reporte = await obtenerReporte(id);

  // Mismo resultado si el reporte no existe o si es de otra persona: decir
  // "existe pero no es tuyo" confirmaría qué identificadores son reales.
  if (!reporte || !puedeAccederAReporte(user, reporte)) {
    notFound();
  }

  const esAdmin = user.role === "admin";
  const [t, tAcciones] = await Promise.all([
    getTranslations("reportDetail"),
    getTranslations("reportActions"),
  ]);

  // Un reporte de viáticos es una pantalla distinta: casi ningún campo del
  // reporte de servicio le aplica (ni orden, ni firma, ni adjuntos de
  // evidencia), así que tiene su propio detalle en vez de esconder secciones
  // de este.
  if (reporte.type === "viaticos") {
    return (
      <>
      <Saludo nombreCompleto={user.fullName} />

        <DetalleViatico reporte={reporte} esAdmin={esAdmin} t={t} tAcciones={tAcciones} />
      </>
    );
  }

  const adjuntos = await listarAdjuntos(reporte.id);
  const sinAdjuntos = adjuntos.length === 0;
  const editado = reporte.updatedBy !== null;

  // Viáticos hermanos de esta misma cotización, para la pestaña de arriba.
  // No son un dato del reporte de servicio ni cuelgan de él — son
  // independientes bajo el mismo quoteId — así que se buscan aparte.
  const hermanosViaticos = reporte.quoteId
    ? (await listarReportesDeCotizacion(reporte.quoteId)).filter(
        (r) => r.type === "viaticos",
      )
    : [];

  // Para decidir cuáles se pueden ver, se resuelve cada hermano completo y se
  // filtra con `puedeAccederAReporte` — la MISMA función que ya decide si
  // este usuario puede abrir cualquier otro reporte, no una regla nueva. Un
  // empleado solo ve aquí los viáticos que él mismo redactó (autor distinto →
  // como si no existiera, igual que si intentara abrir esa página
  // directamente); el admin los ve todos, igual que ya ve todo en el detalle
  // de la cotización.
  //
  // El objeto completo se descarta enseguida: para la pestaña alcanza con la
  // fila ligera que ya trae `listarReportesDeCotizacion` (autor, fecha,
  // total). Volver a pedir el reporte entero de cada uno solo hace falta para
  // el que el usuario efectivamente elija ver — eso lo resuelve
  // `PestanaViaticos` cuando corresponde.
  const viaticosVisibles = (
    await Promise.all(
      hermanosViaticos.map(async (v) => {
        const completo = await obtenerReporte(v.id);
        return completo && puedeAccederAReporte(user, completo) ? v : null;
      }),
    )
  ).filter((v): v is NonNullable<typeof v> => v !== null);

  // Reutiliza las mismas claves que ya traducen "Servicio"/"Viáticos" en el
  // selector de tipo al crear un reporte — ni una clave de i18n nueva.
  const tTipo = await getTranslations("nuevoReportePage");
  const mostrandoViaticos = vista === "viaticos" && viaticosVisibles.length > 0;

  const bloqueado = reporteBloqueado(reporte);
  const eventos = await listarEventosDeReporte(reporte.id);

  return (
    <>
      <Saludo nombreCompleto={user.fullName} />

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

        {/* Solo aparece si hay algo entre lo que elegir: si esta cotización no
            tiene viáticos —el caso normal—, la pantalla queda idéntica a como
            estaba. */}
        {viaticosVisibles.length > 0 ? (
          <SelectorVista
            reportId={reporte.id}
            mostrandoViaticos={mostrandoViaticos}
            totalViaticos={viaticosVisibles.length}
            tTipo={tTipo}
          />
        ) : null}

        {mostrandoViaticos ? (
          <PestanaViaticos
            reportId={reporte.id}
            moneda={reporte.currency}
            hermanos={viaticosVisibles}
            viaticoIdSeleccionado={viaticoId}
            esAdmin={esAdmin}
            t={t}
            tTipo={tTipo}
          />
        ) : (
          <>
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
                después de todo lo que venía a corregir.
                Terminado es cerrado: el enlace directamente desaparece — no se
                deshabilita, porque un enlace deshabilitado sigue siendo un
                enlace que invita a intentarlo. */}
            {bloqueado ? null : (
              <div className="flex justify-end">
                <Link
                  href={`/reportes/${reporte.id}/editar`}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
                >
                  {t("editar")}
                </Link>
              </div>
            )}

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
                  soloLectura={bloqueado}
                />
                {bloqueado ? (
                  <p className="text-sm text-muted">{t("bloqueadoArchivos")}</p>
                ) : (
                  <AttachmentUploader
                    action={subirAdjuntosAction.bind(null, reporte.id)}
                    restantes={MAX_ARCHIVOS_POR_REPORTE - adjuntos.length}
                  />
                )}
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
                soloLectura={bloqueado}
              />
            </div>

            <HistorialEstado eventos={eventos} t={t} />
          </>
        )}

        {/* Las acciones de aquí abajo (terminar/reabrir, eliminar) son del
            reporte de SERVICIO — terminar manda el PDF al cliente, eliminar
            borra ese reporte. Se ocultan en la pestaña Viáticos a propósito:
            un botón sobre el reporte de servicio quedando debajo de un gasto
            en pantalla se leería como si fuera de ese gasto, y no lo es. */}
        {mostrandoViaticos ? null : (
          <div className="flex flex-wrap items-start gap-3">
            {/* Terminado: la única acción posible es reabrir, y solo para el
                admin. Cerrar y mandárselo al cliente son el mismo gesto, y
                por eso el mismo botón: ver FinalizarReporte. */}
            {/* Un reporte de servicio solo tiene dos estados: mientras no esté
                `bloqueado` (es decir, "terminado"), siempre está en_proceso —
                así que la rama que faltaría aquí (bloqueado, pero admin YA
                habilitó de nuevo la edición) no puede ocurrir: en cuanto se
                reabre, `bloqueado` pasa a false y esto vuelve a mostrar
                FinalizarReporte por su cuenta. */}
            {bloqueado ? (
              <AccionReabrir
                esAdmin={esAdmin}
                action={reabrirReporteAction.bind(null, reporte.id)}
                tAcciones={tAcciones}
              />
            ) : (
              <FinalizarReporte
                action={finalizarReporteAction.bind(null, reporte.id)}
                sinAdjuntos={sinAdjuntos}
              />
            )}

            <div className="ml-auto">
              {bloqueado ? (
                // Un reporte terminado es el registro de un trabajo hecho:
                // no se borra sin más. Reabrirlo (arriba) es lo único que
                // vuelve a habilitar esta acción.
                <p className="text-xs text-muted">{t("volverEnProceso")}</p>
              ) : (
                <EliminarReporte
                  action={eliminarReporteAction.bind(null, reporte.id)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
