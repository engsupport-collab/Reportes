import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  cambiarEstadoCotizacionAction,
  marcarCotizacionRevisadaAction,
} from "@/actions/quotes";
import {
  CambiarEstadoCotizacion,
  MarcarRevisadaBoton,
} from "@/components/admin/quote-actions";
import { QuoteStatusBadge } from "@/components/admin/quote-status-badge";
import { Saludo } from "@/components/saludo";
import { requireAdmin } from "@/lib/auth-guard";
import { esEstadoActivo } from "@/lib/cotizaciones";
import { formatFechaLarga, formatInstante } from "@/lib/fechas";
import { formatearMonto } from "@/lib/moneda";
import { listarReportesDeCotizacion, obtenerCotizacion } from "@/lib/queries/quotes";

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

export default async function DetalleCotizacionPage({ params }: Params) {
  const user = await requireAdmin();
  const { id } = await params;

  const cotizacion = await obtenerCotizacion(id);
  if (!cotizacion) notFound();

  const [reportes, t, tForm, tTipo] = await Promise.all([
    listarReportesDeCotizacion(id),
    getTranslations("cotizacionDetail"),
    getTranslations("cotizacionForm"),
    getTranslations("nuevoReportePage"),
  ]);

  const firmados = reportes.filter((r) => r.tieneFirma).length;

  return (
    <>
      <Saludo nombreCompleto={user.fullName} />

      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          href="/admin/cotizaciones"
          className="inline-block text-sm font-medium text-muted transition hover:text-text"
        >
          {tForm("volver")}
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text">
                  {cotizacion.projectName}
                </h2>
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                  {cotizacion.companyName}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted">{cotizacion.clientName}</p>
            </div>
            <QuoteStatusBadge status={cotizacion.status} />
          </div>

          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <Dato etiqueta={tForm("quoteNumber")} valor={cotizacion.quoteNumber ?? "—"} />
            <Dato
              etiqueta={tForm("purchaseOrderNo")}
              valor={cotizacion.purchaseOrderNo ?? "—"}
            />
            <Dato
              etiqueta={tForm("dueDate")}
              valor={
                cotizacion.dueDate ? formatFechaLarga(cotizacion.dueDate) : "—"
              }
            />
            {cotizacion.amount !== null ? (
              <Dato etiqueta={tForm("amount")} valor={formatearMonto(cotizacion.amount, cotizacion.currency)} />
            ) : null}
            <Dato etiqueta={t("creadaPor")} valor={cotizacion.createdByName} />
            <Dato etiqueta={t("creadaEl")} valor={formatInstante(cotizacion.createdAt)} />
          </dl>

          {cotizacion.description ? (
            <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-text">
              {cotizacion.description}
            </p>
          ) : null}

          {!cotizacion.revisada ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
              <p className="text-sm text-warning">{t("sinRevisarAviso")}</p>
              <MarcarRevisadaBoton action={marcarCotizacionRevisadaAction.bind(null, id)} />
            </div>
          ) : null}

          {firmados > 0 ? (
            <p className="mt-4 text-xs text-muted">
              {t("avisoFirmados", { count: firmados })}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <CambiarEstadoCotizacion
              action={cambiarEstadoCotizacionAction.bind(null, id)}
              status={cotizacion.status}
            />
            <Link
              href={`/admin/cotizaciones/${id}/editar`}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
            >
              {t("editar")}
            </Link>
            {esEstadoActivo(cotizacion.status) ? (
              <Link
                href={`/reportes/nuevo?companyId=${cotizacion.companyId}&quoteId=${id}`}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
              >
                {t("crearReporte")}
              </Link>
            ) : null}
          </div>
          {!esEstadoActivo(cotizacion.status) ? (
            <p className="mt-3 text-xs text-muted">{t("noActivaAviso")}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text">
            {t("reportesTitulo")}
          </h3>

          {reportes.length === 0 ? (
            <p className="text-sm text-muted">{t("sinReportes")}</p>
          ) : (
            <ul className="space-y-2">
              {reportes.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/reportes/${r.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm transition hover:border-brand"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {/* Servicio y viáticos son hermanos independientes bajo
                          esta cotización — la insignia es lo que distingue,
                          en esta única lista, cuál es cuál. */}
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.type === "viaticos"
                            ? "bg-warning-soft text-warning"
                            : "bg-brand-soft text-brand"
                        }`}
                      >
                        {r.type === "viaticos" ? tTipo("tipoViaticos") : tTipo("tipoServicio")}
                      </span>
                      <span className="min-w-0 truncate text-text">
                        {r.authorName} · {formatInstante(r.createdAt)}
                      </span>
                    </span>
                    {r.type === "viaticos" ? (
                      <span className="shrink-0 text-xs font-medium text-text">
                        {formatearMonto(r.totalGastos, cotizacion.currency)}
                      </span>
                    ) : (
                      <span
                        className={`shrink-0 text-xs font-medium ${r.tieneFirma ? "text-success" : "text-muted"}`}
                      >
                        {r.tieneFirma ? t("firmado") : t("sinFirmar")}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
