"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { reports } from "@/db/schema";
import { contenidoCoincide } from "@/lib/archivos-firma";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { obtenerReporte } from "@/lib/queries/reports";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";
import { firmaSchema } from "@/lib/validation";

export type FirmaState = { error?: string; ok?: string };

/** Una firma dibujada pesa unos pocos kilobytes; 1 MB es un techo holgado. */
const MAX_FIRMA_BYTES = 1024 * 1024;

/**
 * Guarda la firma del cliente, y nada más.
 *
 * En concreto: NO manda ningún correo. El cliente firma cuando está delante,
 * pero el reporte puede seguir creciendo un rato más —faltan fotos, falta la
 * orden de compra— y mandarlo en ese momento sería mandarlo a medias. El envío
 * ocurre en un solo sitio, al marcar el reporte como terminado
 * (`finalizarReporteAction`). El correo que se captura aquí es justamente el
 * que se usará entonces, para no tener que volver a pedirlo.
 */
export async function firmarReporteAction(
  reportId: string,
  _prevState: FirmaState,
  formData: FormData,
): Promise<FirmaState> {
  const user = await requireAccesoReportes();
  const [reporte, t] = await Promise.all([
    obtenerReporte(reportId),
    getTranslations("validacion"),
  ]);

  // Un reporte de viáticos no tiene firma: su detalle ni siquiera muestra
  // esta sección, así que llegar aquí con uno solo puede ser una petición
  // manipulada.
  if (!reporte || reporte.type !== "servicio" || !puedeAccederAReporte(user, reporte)) {
    return { error: t("reporteNoExiste") };
  }

  const parsed = firmaSchema(t).safeParse({
    signatureName: formData.get("signatureName"),
    signatureEmail: formData.get("signatureEmail"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  const archivo = formData.get("firma");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: t("firmaNoLlego") };
  }
  if (archivo.size > MAX_FIRMA_BYTES) {
    return { error: t("firmaDemasiadoGrande") };
  }

  const datos = await archivo.arrayBuffer();

  // Se comprueba que sea un PNG de verdad y no cualquier cosa enviada con ese
  // nombre: esta acción recibe un archivo, igual que la de adjuntos, y no hay
  // razón para confiar más en ella.
  if (!contenidoCoincide(datos, "image/png")) {
    return { error: t("firmaFormatoInvalido") };
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
      signatureName: parsed.data.signatureName,
      signatureEmail: parsed.data.signatureEmail,
      signedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(reports.id, reportId));

  if (anterior) await borrarArchivo(anterior);

  revalidatePath("/reportes");
  revalidatePath(`/reportes/${reportId}`);

  return { ok: t("firmaGuardada") };
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
      signatureEmail: null,
      signedAt: null,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(reports.id, reportId));

  await borrarArchivo(reporte.signatureUrl);

  revalidatePath("/reportes");
  revalidatePath(`/reportes/${reportId}`);
}
