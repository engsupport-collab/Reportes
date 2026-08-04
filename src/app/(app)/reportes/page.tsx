import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import {
  FilterPanel,
  type CampoFiltro,
} from "@/components/reports/filter-panel";
import { Paginacion, ReportList } from "@/components/reports/report-list";
import { requireAccesoReportes } from "@/lib/auth-guard";
import {
  ETIQUETAS_TRABAJO,
  TIPOS_SERVICIO,
  TIPOS_SERVICIO_IDS,
  type TipoServicio,
  esEtiquetaValida,
} from "@/lib/etiquetas";
import {
  contarIncompletos,
  contarSinFirma,
  contarSinOrden,
  listarReportesDeEmpleado,
} from "@/lib/queries/reports";

type Params = {
  searchParams: Promise<{
    q?: string;
    pagina?: string;
    faltantes?: string;
    sinorden?: string;
    servicio?: string;
    etiqueta?: string;
  }>;
};

/**
 * Vista General: los reportes del propio empleado, de la empresa activa.
 *
 * Tanto el filtro por autor como el de empresa salen de la sesión, nunca de la
 * URL. Si vinieran de un parámetro, bastaría con cambiarlo para leer los
 * reportes de otra persona o de la otra empresa.
 *
 * El admin no tiene "mis reportes" — ve todo en /admin/reportes. Si llega
 * aquí por una URL escrita a mano, se lo redirige ahí en vez de intentar
 * resolver una empresa activa que para su rol no existe.
 */
export default async function ReportesPage({ searchParams }: Params) {
  const user = await requireAccesoReportes();
  if (user.role === "admin") redirect("/admin/reportes");

  const params = await searchParams;
  const [t, tFiltros, tNav] = await Promise.all([
    getTranslations("reportesPage"),
    getTranslations("filtros"),
    getTranslations("nav"),
  ]);

  const soloIncompletos = params.faltantes === "1";
  const soloSinOrden = params.sinorden === "1";
  const companyId = user.empresaActiva.id;

  // Los valores que llegan por URL se validan contra el catálogo antes de usarse.
  const servicio = TIPOS_SERVICIO_IDS.includes(params.servicio as TipoServicio)
    ? (params.servicio as TipoServicio)
    : undefined;
  const etiqueta =
    params.etiqueta && esEtiquetaValida(params.etiqueta)
      ? params.etiqueta
      : undefined;

  const [resultado, incompletos, sinFirma, sinOrden] = await Promise.all([
    listarReportesDeEmpleado(companyId, {
      authorId: user.id,
      buscar: params.q,
      soloIncompletos,
      soloSinOrden,
      serviceType: servicio,
      etiqueta,
      pagina: Number(params.pagina) || 1,
    }),
    contarIncompletos(companyId, user.id),
    contarSinFirma(companyId, user.id),
    contarSinOrden(companyId, user.id),
  ]);

  /** Construye una URL conservando los filtros vigentes. */
  function construirHref(cambios: {
    q?: string | null;
    pagina?: number | null;
    faltantes?: boolean;
    sinorden?: boolean;
    serviceType?: string | null;
    etiqueta?: string | null;
  }) {
    const sp = new URLSearchParams();

    const q = cambios.q === undefined ? params.q : (cambios.q ?? undefined);
    if (q) sp.set("q", q);

    const faltantesNuevo = cambios.faltantes ?? soloIncompletos;
    if (faltantesNuevo) sp.set("faltantes", "1");

    const sinOrdenNuevo = cambios.sinorden ?? soloSinOrden;
    if (sinOrdenNuevo) sp.set("sinorden", "1");

    const servicioNuevo =
      cambios.serviceType === undefined
        ? servicio
        : (cambios.serviceType ?? undefined);
    if (servicioNuevo) sp.set("servicio", servicioNuevo);

    const etiquetaNueva =
      cambios.etiqueta === undefined ? etiqueta : (cambios.etiqueta ?? undefined);
    if (etiquetaNueva) sp.set("etiqueta", etiquetaNueva);

    // Al cambiar cualquier filtro se vuelve a la página 1: quedarse en la 3 de
    // un resultado que ahora tiene una sola página muestra una lista vacía.
    if (cambios.pagina && cambios.pagina > 1) {
      sp.set("pagina", String(cambios.pagina));
    }

    const query = sp.toString();
    return query ? `/reportes?${query}` : "/reportes";
  }

  const hayFiltros = Boolean(
    params.q || soloIncompletos || soloSinOrden || servicio || etiqueta,
  );

  const campos: CampoFiltro[] = [
    {
      tipo: "select",
      name: "servicio",
      label: tFiltros("tipoServicio"),
      valor: servicio ?? "",
      vacio: tFiltros("todos"),
      opciones: TIPOS_SERVICIO.map((t) => ({ value: t.id, label: t.label })),
    },
    {
      tipo: "select",
      name: "etiqueta",
      label: tFiltros("etiqueta"),
      valor: etiqueta ?? "",
      vacio: tFiltros("todas"),
      opciones: ETIQUETAS_TRABAJO.map((e) => ({
        value: e.id,
        label: e.label,
      })),
    },
    {
      tipo: "checkbox",
      name: "faltantes",
      label: tFiltros("sinDocumento"),
      activo: soloIncompletos,
    },
    {
      // El conteo va en la etiqueta porque es el pendiente que el empleado
      // resuelve él mismo: saber que son tres y no treinta cambia si lo hace
      // ahora o lo deja.
      tipo: "checkbox",
      name: "sinorden",
      label: tFiltros("sinOrden", { count: sinOrden }),
      activo: soloSinOrden,
    },
  ];

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        {/* Aviso de faltantes: el empleado ve sus propios pendientes sin tener
            que buscarlos, que es justo lo que hace que se queden sin subir. */}
        {incompletos > 0 && !soloIncompletos ? (
          <Link
            href="/reportes?faltantes=1"
            className="flex items-center justify-between gap-4 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 transition hover:border-warning/60"
          >
            <div>
              <p className="text-sm font-medium text-warning">
                {t("avisoSinDocumento", { count: incompletos })}
              </p>
              {/* La firma se menciona en segundo plano: falta el documento es
                  lo urgente, y dos avisos con el mismo peso no se leen. */}
              {sinFirma > 0 ? (
                <p className="mt-0.5 text-xs text-warning/80">
                  {t("avisoTambienSinFirma", { count: sinFirma })}
                </p>
              ) : null}
            </div>
            <span className="whitespace-nowrap text-sm font-semibold text-warning">
              {t("ver")}
            </span>
          </Link>
        ) : sinFirma > 0 && !soloIncompletos ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            {t("soloSinFirma", { count: sinFirma })}
          </p>
        ) : null}

        {/* La búsqueda vive en la barra superior, no aquí: es la misma para
            todo el sistema y tenerla dos veces en pantalla confunde. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterPanel basePath="/reportes" q={params.q} campos={campos} />

          <Link
            href="/reportes/nuevo"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
          >
            {tNav("nuevoReporte")}
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {t("resultado", { count: resultado.total })}
            {soloIncompletos ? t("sinDocumentoSufijo") : ""}
            {params.q ? t("paraQuery", { q: params.q }) : ""}
          </p>
          {hayFiltros ? (
            <Link
              href="/reportes"
              className="text-sm font-medium text-brand hover:underline"
            >
              {t("quitarFiltros")}
            </Link>
          ) : null}
        </div>

        <ReportList items={resultado.items} />

        <Paginacion
          pagina={resultado.pagina}
          totalPaginas={resultado.totalPaginas}
          hrefPara={(p) => construirHref({ pagina: p })}
        />
      </div>
    </AppShell>
  );
}
