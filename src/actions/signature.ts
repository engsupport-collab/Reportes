"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { reports } from "@/db/schema";
import { contenidoCoincide } from "@/lib/archivos-firma";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { firmarEnlacePublico } from "@/lib/enlace-firma";
import { obtenerReporte } from "@/lib/queries/reports";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";
import { firmaSchema } from "@/lib/validation";

export type FirmaState = { error?: string; ok?: string };

/** Una firma dibujada pesa unos pocos kilobytes; 1 MB es un techo holgado. */
const MAX_FIRMA_BYTES = 1024 * 1024;

/**
 * Avisa a n8n de que el reporte quedó firmado, para que mande el correo con
 * el enlace al PDF.
 *
 * Nunca lanza: si falta configuración (`APP_URL` o `N8N_WEBHOOK_URL`) o el
 * webhook no responde, la firma ya quedó guardada — el correo es un aviso
 * adicional, no la acción que importa. El aviso se pierde en silencio, salvo
 * por la anotación en el registro del servidor.
 */
async function avisarFirmaPorCorreo(datos: {
  reportId: string;
  correo: string;
  nombreFirmante: string;
  proyecto: string;
}): Promise<void> {
  const appUrl = process.env.APP_URL;
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!appUrl || !webhookUrl) {
    console.warn(
      "No se avisó por correo de la firma del reporte %s: falta APP_URL o N8N_WEBHOOK_URL.",
      datos.reportId,
    );
    return;
  }

  try {
    const token = await firmarEnlacePublico(datos.reportId);
    const enlace = new URL(`/api/reportes/publico/${token}`, appUrl).toString();

    const respuesta = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correo: datos.correo,
        nombreFirmante: datos.nombreFirmante,
        proyecto: datos.proyecto,
        enlacePdf: enlace,
      }),
    });

    if (!respuesta.ok) {
      console.warn(
        "El webhook de n8n respondió %d al avisar de la firma del reporte %s.",
        respuesta.status,
        datos.reportId,
      );
    }
  } catch (error) {
    console.warn(
      "No se pudo avisar por correo de la firma del reporte %s:",
      datos.reportId,
      error,
    );
  }
}

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

  await avisarFirmaPorCorreo({
    reportId,
    correo: parsed.data.signatureEmail,
    nombreFirmante: parsed.data.signatureName,
    proyecto: reporte.projectName,
  });

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
