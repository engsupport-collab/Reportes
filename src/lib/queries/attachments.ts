import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { attachments, reports } from "@/db/schema";

export type AdjuntoEnLista = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  tieneMiniatura: boolean;
  uploadedAt: Date;
};

export async function listarAdjuntos(
  reportId: string,
): Promise<AdjuntoEnLista[]> {
  const filas = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      thumbnailUrl: attachments.thumbnailUrl,
      uploadedAt: attachments.uploadedAt,
    })
    .from(attachments)
    .where(eq(attachments.reportId, reportId))
    .orderBy(asc(attachments.uploadedAt));

  return filas.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    tieneMiniatura: f.thumbnailUrl !== null,
    uploadedAt: f.uploadedAt,
  }));
}

/**
 * Un adjunto junto con el autor del reporte al que pertenece.
 *
 * Devuelve el `authorId` porque quien llama necesita ese dato para decidir si
 * este usuario puede acceder. Se trae en el mismo JOIN en vez de consultar el
 * reporte aparte: son dos viajes a la base en la ruta de descarga, que se
 * ejecuta una vez por archivo mostrado.
 */
export async function obtenerAdjuntoConDueno(id: string) {
  const [fila] = await db
    .select({
      id: attachments.id,
      reportId: attachments.reportId,
      blobUrl: attachments.blobUrl,
      thumbnailUrl: attachments.thumbnailUrl,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      authorId: reports.authorId,
      // Necesario para comprobar que el archivo es de la empresa activa: sin
      // esto, alguien con acceso a las dos podría descargar un adjunto de Corp
      // estando en SaaS.
      companyId: reports.companyId,
    })
    .from(attachments)
    .innerJoin(reports, eq(reports.id, attachments.reportId))
    .where(eq(attachments.id, id))
    .limit(1);

  return fila ?? null;
}

export async function contarAdjuntos(reportId: string): Promise<number> {
  const filas = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.reportId, reportId));

  return filas.length;
}
