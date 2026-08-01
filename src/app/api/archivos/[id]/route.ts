import { type NextRequest, NextResponse } from "next/server";

import { esImagen } from "@/lib/archivos";
import { getCurrentUser, puedeAccederAReporte } from "@/lib/auth-guard";
import { obtenerAdjuntoConDueno } from "@/lib/queries/attachments";
import { leerArchivo } from "@/lib/storage";

/**
 * Descarga de un archivo adjunto.
 *
 * Todo archivo pasa por aquí. La URL real del almacenamiento nunca se entrega
 * al navegador: si se entregara, ese enlace funcionaría para cualquiera que lo
 * tuviera, sin sesión y para siempre. Aquí se comprueba primero quién pide y si
 * tiene derecho a ese reporte.
 *
 * Esta ruta queda fuera del middleware a propósito: necesita responder 401 y
 * 403, no redirigir a una página de login.
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
  const adjunto = await obtenerAdjuntoConDueno(id);

  if (!adjunto) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // Un empleado solo alcanza los archivos de sus propios reportes, y solo de
  // su empresa activa. El admin siempre pasa, de cualquier empresa: es la
  // esencia del rol, y `puedeAccederAReporte` ya lo resuelve — por eso se le
  // pasa `user` tal cual, sin exigirle una empresa que un admin nunca tiene.
  if (!puedeAccederAReporte(user, adjunto)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const quiereMiniatura = request.nextUrl.searchParams.get("mini") === "1";
  const referencia =
    quiereMiniatura && adjunto.thumbnailUrl
      ? adjunto.thumbnailUrl
      : adjunto.blobUrl;

  const datos = await leerArchivo(referencia);
  if (!datos) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const contentType =
    quiereMiniatura && adjunto.thumbnailUrl ? "image/webp" : adjunto.mimeType;

  // Las imágenes y los PDF se abren en el navegador; el resto se descarga.
  const enLinea = esImagen(contentType) || contentType === "application/pdf";

  return new NextResponse(datos, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename="${encodeURIComponent(adjunto.fileName)}"`,
      // `private` para que ningún proxy compartido guarde una copia: el archivo
      // es de un reporte concreto y solo lo puede ver quien tiene permiso.
      "Cache-Control": "private, max-age=3600",
      // El navegador no debe interpretar el archivo como otra cosa distinta de
      // lo declarado: evita que un archivo subido se ejecute como HTML.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
