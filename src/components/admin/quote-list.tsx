import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { finalizacionVigente } from "@/lib/cotizaciones";
import { formatFechaCorta } from "@/lib/fechas";
import { type Idioma, REGION } from "@/lib/idiomas";
import type { CotizacionEnLista } from "@/lib/queries/quotes";
import { InsigniaEstadoCotizacion } from "./quote-status-badge";

/**
 * Lista de cotizaciones en tarjetas, para el teléfono. Mismo patrón que
 * `ReportList`, por la misma razón: una tabla ancha obliga a scroll horizontal
 * en el celular, y el admin también revisa esto desde ahí. En pantallas
 * anchas la misma lista va como tabla (`QuoteTable`).
 */
export async function QuoteList({ items }: { items: CotizacionEnLista[] }) {
  const [t, tEstados, locale] = await Promise.all([
    getTranslations("cotizacionesPage"),
    getTranslations("estadosCotizacion"),
    getLocale(),
  ]);
  const region = REGION[locale as Idioma];

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="text-sm text-muted">{t("sinCotizaciones")}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {items.map((c) => (
        <li key={c.id} className="min-w-0">
          <Link
            href={`/admin/cotizaciones/${c.id}`}
            className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-brand hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">
                  {c.projectName}
                </p>
                <p className="truncate text-sm text-muted">{c.clientName}</p>
              </div>
              <InsigniaEstadoCotizacion status={c.status} texto={tEstados(c.status)} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="font-medium text-text">
                {c.quoteNumber ?? "—"}
              </span>
              {c.dueDate ? <span>{formatFechaCorta(c.dueDate, region)}</span> : null}
              <span>{c.companyName}</span>
              {/* La fecha de finalización también a la vista en el teléfono,
                  sin abrir la cotización — igual que en la tabla. */}
              {finalizacionVigente(c) ? (
                <span>
                  {t("colFinalizada")}{" "}
                  <span className="font-medium text-text">
                    {formatFechaCorta(finalizacionVigente(c)!, region)}
                  </span>
                </span>
              ) : c.status === "finalizada" ? (
                <span className="font-medium text-warning" title={t("sinFechaPendiente")}>
                  {t("colFinalizada")}: {t("sinFechaRegistrada")}
                </span>
              ) : null}
            </div>

            {!c.revisada ? (
              <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
                {t("sinRevisarInsignia")}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
