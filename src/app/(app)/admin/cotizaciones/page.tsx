import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { QuoteList } from "@/components/admin/quote-list";
import {
  FilterPanel,
  type CampoFiltro,
} from "@/components/reports/filter-panel";
import { Paginacion } from "@/components/reports/report-list";
import { requireAdmin } from "@/lib/auth-guard";
import { ESTADOS_COTIZACION, esEstadoCotizacion } from "@/lib/cotizaciones";
import { listarCotizaciones } from "@/lib/queries/quotes";

type Params = {
  searchParams: Promise<{
    q?: string;
    pagina?: string;
    empresa?: string;
    estado?: string;
    sinrevisar?: string;
  }>;
};

/**
 * Todas las cotizaciones, con búsqueda y filtros. Es la fuente oficial que
 * reemplaza al Excel — protegida por `requireAdmin()`, porque solo el
 * administrador la alimenta. El empleado nunca llega aquí: elige de la lista
 * activa desde el formulario de reporte, no desde este panel.
 */
export default async function AdminCotizacionesPage({ searchParams }: Params) {
  const user = await requireAdmin();
  const params = await searchParams;
  const [t, tFiltros, tEstados] = await Promise.all([
    getTranslations("cotizacionesPage"),
    getTranslations("filtros"),
    getTranslations("estadosCotizacion"),
  ]);

  const empresaFiltro = user.empresas.find((e) => e.id === params.empresa)?.id;
  const estado =
    params.estado && esEstadoCotizacion(params.estado)
      ? params.estado
      : undefined;
  const soloSinRevisar = params.sinrevisar === "1";

  const resultado = await listarCotizaciones({
    companyId: empresaFiltro,
    status: estado,
    soloSinRevisar,
    buscar: params.q,
    pagina: Number(params.pagina) || 1,
  });

  function construirHref(cambios: {
    q?: string | null;
    pagina?: number | null;
    empresa?: string | null;
    estado?: string | null;
    sinrevisar?: boolean | null;
  }) {
    const sp = new URLSearchParams();

    const q = cambios.q === undefined ? params.q : (cambios.q ?? undefined);
    if (q) sp.set("q", q);

    const empresaNueva =
      cambios.empresa === undefined ? empresaFiltro : (cambios.empresa ?? undefined);
    if (empresaNueva) sp.set("empresa", empresaNueva);

    const estadoNuevo =
      cambios.estado === undefined ? estado : (cambios.estado ?? undefined);
    if (estadoNuevo) sp.set("estado", estadoNuevo);

    const sinRevisarNuevo =
      cambios.sinrevisar === undefined ? soloSinRevisar : cambios.sinrevisar;
    if (sinRevisarNuevo) sp.set("sinrevisar", "1");

    if (cambios.pagina && cambios.pagina > 1) {
      sp.set("pagina", String(cambios.pagina));
    }

    const query = sp.toString();
    return query ? `/admin/cotizaciones?${query}` : "/admin/cotizaciones";
  }

  const hayFiltros = Boolean(
    params.q || empresaFiltro || estado || soloSinRevisar,
  );

  const campos: CampoFiltro[] = [
    {
      tipo: "select",
      name: "empresa",
      label: tFiltros("empresa"),
      valor: empresaFiltro ?? "",
      vacio: tFiltros("todas"),
      opciones: user.empresas.map((e) => ({ value: e.id, label: e.name })),
    },
    {
      tipo: "select",
      name: "estado",
      label: tFiltros("estado"),
      valor: estado ?? "",
      vacio: tFiltros("todos"),
      opciones: ESTADOS_COTIZACION.map((e) => ({
        value: e,
        label: tEstados(e),
      })),
    },
    {
      tipo: "checkbox",
      name: "sinrevisar",
      label: tFiltros("sinRevisar"),
      activo: soloSinRevisar,
    },
  ];

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterPanel basePath="/admin/cotizaciones" q={params.q} campos={campos} />

          <Link
            href="/admin/cotizaciones/nueva"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
          >
            {t("nueva")}
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {t("resultado", { count: resultado.total })}
            {params.q ? t("paraQuery", { q: params.q }) : ""}
          </p>
          {hayFiltros ? (
            <Link
              href="/admin/cotizaciones"
              className="text-sm font-medium text-brand hover:underline"
            >
              {t("quitarFiltros")}
            </Link>
          ) : null}
        </div>

        <QuoteList items={resultado.items} />

        <Paginacion
          pagina={resultado.pagina}
          totalPaginas={resultado.totalPaginas}
          hrefPara={(p) => construirHref({ pagina: p })}
        />
      </div>
    </AppShell>
  );
}
