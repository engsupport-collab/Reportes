import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { actualizarReporteAction } from "@/actions/reports";
import { AppShell } from "@/components/app-shell";
import { ReportForm } from "@/components/reports/report-form";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { aValorInput } from "@/lib/fechas";
import { obtenerReporte } from "@/lib/queries/reports";

type Params = { params: Promise<{ id: string }> };

export default async function EditarReportePage({ params }: Params) {
  const user = await requireAccesoReportes();
  const { id } = await params;

  const reporte = await obtenerReporte(id);

  // Un reporte de viáticos no tiene este formulario: sus únicos datos
  // editables son las líneas de gasto, que se agregan y borran desde su
  // propio detalle.
  if (!reporte || !puedeAccederAReporte(user, reporte) || reporte.type !== "servicio") {
    notFound();
  }

  const t = await getTranslations("editarReportePage");

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/reportes/${reporte.id}`}
          className="mb-5 inline-block text-sm font-medium text-muted transition hover:text-text"
        >
          {t("volver")}
        </Link>

        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text">{t("titulo")}</h2>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <ReportForm
            // El id se fija en el servidor al enlazar la acción; no viaja en el
            // formulario, así que no se puede cambiar desde el navegador para
            // editar otro reporte.
            action={actualizarReporteAction.bind(null, reporte.id)}
            etiqueta={t("guardarCambios")}
            cancelarHref={`/reportes/${reporte.id}`}
            valores={{
              projectName: reporte.projectName,
              // null se convierte en "" para el input: un campo vacío es como
              // se representa "sin valor todavía" en un formulario.
              purchaseOrderNo: reporte.purchaseOrderNo ?? "",
              quoteNumber: reporte.quoteNumber ?? "",
              clientName: reporte.clientName,
              workDate: aValorInput(reporte.workDate),
              serviceType: reporte.serviceType ?? "",
              etiquetas: reporte.etiquetas,
              details: reporte.details ?? "",
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
