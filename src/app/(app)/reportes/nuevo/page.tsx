import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { NuevoReporteSelector } from "@/components/reports/nuevo-reporte-selector";
import { crearReporteAction, crearReporteViaticoAction } from "@/actions/reports";
import { requireAccesoReportes } from "@/lib/auth-guard";
import { formatFechaLarga, aValorInput } from "@/lib/fechas";
import { listarReportesServicioParaEnlazar } from "@/lib/queries/reports";

/**
 * Crear reporte. Página compartida por las dos vistas.
 *
 * El empleado crea siempre dentro de su empresa activa, sin elegir nada. El
 * admin no tiene empresa activa —ve las dos siempre— así que aquí es donde
 * elige explícitamente, una vez por reporte, para cuál de las dos es.
 */
export default async function NuevoReportePage() {
  const user = await requireAccesoReportes();
  const t = await getTranslations("nuevoReportePage");

  // Los reportes de servicio disponibles para enlazar se traen para todas las
  // empresas del usuario de una vez: son pocos (una empresa entera, no todo
  // el sistema), y así el selector de "reporte de viáticos" no necesita pedir
  // datos al servidor cada vez que el admin cambia de empresa.
  const empresas = user.role === "admin" ? user.empresas : [user.empresaActiva];
  const reportesPorEmpresa = await Promise.all(
    empresas.map(async (e) => ({
      companyId: e.id,
      opciones: (await listarReportesServicioParaEnlazar(e.id)).map((r) => ({
        id: r.id,
        label: `${r.projectName} — ${r.clientName} (${formatFechaLarga(r.workDate)})`,
      })),
    })),
  );

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
          reportesPorEmpresa={reportesPorEmpresa}
          // Se propone la fecha de hoy: el reporte se escribe casi siempre el
          // mismo día del trabajo, y así es un campo menos que llenar.
          valoresServicio={{
            projectName: "",
            purchaseOrderNo: "",
            quoteNumber: "",
            clientName: "",
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
