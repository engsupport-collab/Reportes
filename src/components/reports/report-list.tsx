import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { formatFechaCorta } from "@/lib/fechas";
import { type Idioma, REGION } from "@/lib/idiomas";
import type { ReporteEnLista } from "@/lib/queries/reports";
import { Clasificacion, EstadoBadge, Faltantes } from "./badges";

/**
 * Lista de reportes.
 *
 * En vez de una tabla se usan tarjetas apiladas: el sistema se abre igual desde
 * el celular, y una tabla de seis columnas ahí obliga a hacer scroll horizontal
 * o encoge el texto hasta hacerlo ilegible. En pantalla ancha las tarjetas se
 * distribuyen en columnas.
 */
export async function ReportList({
  items,
  mostrarAutor = false,
  mostrarEmpresa = false,
  baseHref = "/reportes",
  unaColumna = false,
}: {
  items: ReporteEnLista[];
  mostrarAutor?: boolean;
  /** El admin ve reportes de las dos empresas mezclados; esto aclara de cuál es cada uno. */
  mostrarEmpresa?: boolean;
  baseHref?: string;
  /**
   * Fuerza una sola columna. Necesario cuando la lista va en la columna
   * lateral del panel: ahí la pantalla es ancha pero el hueco no, y las dos
   * columnas de siempre dejarían las tarjetas ilegibles.
   */
  unaColumna?: boolean;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("reportList"),
    getLocale(),
  ]);
  const region = REGION[locale as Idioma];

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="text-sm font-medium text-text">
          {t("sinReportesTitulo")}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {t("sinReportesTexto")}
        </p>
      </div>
    );
  }

  return (
    // min-w-0 en cada celda: por defecto una celda de grid no encoge por
    // debajo del ancho mínimo de su contenido, así que en el celular la
    // tarjeta se salía de la pantalla en vez de recortar el título.
    <ul className={`grid gap-3 ${unaColumna ? "" : "lg:grid-cols-2"}`}>
      {items.map((r) => (
        <li key={r.id} className="min-w-0">
          <Link
            href={`${baseHref}/${r.id}`}
            className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-brand hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">
                  {r.projectName}
                </p>
                <p className="truncate text-sm text-muted">{r.clientName}</p>
              </div>
              <EstadoBadge status={r.status} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                {t("oc")}{" "}
                <span className="font-medium text-text">
                  {r.purchaseOrderNo ?? t("sinAsignar")}
                </span>
              </span>
              <span>{formatFechaCorta(r.workDate, region)}</span>
              <span>{t("adjuntos", { count: r.attachmentCount })}</span>
              {mostrarAutor ? <span>{r.authorName}</span> : null}
              {mostrarEmpresa ? <span>{r.companyName}</span> : null}
            </div>

            <div className="mt-auto flex flex-wrap gap-2 empty:hidden">
              <Clasificacion
                serviceType={r.serviceType}
                etiquetas={r.etiquetas}
              />
              <Faltantes
                status={r.status}
                attachmentCount={r.attachmentCount}
                tieneFirma={r.tieneFirma}
                purchaseOrderNo={r.purchaseOrderNo}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Paginación en el servidor: los enlaces cambian la URL, no filtran en memoria. */
export async function Paginacion({
  pagina,
  totalPaginas,
  hrefPara,
}: {
  pagina: number;
  totalPaginas: number;
  hrefPara: (pagina: number) => string;
}) {
  if (totalPaginas <= 1) return null;

  const t = await getTranslations("reportList");

  return (
    <nav
      aria-label={t("paginacionAriaLabel")}
      className="flex items-center justify-between gap-3"
    >
      {pagina > 1 ? (
        <Link
          href={hrefPara(pagina - 1)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
        >
          {t("anterior")}
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-muted">
        {t("pagina", { actual: pagina, total: totalPaginas })}
      </span>

      {pagina < totalPaginas ? (
        <Link
          href={hrefPara(pagina + 1)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
        >
          {t("siguiente")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
