/**
 * Copia los archivos de Vercel Blob a Cloud Storage, y reescribe las
 * referencias guardadas en la base para que apunten al nuevo bucket.
 *
 *   npm run migrar:archivos            -> dev
 *   npm run migrar:archivos -- --prod  -> prod
 *
 * Se ejecuta después de `npm run migrar:datos` (que trae las filas con las
 * URLs viejas de Vercel Blob) y antes de dar por terminada la fase 2. No
 * borra nada de Vercel Blob — eso es un paso aparte, deliberadamente manual,
 * una vez confirmado que todo se lee bien desde el bucket nuevo.
 */
import { Storage } from "@google-cloud/storage";
import { eq, isNotNull } from "drizzle-orm";

import { crearClienteScript } from "./db-cliente";
import { anunciar, cargarCredenciales } from "./entorno";
import { attachments, reportViaticos, reports } from "../src/db/schema";

const PREFIJO_GCS = "gcs:";

async function copiar(
  storage: Storage,
  bucketName: string,
  urlVieja: string,
): Promise<string> {
  const res = await fetch(urlVieja);
  if (!res.ok) {
    throw new Error(`No se pudo descargar ${urlVieja}: HTTP ${res.status}`);
  }
  const datos = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";

  // Se conserva el nombre de archivo interno original (la parte antes del
  // sufijo aleatorio de Vercel) para que el nuevo objeto tenga la misma
  // extensión y sea reconocible en el bucket.
  const nombre = new URL(urlVieja).pathname.split("/").pop() ?? crypto.randomUUID();
  const objectName = `reportes/${crypto.randomUUID()}-${nombre}`;

  await storage.bucket(bucketName).file(objectName).save(datos, { contentType });
  return `${PREFIJO_GCS}${objectName}`;
}

function esUrlDeVercelBlob(referencia: string | null): referencia is string {
  return Boolean(referencia) && referencia!.includes(".public.blob.vercel-storage.com/");
}

async function main() {
  const credencialesPg = cargarCredenciales(process.argv);
  anunciar(credencialesPg);

  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error("Falta GCS_BUCKET_NAME en el entorno.");

  const storage = new Storage();
  const { db, cerrar } = await crearClienteScript(credencialesPg);

  let migrados = 0;

  const listaAttachments = await db
    .select({ id: attachments.id, blobUrl: attachments.blobUrl, thumbnailUrl: attachments.thumbnailUrl })
    .from(attachments);
  for (const fila of listaAttachments) {
    const cambios: Partial<typeof attachments.$inferInsert> = {};
    if (esUrlDeVercelBlob(fila.blobUrl)) {
      cambios.blobUrl = await copiar(storage, bucketName, fila.blobUrl);
      migrados++;
    }
    if (esUrlDeVercelBlob(fila.thumbnailUrl)) {
      cambios.thumbnailUrl = await copiar(storage, bucketName, fila.thumbnailUrl);
      migrados++;
    }
    if (Object.keys(cambios).length > 0) {
      await db.update(attachments).set(cambios).where(eq(attachments.id, fila.id));
    }
  }
  console.log(`attachments: ${listaAttachments.length} filas revisadas`);

  const listaViaticos = await db
    .select({ id: reportViaticos.id, blobUrl: reportViaticos.blobUrl, thumbnailUrl: reportViaticos.thumbnailUrl })
    .from(reportViaticos);
  for (const fila of listaViaticos) {
    const cambios: Partial<typeof reportViaticos.$inferInsert> = {};
    if (esUrlDeVercelBlob(fila.blobUrl)) {
      cambios.blobUrl = await copiar(storage, bucketName, fila.blobUrl);
      migrados++;
    }
    if (esUrlDeVercelBlob(fila.thumbnailUrl)) {
      cambios.thumbnailUrl = await copiar(storage, bucketName, fila.thumbnailUrl);
      migrados++;
    }
    if (Object.keys(cambios).length > 0) {
      await db.update(reportViaticos).set(cambios).where(eq(reportViaticos.id, fila.id));
    }
  }
  console.log(`report_viaticos: ${listaViaticos.length} filas revisadas`);

  const listaFirmas = await db
    .select({ id: reports.id, signatureUrl: reports.signatureUrl })
    .from(reports)
    .where(isNotNull(reports.signatureUrl));
  for (const fila of listaFirmas) {
    if (esUrlDeVercelBlob(fila.signatureUrl)) {
      const nueva = await copiar(storage, bucketName, fila.signatureUrl);
      await db.update(reports).set({ signatureUrl: nueva }).where(eq(reports.id, fila.id));
      migrados++;
    }
  }
  console.log(`reports (firmas): ${listaFirmas.length} filas revisadas`);

  console.log(`\n${migrados} archivos copiados a gs://${bucketName} y referencias actualizadas.`);

  await cerrar();
}

main().catch((error) => {
  console.error("Error al migrar los archivos:", error);
  process.exit(1);
});
