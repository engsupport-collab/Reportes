"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { reports } from "@/db/schema";
import { contenidoCoincide } from "@/lib/archivos-firma";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { obtenerReporte } from "@/lib/queries/reports";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";

export type FirmaState = { error?: string; ok?: string };

/** Una firma dibujada pesa unos pocos kilobytes; 1 MB es un techo holgado. */
const MAX_FIRMA_BYTES = 1024 * 1024;

const nombreSchema = z
  .string()
  .trim()
  .min(1, "Escribe el nombre de quien firma")
  .max(120, "El nombre es demasiado largo");

export async function firmarReporteAction(
  reportId: string,
  _prevState: FirmaState,
  formData: FormData,
): Promise<FirmaState> {
  const user = await requireAccesoReportes();
  const reporte = await obtenerReporte(reportId);

  if (!reporte || !puedeAccederAReporte(user, reporte)) {
    return { error: "El reporte no existe o no tienes acceso." };
  }

  const nombre = nombreSchema.safeParse(formData.get("signatureName"));
  if (!nombre.success) {
    return { error: nombre.error.issues[0]!.message };
  }

  const archivo = formData.get("firma");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "No llegó la firma. Intenta de nuevo." };
  }
  if (archivo.size > MAX_FIRMA_BYTES) {
    return { error: "La firma es demasiado grande." };
  }

  const datos = await archivo.arrayBuffer();

  // Se comprueba que sea un PNG de verdad y no cualquier cosa enviada con ese
  // nombre: esta acción recibe un archivo, igual que la de adjuntos, y no hay
  // razón para confiar más en ella.
  if (!contenidoCoincide(datos, "image/png")) {
    return { error: "El formato de la firma no es válido." };
  }

  const url = await guardarArchivo(datos, {
    contentType: "image/png",
    extension: ".png",
  });

  // Si el reporte ya estaba firmado, se borra la imagen anterior: volver a
  // firmar reemplaza, no acumula archivos huérfanos en el almacenamiento.
  const anterior = reporte.signatureUrl;

  await db
    .update(reports)
    .set({
      signatureUrl: url,
      signatureName: nombre.data,
      signedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(reports.id, reportId));

  if (anterior) await borrarArchivo(anterior);

  revalidatePath("/reportes");
  revalidatePath(`/reportes/${reportId}`);

  return { ok: "Firma guardada." };
}

export async function borrarFirmaAction(reportId: string) {
  const user = await requireAccesoReportes();
  const reporte = await obtenerReporte(reportId);

  if (!reporte || !puedeAccederAReporte(user, reporte)) return;
  if (!reporte.signatureUrl) return;

  await db
    .update(reports)
    .set({
      signatureUrl: null,
      signatureName: null,
      signedAt: null,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(reports.id, reportId));

  await borrarArchivo(reporte.signatureUrl);

  revalidatePath("/reportes");
  revalidatePath(`/reportes/${reportId}`);
}
