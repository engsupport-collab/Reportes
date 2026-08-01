import { NextResponse } from "next/server";

import { getCurrentUser, puedeAccederAReporte } from "@/lib/auth-guard";
import { obtenerReporte } from "@/lib/queries/reports";
import { leerArchivo } from "@/lib/storage";

/**
 * Imagen de la firma de un reporte.
 *
 * Igual que los adjuntos, no se entrega nunca la URL del almacenamiento: la
 * firma es lo más sensible del reporte, porque es lo que le da valor como
 * constancia del trabajo. Aquí se comprueba primero quién pide y si tiene
 * derecho a ese reporte: un empleado, solo el suyo y de su empresa; el admin,
 * cualquiera.
 *
 * El parámetro `id` es el del reporte, no el de un archivo: un reporte tiene
 * como mucho una firma, así que no hace falta un identificador aparte.
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

  if (!reporte || !reporte.signatureUrl) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // El admin siempre pasa, de cualquier empresa: `puedeAccederAReporte` ya lo
  // resuelve. No se le exige una `empresaActiva` que un admin nunca tiene.
  if (!puedeAccederAReporte(user, reporte)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const datos = await leerArchivo(reporte.signatureUrl);
  if (!datos) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  return new NextResponse(datos, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "inline",
      // `private` para que ningún proxy compartido guarde una copia. Sin
      // `max-age`: al volver a firmar, la imagen cambia y no debe quedar en
      // caché la anterior.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
