import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import {
  FilterPanel,
  type CampoFiltro,
} from "@/components/reports/filter-panel";
import { Paginacion, ReportList } from "@/components/reports/report-list";
import { requireAdmin } from "@/lib/auth-guard";
import { empleadosDeEmpresa } from "@/lib/queries/dashboard";
import {
  ETIQUETAS_TRABAJO,
  TIPOS_SERVICIO,
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
    sinorden?: string;
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
  const soloSinOrden = params.sinorden === "1";

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
    soloSinOrden,
    serviceType: servicio,
    etiqueta,
    pagina: Number(params.pagina) || 1,
  });

  function construirHref(cambios: {
    q?: string | null;
    pagina?: number | null;
    faltantes?: boolean | null;
    sinfirma?: boolean | null;
    sinorden?: boolean | null;
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

    const sinOrdenNuevo =
      cambios.sinorden === undefined ? soloSinOrden : cambios.sinorden;
    if (sinOrdenNuevo) sp.set("sinorden", "1");

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
      soloSinOrden ||
      servicio ||
      etiqueta ||
      empleadoId ||
      empresaFiltro,
  );

  const campos: CampoFiltro[] = [
    {
      tipo: "select",
      name: "empresa",
      label: "Empresa",
      valor: empresaFiltro ?? "",
      vacio: "Todas",
      opciones: user.empresas.map((e) => ({ value: e.id, label: e.name })),
    },
    {
      tipo: "select",
      name: "empleado",
      label: "Empleado",
      valor: empleadoId ?? "",
      vacio: "Todos",
      opciones: empleados.map((e) => ({ value: e.id, label: e.fullName })),
    },
    {
      tipo: "select",
      name: "servicio",
      label: "Tipo de servicio",
      valor: servicio ?? "",
      vacio: "Todos",
      opciones: TIPOS_SERVICIO.map((t) => ({ value: t.id, label: t.label })),
    },
    {
      tipo: "select",
      name: "etiqueta",
      label: "Etiqueta",
      valor: etiqueta ?? "",
      vacio: "Todas",
      opciones: ETIQUETAS_TRABAJO.map((e) => ({
        value: e.id,
        label: e.label,
      })),
    },
    {
      tipo: "checkbox",
      name: "faltantes",
      label: "Sin documento",
      activo: soloIncompletos,
    },
    {
      tipo: "checkbox",
      name: "sinfirma",
      label: "Sin firmar",
      activo: soloSinFirma,
    },
    {
      tipo: "checkbox",
      name: "sinorden",
      label: "Sin orden",
      activo: soloSinOrden,
    },
  ];

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        {/* La búsqueda vive en la barra superior, no aquí: es la misma para
            todo el sistema y tenerla dos veces en pantalla confunde. */}
        <FilterPanel basePath="/admin/reportes" q={params.q} campos={campos} />

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
