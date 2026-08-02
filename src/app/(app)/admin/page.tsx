import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { GraficaMeses } from "@/components/admin/grafica-meses";
import { StatTile } from "@/components/admin/stat-tile";
import { FiltroEmpresa } from "@/components/reports/filtros";
import { ReportList } from "@/components/reports/report-list";
import { requireAdmin } from "@/lib/auth-guard";
import { inicioDeMes, nombreDeMes } from "@/lib/fechas";
import { serieMensual } from "@/lib/queries/analytics";
import { obtenerResumen } from "@/lib/queries/dashboard";
import { listarReportes } from "@/lib/queries/reports";

type Params = { searchParams: Promise<{ empresa?: string }> };

/**
 * Vista Master: panel del administrador.
 *
 * El admin no elige empresa al iniciar sesión: ve las dos por defecto, siempre,
 * y puede acotar a una con el filtro de arriba si lo necesita. Es una elección
 * de la URL (`?empresa=`), no del estado de sesión — cambia de una carga a
 * otra sin afectar nada más.
 *
 * Lo primero que se ve son las alertas, no los totales. Un panel que empieza
 * por "347 reportes" informa; uno que empieza por "3 sin documento" señala qué
 * hay que hacer hoy. El requireAdmin() es la segunda barrera de acceso, después
 * del proxy, y la que de verdad protege los datos.
 */
export default async function AdminPage({ searchParams }: Params) {
  const user = await requireAdmin();
  const params = await searchParams;

  // El valor de la URL se valida contra las empresas reales: un parámetro
  // inventado no debe colar como si fuera un filtro válido.
  const empresaFiltro = user.empresas.find((e) => e.id === params.empresa)?.id;

  const [resumen, ultimos, porMes] = await Promise.all([
    obtenerResumen(empresaFiltro),
    // Más de los seis de antes: la lista vive en una tarjeta con scroll
    // propio, así que caben sin empujar nada fuera de la pantalla.
    listarReportes({ companyId: empresaFiltro, porPagina: 20 }),
    serieMensual(empresaFiltro),
  ]);

  const mesAnterior = nombreDeMes(inicioDeMes(1));
  const hayPendientes = resumen.incompletos > 0 || resumen.sinFirma > 0;

  const hrefPara = (cambios: { empresa?: string | null }) => {
    const sp = new URLSearchParams();
    const nuevaEmpresa =
      cambios.empresa === undefined ? empresaFiltro : (cambios.empresa ?? undefined);
    if (nuevaEmpresa) sp.set("empresa", nuevaEmpresa);
    const query = sp.toString();
    return query ? `/admin?${query}` : "/admin";
  };

  const nombreVista = empresaFiltro
    ? user.empresas.find((e) => e.id === empresaFiltro)!.name
    : "las dos empresas";

  return (
    <AppShell user={user}>
      <FiltroEmpresa
        empresas={user.empresas}
        empresaId={empresaFiltro}
        hrefPara={hrefPara}
      />

      {/* Las cifras van a todo el ancho, arriba; debajo, el contenido en dos
          columnas. Antes los totales vivían apretados en media pantalla
          mientras la lista de reportes ocupaba una columna entera de alto
          completo, que era justo al revés de su importancia. */}
      <div className="mt-8 space-y-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">
            {hayPendientes ? "Requiere atención" : "Todo al día"}
          </h2>

          {hayPendientes ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile
                etiqueta="Sin documento adjunto"
                valor={resumen.incompletos}
                tono="alerta"
                nota="Reportes terminados a los que falta el archivo"
                href={
                  empresaFiltro
                    ? `/admin/reportes?faltantes=1&empresa=${empresaFiltro}`
                    : "/admin/reportes?faltantes=1"
                }
              />
              <StatTile
                etiqueta="Sin firmar"
                valor={resumen.sinFirma}
                tono="alerta"
                nota="Reportes terminados que nadie ha firmado"
                href={
                  empresaFiltro
                    ? `/admin/reportes?sinfirma=1&empresa=${empresaFiltro}`
                    : "/admin/reportes?sinfirma=1"
                }
              />
            </div>
          ) : (
            <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
              No hay reportes terminados a los que les falte el documento o la
              firma.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">
            Resumen de {nombreVista}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              etiqueta="Reportes este mes"
              valor={resumen.reportesDelMes}
              anterior={resumen.reportesMesAnterior}
              periodo={mesAnterior}
              tendencia={resumen.tendencia}
            />
            <StatTile
              etiqueta="Terminados este mes"
              valor={resumen.terminadosDelMes}
              anterior={resumen.terminadosMesAnterior}
              periodo={mesAnterior}
            />
            <StatTile
              etiqueta="Total histórico"
              valor={resumen.totalHistorico}
              nota="Desde el inicio del sistema"
            />
            <StatTile
              etiqueta="Empleados activos"
              valor={resumen.empleadosActivos}
              nota={
                empresaFiltro ? `Con acceso a ${nombreVista}` : "En cualquiera de las dos empresas"
              }
              href="/admin/usuarios"
            />
          </div>
        </section>

        {/* Abajo, dos columnas: la gráfica ocupa el ancho porque es lo que se
            lee de un vistazo, y los últimos reportes van al lado en una
            tarjeta acotada. */}
        {/* items-start para que cada tarjeta mida lo que necesite: si se
            estiraran a la misma altura, la de la gráfica quedaría con un
            hueco vacío debajo del dibujo. */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="min-w-0 rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-text">Reportes por mes</h2>
            <p className="mt-0.5 text-xs text-muted">
              Últimos 12 meses de {nombreVista}. El mes actual va empezado, por
              eso su tramo aparece punteado.
            </p>
            <div className="mt-4">
              <GraficaMeses puntos={porMes} />
            </div>
          </section>

          {/* Tarjeta acotada, no una columna de alto completo: se ven unos tres
              reportes y el resto se alcanza con el scroll de dentro. Así la
              lista no marca la altura de todo el panel. */}
          <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text">
                Últimos reportes
              </h2>
              <Link
                href={empresaFiltro ? `/admin/reportes?empresa=${empresaFiltro}` : "/admin/reportes"}
                className="text-sm font-medium text-brand hover:underline"
              >
                Ver todos
              </Link>
            </div>

            {/* Sin baseHref propio: el detalle de un reporte es la misma página
                para empleado y admin. `puedeAccederAReporte` ya deja pasar al
                admin, así que duplicar la ruta solo duplicaría el sitio donde
                equivocarse con los permisos. */}
            <div className="max-h-[38rem] overflow-y-auto p-3">
              <ReportList
                items={ultimos.items}
                mostrarAutor
                mostrarEmpresa={!empresaFiltro}
                unaColumna
              />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
