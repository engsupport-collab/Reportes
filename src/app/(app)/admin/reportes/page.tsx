import Link from "next/link";

import { FilterChip, FilterGroupLabel } from "@/components/filter-chip";
import { AppShell } from "@/components/app-shell";
import { FiltroEmpresa, FiltrosClasificacion } from "@/components/reports/filtros";
import { Paginacion, ReportList } from "@/components/reports/report-list";
import { requireAdmin } from "@/lib/auth-guard";
import { empleadosDeEmpresa } from "@/lib/queries/dashboard";
import {
  TIPOS_SERVICIO_IDS,
  type TipoServicio,
  esEtiquetaValida,
} from "@/lib/etiquetas";
import { listarReportes } from "@/lib/queries/reports";

type Params = {
  searchParams: Promise<{
    q?: string;
    pagina?: string;
    faltantes?: string;
    sinfirma?: string;
    servicio?: string;
    etiqueta?: string;
    empleado?: string;
    empresa?: string;
  }>;
};

/**
 * Vista Master: todos los reportes, con búsqueda y filtros. Es la única
 * pantalla del sistema que muestra reportes de más de un autor a la vez — y,
 * por defecto, de las dos empresas mezcladas — por eso vive bajo /admin,
 * protegida por requireAdmin().
 *
 * "Todas" no es una empresa más: es la ausencia de filtro, y es el estado con
 * el que se abre esta pantalla siempre. El admin acota a una empresa cuando lo
 * necesita, no al revés.
 */
export default async function AdminReportesPage({ searchParams }: Params) {
  const user = await requireAdmin();
  const params = await searchParams;

  const empresaFiltro = user.empresas.find((e) => e.id === params.empresa)?.id;

  const soloIncompletos = params.faltantes === "1";
  const soloSinFirma = params.sinfirma === "1";

  const servicio = TIPOS_SERVICIO_IDS.includes(params.servicio as TipoServicio)
    ? (params.servicio as TipoServicio)
    : undefined;
  const etiqueta =
    params.etiqueta && esEtiquetaValida(params.etiqueta)
      ? params.etiqueta
      : undefined;

  // El filtro de empleado se recalcula según la empresa elegida: alguien de
  // Corp no tiene sentido como opción cuando se está mirando solo SaaS.
  const empleados = await empleadosDeEmpresa(empresaFiltro);
  const empleadoId = empleados.some((e) => e.id === params.empleado)
    ? params.empleado
    : undefined;

  const resultado = await listarReportes({
    companyId: empresaFiltro,
    authorId: empleadoId,
    buscar: params.q,
    soloIncompletos,
    soloSinFirma,
    serviceType: servicio,
    etiqueta,
    pagina: Number(params.pagina) || 1,
  });

  function construirHref(cambios: {
    q?: string | null;
    pagina?: number | null;
    faltantes?: boolean | null;
    sinfirma?: boolean | null;
    serviceType?: string | null;
    etiqueta?: string | null;
    empleado?: string | null;
    empresa?: string | null;
  }) {
    const sp = new URLSearchParams();

    const q = cambios.q === undefined ? params.q : (cambios.q ?? undefined);
    if (q) sp.set("q", q);

    const faltantesNuevo =
      cambios.faltantes === undefined ? soloIncompletos : cambios.faltantes;
    if (faltantesNuevo) sp.set("faltantes", "1");

    const sinFirmaNuevo =
      cambios.sinfirma === undefined ? soloSinFirma : cambios.sinfirma;
    if (sinFirmaNuevo) sp.set("sinfirma", "1");

    const servicioNuevo =
      cambios.serviceType === undefined
        ? servicio
        : (cambios.serviceType ?? undefined);
    if (servicioNuevo) sp.set("servicio", servicioNuevo);

    const etiquetaNueva =
      cambios.etiqueta === undefined ? etiqueta : (cambios.etiqueta ?? undefined);
    if (etiquetaNueva) sp.set("etiqueta", etiquetaNueva);

    const empresaNueva =
      cambios.empresa === undefined ? empresaFiltro : (cambios.empresa ?? undefined);
    if (empresaNueva) sp.set("empresa", empresaNueva);

    // Al cambiar de empresa, el empleado elegido puede no existir en la otra:
    // se descarta salvo que el propio cambio sea de empleado.
    const empleadoNuevo =
      cambios.empleado === undefined
        ? cambios.empresa === undefined
          ? empleadoId
          : undefined
        : (cambios.empleado ?? undefined);
    if (empleadoNuevo) sp.set("empleado", empleadoNuevo);

    if (cambios.pagina && cambios.pagina > 1) {
      sp.set("pagina", String(cambios.pagina));
    }

    const query = sp.toString();
    return query ? `/admin/reportes?${query}` : "/admin/reportes";
  }

  const hayFiltros = Boolean(
    params.q ||
      soloIncompletos ||
      soloSinFirma ||
      servicio ||
      etiqueta ||
      empleadoId ||
      empresaFiltro,
  );

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        <FiltroEmpresa
          empresas={user.empresas}
          empresaId={empresaFiltro}
          hrefPara={construirHref}
        />

        <div className="flex flex-wrap items-center gap-3">
          <form action="/admin/reportes" className="flex flex-1 gap-2">
            {soloIncompletos ? (
              <input type="hidden" name="faltantes" value="1" />
            ) : null}
            {soloSinFirma ? (
              <input type="hidden" name="sinfirma" value="1" />
            ) : null}
            {servicio ? (
              <input type="hidden" name="servicio" value={servicio} />
            ) : null}
            {etiqueta ? (
              <input type="hidden" name="etiqueta" value={etiqueta} />
            ) : null}
            {empleadoId ? (
              <input type="hidden" name="empleado" value={empleadoId} />
            ) : null}
            {empresaFiltro ? (
              <input type="hidden" name="empresa" value={empresaFiltro} />
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
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FilterGroupLabel>Empleado</FilterGroupLabel>
            <FilterChip href={construirHref({ empleado: null })} activo={!empleadoId}>
              Todos
            </FilterChip>
            {empleados.map((e) => (
              <FilterChip
                key={e.id}
                href={construirHref({ empleado: empleadoId === e.id ? null : e.id })}
                activo={empleadoId === e.id}
              >
                {e.fullName}
              </FilterChip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterGroupLabel>Faltantes</FilterGroupLabel>
            <FilterChip
              href={construirHref({ faltantes: !soloIncompletos })}
              activo={soloIncompletos}
            >
              Sin documento
            </FilterChip>
            <FilterChip
              href={construirHref({ sinfirma: !soloSinFirma })}
              activo={soloSinFirma}
            >
              Sin firmar
            </FilterChip>
          </div>
        </div>

        <FiltrosClasificacion
          serviceType={servicio}
          etiqueta={etiqueta}
          hrefPara={construirHref}
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {resultado.total} {resultado.total === 1 ? "reporte" : "reportes"}
            {params.q ? ` para “${params.q}”` : ""}
          </p>
          {hayFiltros ? (
            <Link
              href="/admin/reportes"
              className="text-sm font-medium text-brand hover:underline"
            >
              Quitar filtros
            </Link>
          ) : null}
        </div>

        <ReportList
          items={resultado.items}
          mostrarAutor
          mostrarEmpresa={!empresaFiltro}
        />

        <Paginacion
          pagina={resultado.pagina}
          totalPaginas={resultado.totalPaginas}
          hrefPara={(p) => construirHref({ pagina: p })}
        />
      </div>
    </AppShell>
  );
}
