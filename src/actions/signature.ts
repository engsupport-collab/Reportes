"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { reports } from "@/db/schema";
import { contenidoCoincide } from "@/lib/archivos-firma";
import {
  puedeAccederAReporte,
  reporteBloqueado,
  requireAccesoReportes,
} from "@/lib/auth-guard";
import { registrarEvento } from "@/lib/eventos-reporte";
import { esIdiomaDeDocumento, idiomaPropioDeReporte } from "@/lib/idioma-documento";
import { obtenerReporte } from "@/lib/queries/reports";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";
import { correoClienteSchema, firmaSchema } from "@/lib/validation";

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
  // Terminado es cerrado: la firma que quedó registrada al cerrarlo no se
  // vuelve a tocar hasta que se reabra.
  if (reporteBloqueado(reporte)) {
    return { error: t("reporteTerminadoBloqueado") };
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

  // Junto al correo se elige en qué idioma sale el reporte. Si el formulario
  // no lo trae —una pantalla abierta desde antes de que existiera— se deja
  // como estaba.
  const idiomaElegido = formData.get("documentLanguage");

  await db
    .update(reports)
    .set({
      signatureUrl: url,
      signatureName: parsed.data.signatureName,
      signatureEmail: parsed.data.signatureEmail,
      ...(esIdiomaDeDocumento(idiomaElegido)
        ? { documentLanguage: idiomaPropioDeReporte(idiomaElegido, reporte.idiomaDelCliente) }
        : {}),
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

export type CorreoFirmaState = { error?: string; ok?: string };

/**
 * Corrige el correo de quien firmó, sin tocar la firma.
 *
 * El correo se escribe una sola vez, al firmar, y es a donde se manda el
 * reporte. Si quedaba mal escrito la única salida era "volver a firmar", que
 * borra la firma: había que pedirle al cliente que firmara de nuevo por una
 * letra equivocada, y con el reporte terminado ni eso.
 *
 * Se permite también con el reporte terminado, a diferencia del resto de sus
 * datos. No es parte de lo que el cliente firmó —es la dirección de entrega—,
 * y es justo terminado cuando se descubre que el correo no llegó. Cada cambio
 * queda en el historial con el valor anterior, el nuevo y quién lo hizo.
 */
export async function corregirCorreoFirmaAction(
  reportId: string,
  _prevState: CorreoFirmaState,
  formData: FormData,
): Promise<CorreoFirmaState> {
  const user = await requireAccesoReportes();
  const [reporte, t] = await Promise.all([
    obtenerReporte(reportId),
    getTranslations("validacion"),
  ]);

  if (!reporte || reporte.type !== "servicio" || !puedeAccederAReporte(user, reporte)) {
    return { error: t("reporteNoExiste") };
  }
  // Sin firma no hay correo que corregir: se escribe al firmar.
  if (!reporte.signatureUrl) {
    return { error: t("firmaAntesDeTerminar") };
  }

  const parsed = correoClienteSchema(t).safeParse(formData.get("signatureEmail"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  const anterior = reporte.signatureEmail ?? "";
  if (parsed.data === anterior) return { ok: t("correoSinCambios") };

  // Solo la dirección. `updatedAt` y `updatedBy` no se tocan: marcan cuándo se
  // editó el contenido del reporte, y esto no lo es — su rastro es el evento.
  await db
    .update(reports)
    .set({ signatureEmail: parsed.data })
    .where(eq(reports.id, reportId));

  await registrarEvento({
    reportId,
    tipo: "correo_corregido",
    userId: user.id,
    metadata: { de: anterior, a: parsed.data },
  });

  revalidatePath(`/reportes/${reportId}`);

  return { ok: t("correoCorregido") };
}

export type IdiomaReporteState = { error?: string; ok?: string };

/**
 * Cambia en qué idioma sale un reporte ya firmado: su PDF y su correo.
 *
 * Igual que el correo de quien firma, se permite también con el reporte
 * terminado: no es parte de lo que el cliente firmó, es cómo se le entrega, y
 * es justo terminado cuando se descubre que le llegó en el idioma que no era.
 * Se cambia aquí y se vuelve a enviar. Cada cambio queda en el historial.
 */
export async function cambiarIdiomaReporteAction(
  reportId: string,
  idioma: string,
): Promise<IdiomaReporteState> {
  const user = await requireAccesoReportes();
  const [reporte, t] = await Promise.all([
    obtenerReporte(reportId),
    getTranslations("validacion"),
  ]);

  if (!reporte || reporte.type !== "servicio" || !puedeAccederAReporte(user, reporte)) {
    return { error: t("reporteNoExiste") };
  }
  if (!esIdiomaDeDocumento(idioma)) {
    return { error: t("revisaLosDatos") };
  }
  if (idioma === reporte.idioma) return { ok: t("idiomaActualizado") };

  // Solo el idioma. `updatedAt` y `updatedBy` no se tocan, por lo mismo que al
  // corregir el correo: su rastro es el evento.
  await db
    .update(reports)
    .set({ documentLanguage: idiomaPropioDeReporte(idioma, reporte.idiomaDelCliente) })
    .where(eq(reports.id, reportId));

  await registrarEvento({
    reportId,
    tipo: "idioma_cambiado",
    userId: user.id,
    metadata: { de: reporte.idioma, a: idioma },
  });

  revalidatePath(`/reportes/${reportId}`);

  return { ok: t("idiomaActualizado") };
}

export async function borrarFirmaAction(reportId: string) {
  const user = await requireAccesoReportes();
  const reporte = await obtenerReporte(reportId);

  if (!reporte || !puedeAccederAReporte(user, reporte)) return;
  if (reporteBloqueado(reporte)) return;
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
