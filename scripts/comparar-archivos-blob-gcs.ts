/**
 * Compara byte a byte cada archivo migrado: el original en Vercel Blob contra
 * la copia que quedó en Cloud Storage.
 *
 *   npm run comparar:archivos            -> dev
 *   npm run comparar:archivos -- --prod  -> prod
 *
 * Las URLs viejas ya no están en la base (se reescribieron al migrar), así que
 * se leen del respaldo JSON de Turso que hizo `npm run respaldar:turso`.
 *
 * Comprobar que el objeto "existe y no está vacío" no descarta una copia
 * truncada o cruzada. Esto sí: compara el tamaño y el SHA-256 de los dos.
 */
import { Storage } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { crearClienteScript } from "./db-cliente";
import { anunciar, cargarCredenciales } from "./entorno";
import { attachments, reportViaticos, reports } from "../src/db/schema";

const PREFIJO_GCS = "gcs:";
const MARCA_BLOB = ".public.blob.vercel-storage.com/";

function sha256(datos: Buffer): string {
  return createHash("sha256").update(datos).digest("hex");
}

type Original = { tabla: string; id: string; columna: string; url: string };

function leerRespaldo(carpeta: string, tabla: string): Record<string, unknown>[] {
  try {
    return JSON.parse(readFileSync(join(carpeta, `${tabla}.json`), "utf8"));
  } catch {
    return [];
  }
}

async function main() {
  const cred = cargarCredenciales(process.argv);
  anunciar(cred);

  const carpetaRespaldo = process.argv
    .find((a) => a.startsWith("--respaldo="))
    ?.slice("--respaldo=".length);
  if (!carpetaRespaldo) {
    throw new Error(
      "Falta --respaldo=<carpeta> (la que generó `npm run respaldar:turso`).",
    );
  }

  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error("Falta GCS_BUCKET_NAME en el entorno.");

  const originales: Original[] = [];
  for (const fila of leerRespaldo(carpetaRespaldo, "attachments")) {
    for (const columna of ["blob_url", "thumbnail_url"]) {
      const url = fila[columna];
      if (typeof url === "string" && url.includes(MARCA_BLOB)) {
        originales.push({ tabla: "attachments", id: String(fila.id), columna, url });
      }
    }
  }
  for (const fila of leerRespaldo(carpetaRespaldo, "report_viaticos")) {
    for (const columna of ["blob_url", "thumbnail_url"]) {
      const url = fila[columna];
      if (typeof url === "string" && url.includes(MARCA_BLOB)) {
        originales.push({ tabla: "report_viaticos", id: String(fila.id), columna, url });
      }
    }
  }
  for (const fila of leerRespaldo(carpetaRespaldo, "reports")) {
    const url = fila.signature_url;
    if (typeof url === "string" && url.includes(MARCA_BLOB)) {
      originales.push({ tabla: "reports", id: String(fila.id), columna: "signature_url", url });
    }
  }

  console.log(`\n${originales.length} archivos originales en el respaldo.\n`);

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const { db, cerrar } = await crearClienteScript(cred);

  const actuales = new Map<string, string>();
  for (const f of await db.select().from(attachments)) {
    actuales.set(`attachments/${f.id}/blob_url`, f.blobUrl);
    if (f.thumbnailUrl) actuales.set(`attachments/${f.id}/thumbnail_url`, f.thumbnailUrl);
  }
  for (const f of await db.select().from(reportViaticos)) {
    actuales.set(`report_viaticos/${f.id}/blob_url`, f.blobUrl);
    if (f.thumbnailUrl) actuales.set(`report_viaticos/${f.id}/thumbnail_url`, f.thumbnailUrl);
  }
  for (const f of await db.select().from(reports)) {
    if (f.signatureUrl) actuales.set(`reports/${f.id}/signature_url`, f.signatureUrl);
  }

  let iguales = 0;
  let distintos = 0;
  let noComprobados = 0;

  for (const orig of originales) {
    const clave = `${orig.tabla}/${orig.id}/${orig.columna}`;
    const referencia = actuales.get(clave);

    if (!referencia) {
      console.log(`  ? ${clave}: la fila ya no existe en Postgres (borrada después de migrar)`);
      noComprobados++;
      continue;
    }
    if (!referencia.startsWith(PREFIJO_GCS)) {
      console.log(`  ! ${clave}: no apunta a Cloud Storage -> ${referencia.slice(0, 50)}`);
      distintos++;
      continue;
    }

    const respuesta = await fetch(orig.url);
    if (!respuesta.ok) {
      console.log(`  ? ${clave}: el original ya no responde (HTTP ${respuesta.status})`);
      noComprobados++;
      continue;
    }
    const viejo = Buffer.from(await respuesta.arrayBuffer());
    const [nuevo] = await bucket.file(referencia.slice(PREFIJO_GCS.length)).download();

    const hashViejo = sha256(viejo);
    const hashNuevo = sha256(nuevo);

    if (hashViejo === hashNuevo) {
      console.log(`  = ${clave}: idéntico (${viejo.length} bytes)`);
      iguales++;
    } else {
      console.log(
        `  X ${clave}: DISTINTO — original ${viejo.length}b/${hashViejo.slice(0, 12)}, ` +
          `copia ${nuevo.length}b/${hashNuevo.slice(0, 12)}`,
      );
      distintos++;
    }
  }

  console.log(`\n  Idénticos:      ${iguales}`);
  console.log(`  Distintos:      ${distintos}`);
  console.log(`  No comprobados: ${noComprobados}`);
  console.log(
    distintos === 0
      ? "\nTodas las copias verificadas coinciden con el original.\n"
      : "\nHAY DIFERENCIAS: no borres nada de Vercel Blob.\n",
  );

  await cerrar();
  if (distintos > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Error al comparar:", error);
  process.exit(1);
});
