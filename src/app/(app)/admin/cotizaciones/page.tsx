import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { FiltroFinalizacion } from "@/components/admin/filtro-finalizacion";
import { OrdenMovil } from "@/components/admin/orden-movil";
import { QuoteList } from "@/components/admin/quote-list";
import { QuoteTable } from "@/components/admin/quote-table";
import {
  FilterPanel,
  type CampoFiltro,
} from "@/components/reports/filter-panel";
import { Paginacion } from "@/components/reports/report-list";
import { Saludo } from "@/components/saludo";
import { requireAdmin } from "@/lib/auth-guard";
import { ESTADOS_COTIZACION } from "@/lib/cotizaciones";
import {
  CAMPOS_ORDEN,
  type CampoOrden,
  type FiltrosLeidos,
  type ParametrosCotizaciones,
  aFiltrosDeConsulta,
  direccionInicial,
  leerFiltrosCotizaciones,
  parametrosDe,
} from "@/lib/filtros-cotizaciones";
import { listarCotizaciones } from "@/lib/queries/quotes";

type Params = { searchParams: Promise<ParametrosCotizaciones> };

/** Une una dirección con sus parámetros, sin "?" colgando cuando no hay ninguno. */
function conParametros(ruta: string, sp: URLSearchParams): string {
  const query = sp.toString();
  return query ? `${ruta}?${query}` : ruta;
}

/**
 * Todas las cotizaciones, con búsqueda, filtros, orden y exportación. Es la
 * fuente oficial que reemplaza al Excel — protegida por `requireAdmin()`,
 * porque solo el administrador la alimenta. El empleado nunca llega aquí:
 * elige de la lista activa desde el formulario de reporte, no desde este
 * panel.
 *
 * Todo el estado de la vista —filtros, orden, página— vive en la dirección y
 * lo lee `leerFiltrosCotizaciones`, la misma función que usa la exportación:
 * así el archivo exportado trae exactamente lo que esta pantalla muestra.
 */
export default async function AdminCotizacionesPage({ searchParams }: Params) {
  const user = await requireAdmin();
  const params = await searchParams;
  const [t, tFiltros, tEstados] = await Promise.all([
    getTranslations("cotizacionesPage"),
    getTranslations("filtros"),
    getTranslations("estadosCotizacion"),
  ]);

  const filtros = leerFiltrosCotizaciones(params, {
    empresasPermitidas: user.empresas.map((e) => e.id),
    ahora: new Date(),
  });

  const resultado = await listarCotizaciones(aFiltrosDeConsulta(filtros));

  /** La dirección de esta misma vista con algún cambio; cualquier cambio vuelve a la página 1. */
  const href = (cambios: Partial<FiltrosLeidos>) =>
    conParametros(
      "/admin/cotizaciones",
      parametrosDe({ ...filtros, pagina: 1, ...cambios }),
    );

  /** Tocar la columna por la que ya se ordena invierte el sentido; otra, empieza por el suyo. */
  const hrefOrden = (campo: CampoOrden) =>
    href({
      orden: {
        campo,
        dir:
          filtros.orden.campo === campo
            ? filtros.orden.dir === "asc"
              ? "desc"
              : "asc"
            : direccionInicial(campo),
      },
    });

  const hrefExportar = conParametros(
    "/api/cotizaciones/exportar",
    // Sin la página: el archivo lleva todas las filas del filtro, no veinte.
    parametrosDe({ ...filtros, pagina: 1 }),
  );

  const hayFiltros = Boolean(
    filtros.q ||
      filtros.empresa ||
      filtros.estado ||
      filtros.soloSinRevisar ||
      filtros.finalizadas,
  );

  const campos: CampoFiltro[] = [
    {
      tipo: "select",
      name: "empresa",
      label: tFiltros("empresa"),
      valor: filtros.empresa ?? "",
      vacio: tFiltros("todas"),
      opciones: user.empresas.map((e) => ({ value: e.id, label: e.name })),
    },
    {
      tipo: "select",
      name: "estado",
      label: tFiltros("estado"),
      valor: filtros.estado ?? "",
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
      activo: filtros.soloSinRevisar,
    },
  ];

  const nombreColumna: Record<CampoOrden, string> = {
    numero: t("colNumero"),
    proyecto: t("colProyecto"),
    cliente: t("colCliente"),
    empresa: t("colEmpresa"),
    estado: t("colEstado"),
    oc: t("colOc"),
    entrega: t("colEntrega"),
    valor: t("colValor"),
    creada: t("colCreada"),
    finalizada: t("colFinalizada"),
  };

  return (
    <>
      <Saludo nombreCompleto={user.fullName} />

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterPanel
            basePath="/admin/cotizaciones"
            q={filtros.q}
            campos={campos}
            // El panel maneja empresa, estado y "sin revisar"; el filtro de
            // finalización y el orden viven fuera de él y no se pierden al aplicar.
            conservar={[
              ...parametrosDe({
                ...filtros,
                q: undefined,
                empresa: undefined,
                estado: undefined,
                soloSinRevisar: false,
                pagina: 1,
              }).entries(),
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            {/* Un enlace normal, no un botón con JavaScript: la descarga la
                hace el navegador, y en el teléfono también funciona. */}
            <a
              href={hrefExportar}
              download
              title={t("exportarAyuda")}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text transition hover:border-brand hover:text-brand"
            >
              {t("exportar")}
            </a>
            <Link
              href="/admin/cotizaciones/nueva"
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
            >
              {t("nueva")}
            </Link>
          </div>
        </div>

        <FiltroFinalizacion
          actual={filtros.finalizadas}
          aplicado={Boolean(filtros.periodo)}
          rango={filtros.rango}
          rangoInvalido={filtros.rangoInvalido}
          hrefs={{
            todas: href({ finalizadas: undefined }),
            d15: href({ finalizadas: "15" }),
            d30: href({ finalizadas: "30" }),
            rango: href({ finalizadas: "rango" }),
          }}
          ocultos={[
            ...parametrosDe({ ...filtros, finalizadas: undefined, pagina: 1 }).entries(),
          ]}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {t("resultado", { count: resultado.total })}
            {filtros.q ? t("paraQuery", { q: filtros.q }) : ""}
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

        <OrdenMovil
          etiqueta={t("ordenarPor")}
          actual={`${filtros.orden.campo}:${filtros.orden.dir}`}
          opciones={CAMPOS_ORDEN.flatMap((campo) =>
            (["asc", "desc"] as const).map((dir) => ({
              valor: `${campo}:${dir}`,
              texto: t(dir === "asc" ? "ordenAscendente" : "ordenDescendente", {
                columna: nombreColumna[campo],
              }),
              href: href({ orden: { campo, dir } }),
            })),
          )}
        />

        <div className="hidden md:block">
          <QuoteTable items={resultado.items} orden={filtros.orden} hrefOrden={hrefOrden} />
        </div>
        <div className="md:hidden">
          <QuoteList items={resultado.items} />
        </div>

        <Paginacion
          pagina={resultado.pagina}
          totalPaginas={resultado.totalPaginas}
          hrefPara={(p) =>
            conParametros("/admin/cotizaciones", parametrosDe({ ...filtros, pagina: p }))
          }
        />
      </div>
    </>
  );
}
