"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { reportViaticos } from "@/db/schema";
import { aceptarArchivo, aceptarMiniatura } from "@/lib/archivo-subido";
import { esImagen } from "@/lib/archivos";
import {
  puedeAccederAReporte,
  reporteBloqueado,
  requireAccesoReportes,
} from "@/lib/auth-guard";
import { obtenerReporte } from "@/lib/queries/reports";
import { obtenerViaticoConDueno } from "@/lib/queries/viaticos";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";
import { gastoViaticoSchema } from "@/lib/validation";

export type ViaticoState = { error?: string; ok?: string };

/**
 * Agregar o borrar un gasto cambia el total que se ve en dos sitios: el
 * propio reporte de viáticos, y la lista de reportes en el detalle de la
 * cotización — sin revalidar ese segundo también, se queda mostrando el
 * total de antes de este gasto hasta que algo más refresque esa página.
 */
function revalidarViatico(reportId: string, quoteId: string | null) {
  revalidatePath(`/reportes/${reportId}`);
  if (quoteId) revalidatePath(`/admin/cotizaciones/${quoteId}`);
}

export async function agregarViaticoAction(
  reportId: string,
  _prevState: ViaticoState,
  formData: FormData,
): Promise<ViaticoState> {
  const user = await requireAccesoReportes();
  const [reporte, t] = await Promise.all([
    obtenerReporte(reportId),
    getTranslations("validacion"),
  ]);

  // Los gastos solo se agregan a un reporte de viáticos: uno de servicio ya
  // no aloja esta sección, así que llegar aquí con otro tipo solo puede ser
  // una petición manipulada.
  if (!reporte || reporte.type !== "viaticos" || !puedeAccederAReporte(user, reporte)) {
    return { error: t("reporteNoExiste") };
  }
  // Terminado es cerrado: no se agregan más gastos hasta que se reabra.
  if (reporteBloqueado(reporte)) {
    return { error: t("reporteTerminadoBloqueado") };
  }

  const parsed = gastoViaticoSchema(t).safeParse({
    concepto: formData.get("concepto"),
    fechaGasto: formData.get("fechaGasto"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: t("seleccionaFoto") };
  }

  // Tamaño y contenido real, igual que un adjunto: una foto entra por lo que
  // es, no por cómo se llama.
  const aceptado = await aceptarArchivo(archivo);
  if (!aceptado.ok) return { error: aceptado.error };

  const { datos, mimeType, extension, fileName, sizeBytes } = aceptado.archivo;
  const { concepto, fechaGasto, amount } = parsed.data;

  const blobUrl = await guardarArchivo(datos, { contentType: mimeType, extension });

  let thumbnailUrl: string | null = null;
  const miniatura = esImagen(mimeType)
    ? await aceptarMiniatura(formData.get("miniatura"))
    : null;
  if (miniatura) {
    thumbnailUrl = await guardarArchivo(miniatura.datos, {
      contentType: miniatura.mimeType,
      extension: miniatura.extension,
    });
  }

  await db.insert(reportViaticos).values({
    id: crypto.randomUUID(),
    reportId,
    concepto,
    fechaGasto,
    blobUrl,
    thumbnailUrl,
    fileName,
    mimeType,
    sizeBytes,
    amount,
  });

  revalidarViatico(reportId, reporte.quoteId);

  return { ok: t("gastoAgregado") };
}

export async function eliminarViaticoAction(id: string) {
  const user = await requireAccesoReportes();
  const viatico = await obtenerViaticoConDueno(id);

  if (!viatico || !puedeAccederAReporte(user, viatico)) return;
  if (reporteBloqueado(viatico)) return;

  await db.delete(reportViaticos).where(eq(reportViaticos.id, id));

  await borrarArchivo(viatico.blobUrl);
  if (viatico.thumbnailUrl) await borrarArchivo(viatico.thumbnailUrl);

  revalidarViatico(viatico.reportId, viatico.quoteId);
}
