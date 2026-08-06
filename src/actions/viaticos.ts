"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { reportViaticos } from "@/db/schema";
import {
  esImagen,
  extensionDe,
  sanearNombre,
  validarArchivo,
} from "@/lib/archivos";
import { contenidoCoincide } from "@/lib/archivos-firma";
import {
  puedeAccederAReporte,
  reporteBloqueado,
  requireAccesoReportes,
} from "@/lib/auth-guard";
import { obtenerReporte } from "@/lib/queries/reports";
import { contarViaticos, obtenerViaticoConDueno } from "@/lib/queries/viaticos";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";
import { gastoViaticoSchema } from "@/lib/validation";

export type ViaticoState = { error?: string; ok?: string };

/** Igual que el máximo de adjuntos: acota cuántas filas puede crear una sola petición. */
const MAX_VIATICOS_POR_REPORTE = 30;

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

  const yaHay = await contarViaticos(reportId);
  if (yaHay >= MAX_VIATICOS_POR_REPORTE) {
    return { error: t("maximoViaticos", { max: MAX_VIATICOS_POR_REPORTE }) };
  }

  const validacion = validarArchivo({
    name: archivo.name,
    type: archivo.type,
    size: archivo.size,
  });
  if (!validacion.ok) return { error: validacion.error };

  const datos = await archivo.arrayBuffer();
  if (!contenidoCoincide(datos, archivo.type)) {
    return { error: t("contenidoNoCoincide", { nombre: archivo.name }) };
  }

  const { concepto, fechaGasto, amount } = parsed.data;

  const extension = extensionDe(archivo.name);
  const blobUrl = await guardarArchivo(datos, {
    contentType: archivo.type,
    extension,
  });

  let thumbnailUrl: string | null = null;
  const miniatura = formData.get("miniatura");
  if (
    miniatura instanceof File &&
    miniatura.size > 0 &&
    esImagen(archivo.type)
  ) {
    const datosMini = await miniatura.arrayBuffer();
    if (contenidoCoincide(datosMini, "image/webp")) {
      thumbnailUrl = await guardarArchivo(datosMini, {
        contentType: "image/webp",
        extension: ".webp",
      });
    }
  }

  await db.insert(reportViaticos).values({
    id: crypto.randomUUID(),
    reportId,
    concepto,
    fechaGasto,
    blobUrl,
    thumbnailUrl,
    fileName: sanearNombre(archivo.name),
    mimeType: archivo.type,
    sizeBytes: archivo.size,
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
