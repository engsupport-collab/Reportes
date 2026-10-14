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
  secundario = false,
}: {
  campo: CampoOrden;
  texto: string;
  orden: Orden;
  href: string;
  /** El segundo dato de una columna doble ("Empresa" bajo "Número"). */
  secundario?: boolean;
}) {
  const activa = orden.campo === campo;
  return (
    <Link
      href={href}
      prefetch={false}
      className={`group inline-flex items-center gap-1 transition hover:text-brand ${
        activa ? "text-brand" : secundario ? "text-xs font-medium text-muted" : ""
      } ${secundario && activa ? "text-xs" : ""}`}
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
 * Siete columnas y no diez: el número lleva debajo su empresa, el proyecto su
 * cliente y la orden de compra su fecha de entrega, como en la referencia que
 * mandó el cliente (nombre arriba, dato secundario debajo). Así cabe entera en
 * una pantalla de portátil (medido: desde 1280 píxeles) sin desplazarse de lado.
 * Con diez, a 1440 píxeles la columna de finalización ya quedaba fuera. Los
 * datos secundarios tienen su propio enlace de orden, debajo del principal en
 * el encabezado.
 *
 * Es para pantallas anchas. En el teléfono la misma lista va en tarjetas
 * (`QuoteList`). En una pantalla intermedia la tabla se desplaza dentro de su
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

  const columna = (campo: CampoOrden, texto: string, secundario = false) => (
    <OrdenColumna
      campo={campo}
      texto={texto}
      orden={orden}
      href={hrefOrden(campo)}
      secundario={secundario}
    />
  );
  const ariaSort = (...campos: CampoOrden[]) =>
    campos.includes(orden.campo)
      ? orden.dir === "asc"
        ? ("ascending" as const)
        : ("descending" as const)
      : undefined;
  /** Dos datos en una columna: el principal arriba y el secundario debajo, como en las filas. */
  const doble = (principal: React.ReactNode, secundario: React.ReactNode) => (
    <span className="flex flex-col items-start gap-0.5">
      {principal}
      {secundario}
    </span>
  );
  const vacio = <span className="text-muted">—</span>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left font-semibold text-text">
            <th
              scope="col"
              aria-sort={ariaSort("numero", "empresa")}
              className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2.5 py-3"
            >
              {doble(columna("numero", t("colNumero")), columna("empresa", t("colEmpresa"), true))}
            </th>
            <th
              scope="col"
              aria-sort={ariaSort("proyecto", "cliente")}
              className="whitespace-nowrap px-2.5 py-3"
            >
              {doble(
                columna("proyecto", t("colProyecto")),
                columna("cliente", t("colCliente"), true),
              )}
            </th>
            <th scope="col" aria-sort={ariaSort("estado")} className="whitespace-nowrap px-2.5 py-3">
              {columna("estado", t("colEstado"))}
            </th>
            <th
              scope="col"
              aria-sort={ariaSort("oc", "entrega")}
              className="whitespace-nowrap px-2.5 py-3"
            >
              {doble(columna("oc", t("colOcCorta")), columna("entrega", t("colEntrega"), true))}
            </th>
            <th
              scope="col"
              aria-sort={ariaSort("valor")}
              className="whitespace-nowrap px-2.5 py-3 text-right"
            >
              {columna("valor", t("colValor"))}
            </th>
            <th scope="col" aria-sort={ariaSort("creada")} className="whitespace-nowrap px-2.5 py-3">
              {columna("creada", t("colCreada"))}
            </th>
            <th
              scope="col"
              aria-sort={ariaSort("finalizada")}
              className="whitespace-nowrap px-2.5 py-3"
            >
              {columna("finalizada", t("colFinalizada"))}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const finalizada = finalizacionVigente(c);
            return (
              <tr
                key={c.id}
                className="group border-b border-border align-top transition last:border-0 hover:bg-surface-muted"
              >
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2.5 py-2.5 transition group-hover:bg-surface-muted">
                  <Link
                    href={`/admin/cotizaciones/${c.id}`}
                    className="font-semibold text-text hover:text-brand"
                  >
                    {c.quoteNumber ?? "—"}
                  </Link>
                  <span className="block text-xs text-muted">{c.companyName}</span>
                </td>
                <td className="px-2.5 py-2.5">
                  <Link
                    href={`/admin/cotizaciones/${c.id}`}
                    title={c.projectName}
                    className="block max-w-[15rem] truncate font-medium text-text hover:text-brand"
                  >
                    {c.projectName}
                  </Link>
                  <span className="flex max-w-[15rem] items-center gap-2 text-xs text-muted">
                    <span className="truncate" title={c.clientName}>
                      {c.clientName}
                    </span>
                    {!c.revisada ? (
                      <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">
                        {t("sinRevisarInsignia")}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2.5 py-2.5">
                  <InsigniaEstadoCotizacion status={c.status} texto={tEstados(c.status)} />
                </td>
                <td className="whitespace-nowrap px-2.5 py-2.5">
                  <span className="block text-text" title={t("colOc")}>
                    {c.purchaseOrderNo ?? vacio}
                  </span>
                  <span className="block text-xs text-muted" title={t("colEntrega")}>
                    {c.dueDate ? formatFechaCorta(c.dueDate, region) : "—"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums text-text">
                  {c.amount !== null ? formatearMonto(c.amount, c.currency) : vacio}
                </td>
                <td
                  className="whitespace-nowrap px-2.5 py-2.5 text-muted"
                  title={formatInstante(c.createdAt, region)}
                >
                  {formatFechaCorta(c.createdAt, region)}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2.5">
                  {finalizada ? (
                    <span
                      className="font-medium text-text"
                      title={formatInstante(finalizada, region)}
                    >
                      {formatFechaCorta(finalizada, region)}
                    </span>
                  ) : c.status === "finalizada" ? (
                    <span className="text-xs text-muted" title={t("sinFechaAyuda")}>
                      {t("sinFechaCorta")}
                    </span>
                  ) : (
                    vacio
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
