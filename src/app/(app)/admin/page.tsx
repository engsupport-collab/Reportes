import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { BarrasVerticales } from "@/components/admin/barras-verticales";
import { GraficaMeses } from "@/components/admin/grafica-meses";
import { StatTile } from "@/components/admin/stat-tile";
import { FiltroEmpresa } from "@/components/reports/filtros";
import { ReportList } from "@/components/reports/report-list";
import { Saludo } from "@/components/saludo";
import { requireAdmin } from "@/lib/auth-guard";
import { inicioDeMes, nombreDeMes } from "@/lib/fechas";
import { type Idioma, REGION } from "@/lib/idiomas";
import { estadoDocumental, serieMensual } from "@/lib/queries/analytics";
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

  const [resumen, ultimos, porMes, estado, t, locale] = await Promise.all([
    obtenerResumen(empresaFiltro),
    // Más de los seis de antes: la lista vive en una tarjeta con scroll
    // propio, así que caben sin empujar nada fuera de la pantalla.
    listarReportes({ companyId: empresaFiltro, porPagina: 20 }),
    serieMensual(empresaFiltro),
    estadoDocumental(empresaFiltro),
    getTranslations("panel"),
    getLocale(),
  ]);
  const region = REGION[locale as Idioma];

  const barrasEstado = [
    { nombre: t("completado"), total: estado.completados, tono: "ok" as const },
    {
      nombre: t("sinDocumento"),
      total: estado.sinDocumento,
      tono: "alerta" as const,
    },
    { nombre: t("sinFirma"), total: estado.sinFirma, tono: "alerta" as const },
    { nombre: t("sinOrden"), total: estado.sinOrden, tono: "alerta" as const },
  ];

  const mesAnterior = nombreDeMes(inicioDeMes(1), region);
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
    : t("lasDosEmpresas");

  return (
    <>
      <Saludo nombreCompleto={user.fullName} />

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
            {hayPendientes ? t("requiereAtencion") : t("todoAlDia")}
          </h2>

          {hayPendientes ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile
                etiqueta={t("sinDocumentoAdjunto")}
                valor={resumen.incompletos}
                tono="alerta"
                nota={t("notaSinDocumento")}
                href={
                  empresaFiltro
                    ? `/admin/reportes?faltantes=1&empresa=${empresaFiltro}`
                    : "/admin/reportes?faltantes=1"
                }
              />
              <StatTile
                etiqueta={t("sinFirmar")}
                valor={resumen.sinFirma}
                tono="alerta"
                nota={t("notaSinFirma")}
                href={
                  empresaFiltro
                    ? `/admin/reportes?sinfirma=1&empresa=${empresaFiltro}`
                    : "/admin/reportes?sinfirma=1"
                }
              />
            </div>
          ) : (
            <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
              {t("sinPendientes")}
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">
            {t("resumenDe", { empresa: nombreVista })}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              etiqueta={t("reportesEsteMes")}
              valor={resumen.reportesDelMes}
              anterior={resumen.reportesMesAnterior}
              periodo={mesAnterior}
              tendencia={resumen.tendencia}
            />
            <StatTile
              etiqueta={t("terminadosEsteMes")}
              valor={resumen.terminadosDelMes}
              anterior={resumen.terminadosMesAnterior}
              periodo={mesAnterior}
            />
            <StatTile
              etiqueta={t("totalHistorico")}
              valor={resumen.totalHistorico}
              nota={t("desdeInicio")}
            />
            <StatTile
              etiqueta={t("empleadosActivos")}
              valor={resumen.empleadosActivos}
              nota={
                empresaFiltro
                  ? t("conAccesoA", { empresa: nombreVista })
                  : t("enCualquieraDeLasDos")
              }
              href="/admin/usuarios"
            />
          </div>
        </section>

        {/* Dos columnas: a la izquierda las dos gráficas apiladas, a la
            derecha los últimos reportes. Sin `items-start`, para que las dos
            columnas midan lo mismo; la tarjeta de estado se estira hasta
            rellenar lo que le sobre a la izquierda y no queda hueco muerto
            entre una gráfica y la otra. */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold text-text">
                {t("reportesPorMes")}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {t("notaReportesPorMes", { empresa: nombreVista })}
              </p>
              <div className="mt-4">
                <GraficaMeses puntos={porMes} />
              </div>
            </section>

            <section className="flex flex-1 flex-col rounded-2xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold text-text">
                {t("estadoReportesTerminados")}
              </h2>
              {/* Se dice explícitamente que no suman: un reporte al que le
                  falten el documento y la firma sale en las dos barras, y sin
                  la aclaración cualquiera intentaría cuadrar los números
                  contra el total y creería que hay un error. */}
              <p className="mt-0.5 text-xs text-muted">{t("notaEstado")}</p>
              <div className="mt-6 min-h-0 flex-1">
                <BarrasVerticales
                  datos={barrasEstado}
                  vacio={t("sinReportesTerminados")}
                />
              </div>
            </section>
          </div>

          {/* Tarjeta acotada, no una columna de alto completo: se ven unos tres
              reportes y el resto se alcanza con el scroll de dentro. Así la
              lista no marca la altura de todo el panel. */}
          <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text">
                {t("ultimosReportes")}
              </h2>
              <Link
                href={empresaFiltro ? `/admin/reportes?empresa=${empresaFiltro}` : "/admin/reportes"}
                className="text-sm font-medium text-brand hover:underline"
              >
                {t("verTodos")}
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
    </>
  );
}
