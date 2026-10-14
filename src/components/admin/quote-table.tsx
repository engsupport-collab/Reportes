import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { finalizacionVigente } from "@/lib/cotizaciones";
import { formatFechaCorta, formatInstante } from "@/lib/fechas";
import type { CampoOrden, Orden } from "@/lib/filtros-cotizaciones";
import { type Idioma, REGION } from "@/lib/idiomas";
import { formatearMonto } from "@/lib/moneda";
import type { CotizacionEnLista } from "@/lib/queries/quotes";
import { InsigniaEstadoCotizacion } from "./quote-status-badge";

/**
 * Encabezado que ordena por su columna. Sin precarga: es la misma pantalla
 * con otro orden, y precargar todas las columnas en cada visita son consultas
 * que casi nunca se usan.
 */
function OrdenColumna({
  campo,
  texto,
  orden,
  href,
}: {
  campo: CampoOrden;
  texto: string;
  orden: Orden;
  href: string;
}) {
  const activa = orden.campo === campo;
  return (
    <Link
      href={href}
      prefetch={false}
      className={`group inline-flex items-center gap-1 transition hover:text-brand ${
        activa ? "text-brand" : ""
      }`}
    >
      {texto}
      <span
        aria-hidden
        className={activa ? "" : "text-muted opacity-0 transition group-hover:opacity-100"}
      >
        {activa ? (orden.dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </Link>
  );
}

/**
 * Cotizaciones como hoja de cálculo: una fila por cotización, todo a la vista
 * y cada encabezado ordena por lo suyo. La pidió el cliente así —parecida al
 * Excel que esta sección reemplazó— para revisar el conjunto de un vistazo,
 * sin abrir cada una.
 *
 * Seis columnas, las que pidió el cliente y en su orden: número, estado,
 * cliente, fecha de creación, fecha de finalización y precio. El nombre del
 * proyecto no tiene columna: aparece al pasar el cursor sobre el número, y
 * completo en el detalle. Empresa, orden de compra y entrega siguen en el
 * detalle, en las tarjetas del teléfono y en el archivo exportado.
 *
 * Es para pantallas anchas. En el teléfono la misma lista va en tarjetas
 * (`QuoteList`). En una pantalla estrecha la tabla se desplaza dentro de su
 * caja y el número queda fijo a la izquierda.
 *
 * Ordenar navega a otra dirección: el orden lo aplica la base sobre todas las
 * cotizaciones, no el navegador sobre las veinte de la página.
 */
export async function QuoteTable({
  items,
  orden,
  hrefOrden,
}: {
  items: CotizacionEnLista[];
  orden: Orden;
  /** A dónde lleva tocar el encabezado de una columna. */
  hrefOrden: (campo: CampoOrden) => string;
}) {
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

  const columna = (campo: CampoOrden, texto: string) => (
    <OrdenColumna campo={campo} texto={texto} orden={orden} href={hrefOrden(campo)} />
  );
  const ariaSort = (campo: CampoOrden) =>
    orden.campo === campo
      ? orden.dir === "asc"
        ? ("ascending" as const)
        : ("descending" as const)
      : undefined;
  const vacio = <span className="text-muted">—</span>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left font-semibold text-text">
            <th
              scope="col"
              aria-sort={ariaSort("numero")}
              className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-3"
            >
              {columna("numero", t("colNumero"))}
            </th>
            <th scope="col" aria-sort={ariaSort("estado")} className="whitespace-nowrap px-3 py-3">
              {columna("estado", t("colEstado"))}
            </th>
            <th scope="col" aria-sort={ariaSort("cliente")} className="whitespace-nowrap px-3 py-3">
              {columna("cliente", t("colCliente"))}
            </th>
            <th scope="col" aria-sort={ariaSort("creada")} className="whitespace-nowrap px-3 py-3">
              {columna("creada", t("colCreada"))}
            </th>
            <th
              scope="col"
              aria-sort={ariaSort("finalizada")}
              className="whitespace-nowrap px-3 py-3"
            >
              {columna("finalizada", t("colFinalizada"))}
            </th>
            <th
              scope="col"
              aria-sort={ariaSort("valor")}
              className="whitespace-nowrap px-3 py-3 text-right"
            >
              {columna("valor", t("colValor"))}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const finalizada = finalizacionVigente(c);
            return (
              <tr
                key={c.id}
                className="group border-b border-border transition last:border-0 hover:bg-surface-muted"
              >
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-2.5 transition group-hover:bg-surface-muted">
                  <Link
                    href={`/admin/cotizaciones/${c.id}`}
                    // El proyecto, sin columna propia: al pasar el cursor.
                    title={c.projectName}
                    className="font-semibold text-text hover:text-brand"
                  >
                    {c.quoteNumber ?? "—"}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <InsigniaEstadoCotizacion status={c.status} texto={tEstados(c.status)} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex max-w-[22rem] items-center gap-2">
                    <span className="truncate text-text" title={c.clientName}>
                      {c.clientName}
                    </span>
                    {!c.revisada ? (
                      <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
                        {t("sinRevisarInsignia")}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2.5 text-muted"
                  title={formatInstante(c.createdAt, region)}
                >
                  {formatFechaCorta(c.createdAt, region)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {finalizada ? (
                    <span
                      className="font-medium text-text"
                      title={
                        c.finalizacionRegistradaEl
                          ? t("fechaRegistradaAMano")
                          : formatInstante(finalizada, region)
                      }
                    >
                      {formatFechaCorta(finalizada, region)}
                    </span>
                  ) : c.status === "finalizada" ? (
                    // A la vista, del mismo tono que "Sin revisar": la fecha se
                    // registra desde el detalle, y así se ve cuáles faltan.
                    <span
                      className="inline-flex rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning"
                      title={t("sinFechaPendiente")}
                    >
                      {t("sinFechaCorta")}
                    </span>
                  ) : (
                    vacio
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-text">
                  {c.amount !== null ? formatearMonto(c.amount, c.currency) : vacio}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
