"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { attachments } from "@/db/schema";
import { aceptarArchivo, aceptarMiniatura } from "@/lib/archivo-subido";
import { esImagen } from "@/lib/archivos";
import {
  puedeAccederAReporte,
  reporteBloqueado,
  requireAccesoReportes,
} from "@/lib/auth-guard";
import { obtenerAdjuntoConDueno } from "@/lib/queries/attachments";
import { obtenerReporte } from "@/lib/queries/reports";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";

export type AdjuntoState = { error?: string; ok?: string };

/**
 * Sube archivos a un reporte de servicio.
 *
 * El navegador manda uno por petición (ver `attachment-uploader.tsx`): así
 * ninguna petición se acerca al tope de 4,5 MB de Vercel por muchas fotos que
 * se elijan a la vez, y si una falla —se cae la señal a mitad— las demás ya
 * quedaron guardadas y solo se reintenta esa.
 *
 * No hay tope de cuántos archivos lleva un reporte.
 */
export async function subirAdjuntosAction(
  reportId: string,
  _prevState: AdjuntoState,
  formData: FormData,
): Promise<AdjuntoState> {
  const user = await requireAccesoReportes();
  const reporte = await obtenerReporte(reportId);

  // Un reporte de viáticos no tiene adjuntos genéricos: sus archivos son las
  // fotos de cada gasto, que se agregan por su propia acción.
  if (!reporte || reporte.type !== "servicio" || !puedeAccederAReporte(user, reporte)) {
    return { error: "El reporte no existe o no tienes acceso." };
  }
  // Terminado es cerrado: ni el autor ni el admin suben nada más por aquí.
  if (reporteBloqueado(reporte)) {
    return { error: "Este reporte está terminado y no se puede editar." };
  }

  const archivos = formData
    .getAll("archivos")
    .filter((v): v is File => v instanceof File && v.size > 0);

  if (archivos.length === 0) {
    return { error: "Selecciona al menos un archivo." };
  }

  const miniaturas = formData.getAll("miniaturas");

  for (const [i, archivo] of archivos.entries()) {
    // Tamaño, y sobre todo contenido: qué es de verdad el archivo. El tipo lo
    // declara el navegador y se puede falsificar; los primeros bytes, no.
    const aceptado = await aceptarArchivo(archivo);
    if (!aceptado.ok) return { error: aceptado.error };

    const { datos, mimeType, extension, fileName, sizeBytes } = aceptado.archivo;
    const blobUrl = await guardarArchivo(datos, { contentType: mimeType, extension });

    // La miniatura la genera el navegador junto al archivo. Si falta, no pasa
    // nada: la lista muestra un icono en su lugar.
    let thumbnailUrl: string | null = null;
    const miniatura = esImagen(mimeType) ? await aceptarMiniatura(miniaturas[i]) : null;
    if (miniatura) {
      thumbnailUrl = await guardarArchivo(miniatura.datos, {
        contentType: miniatura.mimeType,
        extension: miniatura.extension,
      });
    }

    await db.insert(attachments).values({
      id: crypto.randomUUID(),
      reportId,
      blobUrl,
      thumbnailUrl,
      fileName,
      mimeType,
      sizeBytes,
    });
  }

  revalidatePath("/reportes");
  revalidatePath(`/reportes/${reportId}`);

  return {
    ok:
      archivos.length === 1
        ? "Archivo subido."
        : `${archivos.length} archivos subidos.`,
  };
}

export async function eliminarAdjuntoAction(id: string) {
  const user = await requireAccesoReportes();
  const adjunto = await obtenerAdjuntoConDueno(id);

  if (!adjunto || !puedeAccederAReporte(user, adjunto)) return;
  // Terminado es cerrado: sus adjuntos no se tocan hasta que se reabra.
  if (reporteBloqueado(adjunto)) return;

  // Primero la fila, después el archivo: si falla el borrado del archivo queda
  // un huérfano en el almacenamiento, que es molesto pero inofensivo. Al revés,
  // quedaría una fila apuntando a un archivo que ya no existe.
  await db.delete(attachments).where(eq(attachments.id, id));

  await borrarArchivo(adjunto.blobUrl);
  if (adjunto.thumbnailUrl) await borrarArchivo(adjunto.thumbnailUrl);

  revalidatePath("/reportes");
  revalidatePath(`/reportes/${adjunto.reportId}`);
}
