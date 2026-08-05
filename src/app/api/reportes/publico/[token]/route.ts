import { NextResponse } from "next/server";

import { verificarEnlacePublico } from "@/lib/enlace-firma";
import { generarReportePdf, generarReporteViaticoPdf } from "@/lib/pdf";
import { listarAdjuntosParaPdf } from "@/lib/queries/attachments";
import { obtenerReporte } from "@/lib/queries/reports";
import { listarViaticosParaPdf } from "@/lib/queries/viaticos";

/**
 * PDF de un reporte, para quien lo firmó, sin sesión.
 *
 * El token es la única credencial: firmado con el mismo secreto que las
 * cookies de sesión, con expiración y con un `purpose` propio que impide
 * reutilizar un token de otro fin. No hay usuario ni permiso que comprobar
 * más allá de que el token sea válido — para eso se emitió, al firmar.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const reportId = await verificarEnlacePublico(token);

  if (!reportId) {
    return NextResponse.json({ error: "Enlace inválido o vencido" }, { status: 404 });
  }

  const reporte = await obtenerReporte(reportId);
  if (!reporte) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 404 });
  }

  const pdf =
    reporte.type === "viaticos"
      ? await (async () => {
          const gastos = await listarViaticosParaPdf(reportId);
          return generarReporteViaticoPdf(reporte, gastos);
        })()
      : await (async () => {
          const adjuntos = await listarAdjuntosParaPdf(reportId);
          return generarReportePdf(reporte, adjuntos);
        })();

  const nombreArchivo = `reporte-${reporte.projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreArchivo}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
