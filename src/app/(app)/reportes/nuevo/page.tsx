import { AppShell } from "@/components/app-shell";
import { ReportForm } from "@/components/reports/report-form";
import { crearReporteAction } from "@/actions/reports";
import { requireAccesoReportes } from "@/lib/auth-guard";
import { aValorInput } from "@/lib/fechas";

/**
 * Crear reporte. Página compartida por las dos vistas.
 *
 * El empleado crea siempre dentro de su empresa activa, sin elegir nada. El
 * admin no tiene empresa activa —ve las dos siempre— así que aquí es donde
 * elige explícitamente, una vez por reporte, para cuál de las dos es.
 */
export default async function NuevoReportePage() {
  const user = await requireAccesoReportes();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text">Nuevo reporte</h2>
          <p className="mt-1 text-sm text-muted">
            Registra el trabajo terminado. Los archivos y la firma se agregan
            después, desde el detalle del reporte.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <ReportForm
            action={crearReporteAction}
            etiqueta="Crear reporte"
            cancelarHref={user.role === "admin" ? "/admin/reportes" : "/reportes"}
            empresas={user.role === "admin" ? user.empresas : undefined}
            // Se propone la fecha de hoy: el reporte se escribe casi siempre el
            // mismo día del trabajo, y así es un campo menos que llenar.
            valores={{
              projectName: "",
              purchaseOrderNo: "",
              clientName: "",
              workDate: aValorInput(new Date()),
              serviceType: "",
              etiquetas: [],
              details: "",
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
