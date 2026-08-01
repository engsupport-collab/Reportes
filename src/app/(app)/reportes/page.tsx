import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { FiltrosClasificacion } from "@/components/reports/filtros";
import { Paginacion, ReportList } from "@/components/reports/report-list";
import { requireAccesoReportes } from "@/lib/auth-guard";
import {
  TIPOS_SERVICIO_IDS,
  type TipoServicio,
  esEtiquetaValida,
} from "@/lib/etiquetas";
import {
  contarIncompletos,
  contarSinFirma,
  listarReportesDeEmpleado,
} from "@/lib/queries/reports";

type Params = {
  searchParams: Promise<{
    q?: string;
    pagina?: string;
    faltantes?: string;
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

  const soloIncompletos = params.faltantes === "1";
  const companyId = user.empresaActiva.id;

  // Los valores que llegan por URL se validan contra el catálogo antes de usarse.
  const servicio = TIPOS_SERVICIO_IDS.includes(params.servicio as TipoServicio)
    ? (params.servicio as TipoServicio)
    : undefined;
  const etiqueta =
    params.etiqueta && esEtiquetaValida(params.etiqueta)
      ? params.etiqueta
      : undefined;

  const [resultado, incompletos, sinFirma] = await Promise.all([
    listarReportesDeEmpleado(companyId, {
      authorId: user.id,
      buscar: params.q,
      soloIncompletos,
      serviceType: servicio,
      etiqueta,
      pagina: Number(params.pagina) || 1,
    }),
    contarIncompletos(companyId, user.id),
    contarSinFirma(companyId, user.id),
  ]);

  /** Construye una URL conservando los filtros vigentes. */
  function construirHref(cambios: {
    q?: string | null;
    pagina?: number | null;
    faltantes?: boolean;
    serviceType?: string | null;
    etiqueta?: string | null;
  }) {
    const sp = new URLSearchParams();

    const q = cambios.q === undefined ? params.q : (cambios.q ?? undefined);
    if (q) sp.set("q", q);

    const faltantesNuevo = cambios.faltantes ?? soloIncompletos;
    if (faltantesNuevo) sp.set("faltantes", "1");

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
    params.q || soloIncompletos || servicio || etiqueta,
  );

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
                {incompletos === 1
                  ? "1 reporte terminado sin documento adjunto"
                  : `${incompletos} reportes terminados sin documento adjunto`}
              </p>
              {/* La firma se menciona en segundo plano: falta el documento es
                  lo urgente, y dos avisos con el mismo peso no se leen. */}
              {sinFirma > 0 ? (
                <p className="mt-0.5 text-xs text-warning/80">
                  {sinFirma === 1
                    ? "También hay 1 reporte terminado sin firmar"
                    : `También hay ${sinFirma} reportes terminados sin firmar`}
                </p>
              ) : null}
            </div>
            <span className="whitespace-nowrap text-sm font-semibold text-warning">
              Ver →
            </span>
          </Link>
        ) : sinFirma > 0 && !soloIncompletos ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            {sinFirma === 1
              ? "1 reporte terminado está sin firmar."
              : `${sinFirma} reportes terminados están sin firmar.`}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <form action="/reportes" className="flex flex-1 gap-2">
            {soloIncompletos ? (
              <input type="hidden" name="faltantes" value="1" />
            ) : null}
            {servicio ? (
              <input type="hidden" name="servicio" value={servicio} />
            ) : null}
            {etiqueta ? (
              <input type="hidden" name="etiqueta" value={etiqueta} />
            ) : null}
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Buscar por proyecto, cliente u orden de compra"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
            >
              Buscar
            </button>
          </form>

          <Link
            href="/reportes/nuevo"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
          >
            Nuevo reporte
          </Link>
        </div>

        <FiltrosClasificacion
          serviceType={servicio}
          etiqueta={etiqueta}
          hrefPara={construirHref}
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {resultado.total} {resultado.total === 1 ? "reporte" : "reportes"}
            {soloIncompletos ? " sin documento" : ""}
            {params.q ? ` para “${params.q}”` : ""}
          </p>
          {hayFiltros ? (
            <Link
              href="/reportes"
              className="text-sm font-medium text-brand hover:underline"
            >
              Quitar filtros
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
