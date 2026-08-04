import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { formatFechaCorta } from "@/lib/fechas";
import { type Idioma, REGION } from "@/lib/idiomas";
import type { CotizacionEnLista } from "@/lib/queries/quotes";
import { QuoteStatusBadge } from "./quote-status-badge";

/**
 * Lista de cotizaciones. Mismo patrón de tarjetas apiladas que `ReportList`,
 * por la misma razón: una tabla ancha obliga a scroll horizontal en el
 * celular, y el admin también revisa esto desde ahí.
 */
export async function QuoteList({ items }: { items: CotizacionEnLista[] }) {
  const [t, locale] = await Promise.all([
    getTranslations("cotizacionesPage"),
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
              <QuoteStatusBadge status={c.status} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="font-medium text-text">
                {c.quoteNumber ?? "—"}
              </span>
              {c.dueDate ? <span>{formatFechaCorta(c.dueDate, region)}</span> : null}
              <span>{c.companyName}</span>
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
