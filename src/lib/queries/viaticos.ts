import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { reportViaticos, reports } from "@/db/schema";

export type ViaticoEnLista = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  tieneMiniatura: boolean;
  concepto: string | null;
  fechaGasto: Date | null;
  amount: number | null;
  uploadedAt: Date;
};

export async function listarViaticos(
  reportId: string,
): Promise<ViaticoEnLista[]> {
  const filas = await db
    .select({
      id: reportViaticos.id,
      fileName: reportViaticos.fileName,
      mimeType: reportViaticos.mimeType,
      sizeBytes: reportViaticos.sizeBytes,
      thumbnailUrl: reportViaticos.thumbnailUrl,
      concepto: reportViaticos.concepto,
      fechaGasto: reportViaticos.fechaGasto,
      amount: reportViaticos.amount,
      uploadedAt: reportViaticos.uploadedAt,
    })
    .from(reportViaticos)
    .where(eq(reportViaticos.reportId, reportId))
    .orderBy(asc(reportViaticos.uploadedAt));

  return filas.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    tieneMiniatura: f.thumbnailUrl !== null,
    concepto: f.concepto,
    fechaGasto: f.fechaGasto,
    amount: f.amount,
    uploadedAt: f.uploadedAt,
  }));
}

/**
 * Un viático junto con el autor y la empresa del reporte al que pertenece, para
 * poder verificar acceso sin una segunda consulta — igual que
 * `obtenerAdjuntoConDueno`.
 */
export async function obtenerViaticoConDueno(id: string) {
  const [fila] = await db
    .select({
      id: reportViaticos.id,
      reportId: reportViaticos.reportId,
      blobUrl: reportViaticos.blobUrl,
      thumbnailUrl: reportViaticos.thumbnailUrl,
      fileName: reportViaticos.fileName,
      mimeType: reportViaticos.mimeType,
      sizeBytes: reportViaticos.sizeBytes,
      authorId: reports.authorId,
      companyId: reports.companyId,
      linkedReportId: reports.linkedReportId,
    })
    .from(reportViaticos)
    .innerJoin(reports, eq(reports.id, reportViaticos.reportId))
    .where(eq(reportViaticos.id, id))
    .limit(1);

  return fila ?? null;
}

/** Viáticos con su `blobUrl`, monto y datos del gasto, para armar el PDF de descarga. */
export async function listarViaticosParaPdf(reportId: string) {
  return db
    .select({
      id: reportViaticos.id,
      blobUrl: reportViaticos.blobUrl,
      fileName: reportViaticos.fileName,
      mimeType: reportViaticos.mimeType,
      concepto: reportViaticos.concepto,
      fechaGasto: reportViaticos.fechaGasto,
      amount: reportViaticos.amount,
    })
    .from(reportViaticos)
    .where(eq(reportViaticos.reportId, reportId))
    .orderBy(asc(reportViaticos.uploadedAt));
}

export async function contarViaticos(reportId: string): Promise<number> {
  const filas = await db
    .select({ id: reportViaticos.id })
    .from(reportViaticos)
    .where(eq(reportViaticos.reportId, reportId));

  return filas.length;
}
