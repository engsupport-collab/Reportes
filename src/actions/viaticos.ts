"use server";

import { eq } from "drizzle-orm";
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
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { obtenerReporte } from "@/lib/queries/reports";
import { contarViaticos, obtenerViaticoConDueno } from "@/lib/queries/viaticos";
import { borrarArchivo, guardarArchivo } from "@/lib/storage";

export type ViaticoState = { error?: string; ok?: string };

/** Igual que el máximo de adjuntos: acota cuántas filas puede crear una sola petición. */
const MAX_VIATICOS_POR_REPORTE = 30;

export async function agregarViaticoAction(
  reportId: string,
  _prevState: ViaticoState,
  formData: FormData,
): Promise<ViaticoState> {
  const user = await requireAccesoReportes();
  const reporte = await obtenerReporte(reportId);

  if (!reporte || !puedeAccederAReporte(user, reporte)) {
    return { error: "El reporte no existe o no tienes acceso." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Selecciona una foto o archivo del gasto." };
  }

  const yaHay = await contarViaticos(reportId);
  if (yaHay >= MAX_VIATICOS_POR_REPORTE) {
    return {
      error: `Un reporte admite hasta ${MAX_VIATICOS_POR_REPORTE} viáticos.`,
    };
  }

  const validacion = validarArchivo({
    name: archivo.name,
    type: archivo.type,
    size: archivo.size,
  });
  if (!validacion.ok) return { error: validacion.error };

  const datos = await archivo.arrayBuffer();
  if (!contenidoCoincide(datos, archivo.type)) {
    return {
      error: `El contenido de "${archivo.name}" no corresponde a su extensión.`,
    };
  }

  // Opcional: el monto casi siempre ya se lee en la foto del recibo.
  const montoTexto = String(formData.get("amount") ?? "").trim();
  let amount: number | null = null;
  if (montoTexto.length > 0) {
    const numero = Number(montoTexto);
    if (!Number.isFinite(numero) || numero < 0) {
      return { error: "El monto no es un número válido." };
    }
    amount = Math.round(numero);
  }

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
    blobUrl,
    thumbnailUrl,
    fileName: sanearNombre(archivo.name),
    mimeType: archivo.type,
    sizeBytes: archivo.size,
    amount,
  });

  revalidatePath(`/reportes/${reportId}`);

  return { ok: "Viático agregado." };
}

export async function eliminarViaticoAction(id: string) {
  const user = await requireAccesoReportes();
  const viatico = await obtenerViaticoConDueno(id);

  if (!viatico || !puedeAccederAReporte(user, viatico)) return;

  await db.delete(reportViaticos).where(eq(reportViaticos.id, id));

  await borrarArchivo(viatico.blobUrl);
  if (viatico.thumbnailUrl) await borrarArchivo(viatico.thumbnailUrl);

  revalidatePath(`/reportes/${viatico.reportId}`);
}
