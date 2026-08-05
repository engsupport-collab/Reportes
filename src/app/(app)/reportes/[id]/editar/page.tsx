import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { actualizarReporteAction } from "@/actions/reports";
import { AppShell } from "@/components/app-shell";
import { ReportForm } from "@/components/reports/report-form";
import type { OpcionCotizacionSelector } from "@/components/reports/quote-selector";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { aValorInput, formatFechaLarga } from "@/lib/fechas";
import { listarClientesActivos } from "@/lib/queries/clients";
import { listarCotizacionesActivas, obtenerCotizacion } from "@/lib/queries/quotes";
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

  const [t, tSelector] = await Promise.all([
    getTranslations("editarReportePage"),
    getTranslations("quoteSelector"),
  ]);

  function aOpcion(c: {
    id: string;
    quoteNumber: string | null;
    projectName: string;
    clientName: string;
    purchaseOrderNo: string | null;
    dueDate: Date | null;
  }): OpcionCotizacionSelector {
    return {
      id: c.id,
      label: c.quoteNumber
        ? `${c.quoteNumber} — ${c.projectName} — ${c.clientName}`
        : `${c.projectName} — ${c.clientName}`,
      clientName: c.clientName,
      purchaseOrderLabel: c.purchaseOrderNo ?? tSelector("sinAsignar"),
      dueDateLabel: c.dueDate ? formatFechaLarga(c.dueDate) : tSelector("sinFecha"),
    };
  }

  const [activas, clientesActivos] = await Promise.all([
    listarCotizacionesActivas(reporte.companyId),
    listarClientesActivos(reporte.companyId),
  ]);
  const opciones = activas.map(aOpcion);

  // La cotización actual del reporte puede ya no estar activa (el trabajo
  // terminó, por ejemplo). Se agrega igual a la lista para que el formulario
  // no la cambie por otra sin que nadie lo haya pedido — ver la nota en
  // `actualizarReporteAction` sobre por qué editar no exige que siga activa.
  if (reporte.quoteId && !opciones.some((o) => o.id === reporte.quoteId)) {
    const actual = await obtenerCotizacion(reporte.quoteId);
    if (actual) opciones.push(aOpcion(actual));
  }

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
            companyIdFijo={reporte.companyId}
            cotizacionesPorEmpresa={[{ companyId: reporte.companyId, opciones }]}
            clientesPorEmpresa={[
              { companyId: reporte.companyId, opciones: clientesActivos },
            ]}
            valores={{
              quoteId: reporte.quoteId ?? "",
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
