import { NextResponse } from "next/server";

import { getCurrentUser, puedeAccederAReporte } from "@/lib/auth-guard";
import { generarReportePdf } from "@/lib/pdf";
import { listarAdjuntosParaPdf } from "@/lib/queries/attachments";
import { obtenerReporte } from "@/lib/queries/reports";
import { listarViaticosParaPdf } from "@/lib/queries/viaticos";

/**
 * PDF descargable del reporte completo. Se arma en el momento a partir de los
 * datos actuales — no se guarda una copia — así que siempre coincide con lo
 * que muestra el sistema. Ver PLAN.md, "Pendiente A".
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const reporte = await obtenerReporte(id);

  if (!reporte || !puedeAccederAReporte(user, reporte)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 404 });
  }

  const [viaticos, adjuntos] = await Promise.all([
    listarViaticosParaPdf(id),
    listarAdjuntosParaPdf(id),
  ]);

  const pdf = await generarReportePdf(reporte, viaticos, adjuntos);

  const nombreArchivo = `reporte-${reporte.projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
