import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { NuevoReporteSelector } from "@/components/reports/nuevo-reporte-selector";
import type { OpcionCotizacionSelector } from "@/components/reports/quote-selector";
import { crearReporteAction, crearReporteViaticoAction } from "@/actions/reports";
import { requireAccesoReportes } from "@/lib/auth-guard";
import { formatFechaLarga, aValorInput } from "@/lib/fechas";
import { listarCotizacionesActivas } from "@/lib/queries/quotes";
import { listarReportesServicioParaEnlazar } from "@/lib/queries/reports";

type Params = {
  searchParams: Promise<{ companyId?: string; quoteId?: string }>;
};

/**
 * Crear reporte. Página compartida por las dos vistas.
 *
 * El empleado crea siempre dentro de su empresa activa, sin elegir nada. El
 * admin no tiene empresa activa —ve las dos siempre— así que aquí es donde
 * elige explícitamente, una vez por reporte, para cuál de las dos es.
 *
 * `companyId`/`quoteId` en la URL vienen del botón "Crear reporte con esta
 * cotización" en el detalle de una cotización: sin ellos, el admin cae en la
 * primera empresa de la lista por defecto, que puede no ser la de la
 * cotización que acaba de abrir, y el selector la muestra vacía.
 */
export default async function NuevoReportePage({ searchParams }: Params) {
  const user = await requireAccesoReportes();
  const [{ companyId: companyIdParam, quoteId: quoteIdParam }, t, tSelector] =
    await Promise.all([
      searchParams,
      getTranslations("nuevoReportePage"),
      getTranslations("quoteSelector"),
    ]);

  // Las cotizaciones activas y los reportes de servicio disponibles para
  // enlazar se traen para todas las empresas del usuario de una vez: son
  // pocos (una empresa entera, no todo el sistema), y así los selectores no
  // necesitan pedir datos al servidor cada vez que el admin cambia de empresa.
  const empresas = user.role === "admin" ? user.empresas : [user.empresaActiva];

  // Solo tiene sentido para el admin: un empleado ya está fijo en su propia
  // empresa, así que un companyId distinto en la URL no le sirve de nada.
  const companyIdInicial =
    user.role === "admin" &&
    companyIdParam &&
    empresas.some((e) => e.id === companyIdParam)
      ? companyIdParam
      : undefined;

  const [cotizacionesPorEmpresa, reportesPorEmpresa] = await Promise.all([
    Promise.all(
      empresas.map(async (e) => ({
        companyId: e.id,
        opciones: (await listarCotizacionesActivas(e.id)).map(
          (c): OpcionCotizacionSelector => ({
            id: c.id,
            label: c.quoteNumber
              ? `${c.quoteNumber} — ${c.projectName} — ${c.clientName}`
              : `${c.projectName} — ${c.clientName}`,
            clientName: c.clientName,
            purchaseOrderLabel: c.purchaseOrderNo ?? tSelector("sinAsignar"),
            dueDateLabel: c.dueDate
              ? formatFechaLarga(c.dueDate)
              : tSelector("sinFecha"),
          }),
        ),
      })),
    ),
    Promise.all(
      empresas.map(async (e) => ({
        companyId: e.id,
        opciones: (await listarReportesServicioParaEnlazar(e.id)).map((r) => ({
          id: r.id,
          label: `${r.projectName} — ${r.clientName} (${formatFechaLarga(r.workDate)})`,
        })),
      })),
    ),
  ]);

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text">{t("titulo")}</h2>
          <p className="mt-1 text-sm text-muted">{t("subtitulo")}</p>
        </div>

        <NuevoReporteSelector
          accionServicio={crearReporteAction}
          accionViatico={crearReporteViaticoAction}
          cancelarHref={user.role === "admin" ? "/admin/reportes" : "/reportes"}
          empresas={user.role === "admin" ? user.empresas : undefined}
          companyIdFijo={
            user.role === "admin" ? companyIdInicial : user.empresaActiva.id
          }
          cotizacionesPorEmpresa={cotizacionesPorEmpresa}
          reportesPorEmpresa={reportesPorEmpresa}
          // Se propone la fecha de hoy: el reporte se escribe casi siempre el
          // mismo día del trabajo, y así es un campo menos que llenar.
          valoresServicio={{
            // Solo se preselecciona si la empresa también quedó fijada: un
            // quoteId de otra empresa que la elegida por defecto no
            // aparecería en su lista y quedaría un id colgado sin efecto.
            quoteId: companyIdInicial ? (quoteIdParam ?? "") : "",
            workDate: aValorInput(new Date()),
            serviceType: "",
            etiquetas: [],
            details: "",
          }}
        />
      </div>
    </AppShell>
  );
}
