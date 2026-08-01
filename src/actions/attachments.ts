"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { attachments } from "@/db/schema";
import {
  MAX_ARCHIVOS_POR_REPORTE,
  esImagen,
  extensionDe,
  sanearNombre,
  validarArchivo,
} from "@/lib/archivos";
import { contenidoCoincide } from "@/lib/archivos-firma";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { contarAdjuntos, obtenerAdjuntoConDueno } from "@/lib/queries/attachments";
import { obtenerReporte } from "@/lib/queries/reports";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";

export type AdjuntoState = { error?: string; ok?: string };

export async function subirAdjuntosAction(
  reportId: string,
  _prevState: AdjuntoState,
  formData: FormData,
): Promise<AdjuntoState> {
  const user = await requireAccesoReportes();
  const reporte = await obtenerReporte(reportId);

  if (!reporte || !puedeAccederAReporte(user, reporte)) {
    return { error: "El reporte no existe o no tienes acceso." };
  }

  const archivos = formData
    .getAll("archivos")
    .filter((v): v is File => v instanceof File && v.size > 0);

  if (archivos.length === 0) {
    return { error: "Selecciona al menos un archivo." };
  }

  const yaHay = await contarAdjuntos(reportId);
  if (yaHay + archivos.length > MAX_ARCHIVOS_POR_REPORTE) {
    return {
      error: `Un reporte admite hasta ${MAX_ARCHIVOS_POR_REPORTE} archivos. Ya tiene ${yaHay}.`,
    };
  }

  const miniaturas = formData.getAll("miniaturas");

  for (const [i, archivo] of archivos.entries()) {
    // Primera comprobación: tamaño, tipo declarado y extensión.
    const validacion = validarArchivo({
      name: archivo.name,
      type: archivo.type,
      size: archivo.size,
    });
    if (!validacion.ok) return { error: validacion.error };

    const datos = await archivo.arrayBuffer();

    // Segunda comprobación, la que de verdad importa: el contenido real. El
    // tipo lo declara el navegador y se puede falsificar; los primeros bytes,
    // no. Aquí es donde un ejecutable renombrado a .pdf queda fuera.
    if (!contenidoCoincide(datos, archivo.type)) {
      return {
        error: `El contenido de "${archivo.name}" no corresponde a su extensión.`,
      };
    }

    const extension = extensionDe(archivo.name);
    const blobUrl = await guardarArchivo(datos, {
      contentType: archivo.type,
      extension,
    });

    // La miniatura la genera el navegador junto al archivo. Si falta, no pasa
    // nada: la lista muestra un icono en su lugar.
    let thumbnailUrl: string | null = null;
    const miniatura = miniaturas[i];
    if (miniatura instanceof File && miniatura.size > 0 && esImagen(archivo.type)) {
      const datosMini = await miniatura.arrayBuffer();
      if (contenidoCoincide(datosMini, "image/webp")) {
        thumbnailUrl = await guardarArchivo(datosMini, {
          contentType: "image/webp",
          extension: ".webp",
        });
      }
    }

    await db.insert(attachments).values({
      id: crypto.randomUUID(),
      reportId,
      blobUrl,
      thumbnailUrl,
      fileName: sanearNombre(archivo.name),
      mimeType: archivo.type,
      sizeBytes: archivo.size,
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

  // Primero la fila, después el archivo: si falla el borrado del archivo queda
  // un huérfano en el almacenamiento, que es molesto pero inofensivo. Al revés,
  // quedaría una fila apuntando a un archivo que ya no existe.
  await db.delete(attachments).where(eq(attachments.id, id));

  await borrarArchivo(adjunto.blobUrl);
  if (adjunto.thumbnailUrl) await borrarArchivo(adjunto.thumbnailUrl);

  revalidatePath("/reportes");
  revalidatePath(`/reportes/${adjunto.reportId}`);
}
