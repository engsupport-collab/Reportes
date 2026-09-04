/**
 * Comprueba que la migración de archivos a Cloud Storage está completa antes
 * de borrar nada de Vercel Blob.
 *
 *   npm run verificar:archivos            -> dev
 *   npm run verificar:archivos -- --prod  -> prod
 *
 * No se conforma con mirar la base. Que una fila diga `gcs:algo` no prueba que
 * el archivo esté ahí: comprueba **también** que cada objeto existe en el
 * bucket y que no está vacío. Una comprobación que solo puede salir bien no
 * comprueba nada.
 */
import { Storage } from "@google-cloud/storage";
import { isNotNull } from "drizzle-orm";

import { crearClienteScript } from "./db-cliente";
import { anunciar, cargarCredenciales } from "./entorno";
import { attachments, reportViaticos, reports } from "../src/db/schema";

const PREFIJO_GCS = "gcs:";
const MARCA_BLOB = ".public.blob.vercel-storage.com/";

type Referencia = { tabla: string; id: string; columna: string; valor: string };

async function main() {
  const cred = cargarCredenciales(process.argv);
  anunciar(cred);

  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error("Falta GCS_BUCKET_NAME en el entorno.");

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const { db, cerrar } = await crearClienteScript(cred);

  const referencias: Referencia[] = [];

  for (const fila of await db
    .select({ id: attachments.id, blobUrl: attachments.blobUrl, thumbnailUrl: attachments.thumbnailUrl })
    .from(attachments)) {
    referencias.push({ tabla: "attachments", id: fila.id, columna: "blobUrl", valor: fila.blobUrl });
    if (fila.thumbnailUrl) {
      referencias.push({ tabla: "attachments", id: fila.id, columna: "thumbnailUrl", valor: fila.thumbnailUrl });
    }
  }

  for (const fila of await db
    .select({ id: reportViaticos.id, blobUrl: reportViaticos.blobUrl, thumbnailUrl: reportViaticos.thumbnailUrl })
    .from(reportViaticos)) {
    referencias.push({ tabla: "report_viaticos", id: fila.id, columna: "blobUrl", valor: fila.blobUrl });
    if (fila.thumbnailUrl) {
      referencias.push({ tabla: "report_viaticos", id: fila.id, columna: "thumbnailUrl", valor: fila.thumbnailUrl });
    }
  }

  for (const fila of await db
    .select({ id: reports.id, signatureUrl: reports.signatureUrl })
    .from(reports)
    .where(isNotNull(reports.signatureUrl))) {
    referencias.push({ tabla: "reports", id: fila.id, columna: "signatureUrl", valor: fila.signatureUrl! });
  }

  console.log(`\n${referencias.length} referencias de archivo en la base.\n`);

  const sinMigrar = referencias.filter((r) => r.valor.includes(MARCA_BLOB));
  const enGcs = referencias.filter((r) => r.valor.startsWith(PREFIJO_GCS));
  const otras = referencias.filter(
    (r) => !r.valor.includes(MARCA_BLOB) && !r.valor.startsWith(PREFIJO_GCS),
  );

  let faltantes = 0;
  let vacios = 0;

  for (const ref of enGcs) {
    const objectName = ref.valor.slice(PREFIJO_GCS.length);
    const archivo = bucket.file(objectName);
    const [existe] = await archivo.exists();
    if (!existe) {
      console.log(`  FALTA en el bucket: ${ref.tabla}/${ref.id}/${ref.columna} -> ${objectName}`);
      faltantes++;
      continue;
    }
    const [metadatos] = await archivo.getMetadata();
    const tamano = Number(metadatos.size ?? 0);
    if (tamano === 0) {
      console.log(`  VACÍO en el bucket: ${ref.tabla}/${ref.id}/${ref.columna} -> ${objectName}`);
      vacios++;
    }
  }

  for (const ref of sinMigrar) {
    console.log(`  SIN MIGRAR (sigue en Vercel Blob): ${ref.tabla}/${ref.id}/${ref.columna}`);
  }
  for (const ref of otras) {
    console.log(`  REFERENCIA DESCONOCIDA: ${ref.tabla}/${ref.id}/${ref.columna} -> ${ref.valor.slice(0, 60)}`);
  }

  console.log(`\n  En Cloud Storage y verificados: ${enGcs.length - faltantes - vacios}`);
  console.log(`  Faltantes en el bucket:         ${faltantes}`);
  console.log(`  Vacíos en el bucket:            ${vacios}`);
  console.log(`  Todavía en Vercel Blob:         ${sinMigrar.length}`);
  console.log(`  Referencias desconocidas:       ${otras.length}`);

  const todoBien = faltantes === 0 && vacios === 0 && sinMigrar.length === 0 && otras.length === 0;
  console.log(
    todoBien
      ? "\nTodo correcto: no queda nada apuntando a Vercel Blob y todos los archivos existen.\n"
      : "\nHAY PROBLEMAS: no borres nada de Vercel Blob todavía.\n",
  );

  await cerrar();
  if (!todoBien) process.exit(1);
}

main().catch((error) => {
  console.error("Error al verificar:", error);
  process.exit(1);
});
