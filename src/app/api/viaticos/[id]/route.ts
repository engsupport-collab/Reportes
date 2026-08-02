import { type NextRequest, NextResponse } from "next/server";

import { esImagen } from "@/lib/archivos";
import { getCurrentUser, puedeAccederAReporte } from "@/lib/auth-guard";
import { obtenerViaticoConDueno } from "@/lib/queries/viaticos";
import { leerArchivo } from "@/lib/storage";

/**
 * Descarga de la foto/archivo de un viático. Misma lógica que
 * /api/archivos/[id]: la URL real del almacenamiento nunca se entrega al
 * navegador, y se verifica acceso al reporte antes de servir nada.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const viatico = await obtenerViaticoConDueno(id);

  if (!viatico) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (!puedeAccederAReporte(user, viatico)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const quiereMiniatura = request.nextUrl.searchParams.get("mini") === "1";
  const referencia =
    quiereMiniatura && viatico.thumbnailUrl
      ? viatico.thumbnailUrl
      : viatico.blobUrl;

  const datos = await leerArchivo(referencia);
  if (!datos) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const contentType =
    quiereMiniatura && viatico.thumbnailUrl ? "image/webp" : viatico.mimeType;

  const enLinea = esImagen(contentType) || contentType === "application/pdf";

  return new NextResponse(datos, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename="${encodeURIComponent(viatico.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
