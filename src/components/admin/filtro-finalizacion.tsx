import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Filtros rápidos por fecha de finalización: los últimos 15 días, los últimos
 * 30, o un rango a elección. Van a la vista y no dentro del panel de filtros:
 * son la consulta de todos los días ("¿qué se terminó estas dos semanas?").
 *
 * Todo es un enlace o un formulario GET: el filtro queda en la dirección, se
 * puede guardar, y la exportación lo recibe tal cual. Ningún filtrado ocurre en
 * el navegador.
 */
export async function FiltroFinalizacion({
  actual,
  aplicado,
  rango,
  rangoInvalido,
  hrefs,
  ocultos,
}: {
  /** El filtro pedido en la dirección, se haya podido aplicar o no. */
  actual?: "15" | "30" | "rango";
  /** Si de verdad se está filtrando por fecha de finalización. */
  aplicado: boolean;
  rango: { desde: string; hasta: string };
  rangoInvalido: boolean;
  hrefs: { todas: string; d15: string; d30: string; rango: string };
  /** Los demás filtros de la dirección, para no perderlos al aplicar el rango. */
  ocultos: [string, string][];
}) {
  const t = await getTranslations("cotizacionesPage");

  const opciones = [
    { id: undefined, texto: t("finalizadasTodas"), href: hrefs.todas },
    { id: "15", texto: t("ultimos15"), href: hrefs.d15 },
    { id: "30", texto: t("ultimos30"), href: hrefs.d30 },
    { id: "rango", texto: t("rango"), href: hrefs.rango },
  ] as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-text">{t("finalizadasLabel")}</span>
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-muted p-1">
          {opciones.map((o) => {
            const activa = actual === o.id;
            return (
              <Link
                key={o.id ?? "todas"}
                href={o.href}
                // Sin precarga, por lo mismo que los encabezados de la tabla.
                prefetch={false}
                aria-current={activa ? "true" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  activa ? "bg-brand text-white" : "text-muted hover:bg-surface hover:text-text"
                }`}
              >
                {o.texto}
              </Link>
            );
          })}
        </div>
      </div>

      {actual === "rango" ? (
        <form
          method="get"
          action="/admin/cotizaciones"
          className="flex flex-wrap items-end gap-3"
        >
          {ocultos.map(([nombre, valor]) => (
            <input key={nombre} type="hidden" name={nombre} value={valor} />
          ))}
          <input type="hidden" name="finalizadas" value="rango" />
          <div className="space-y-1">
            <label htmlFor="finalizadas-desde" className="block text-xs font-medium text-muted">
              {t("desde")}
            </label>
            <input
              id="finalizadas-desde"
              type="date"
              name="desde"
              defaultValue={rango.desde}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="finalizadas-hasta" className="block text-xs font-medium text-muted">
              {t("hasta")}
            </label>
            <input
              id="finalizadas-hasta"
              type="date"
              name="hasta"
              defaultValue={rango.hasta}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong"
          >
            {t("aplicar")}
          </button>
        </form>
      ) : null}

      {rangoInvalido ? (
        <p role="alert" className="text-sm text-warning">
          {t("rangoInvalido")}
        </p>
      ) : actual === "rango" && !aplicado ? (
        <p className="text-xs text-muted">{t("rangoVacio")}</p>
      ) : null}
      {aplicado ? <p className="text-xs text-muted">{t("notaFinalizadas")}</p> : null}
    </div>
  );
}
