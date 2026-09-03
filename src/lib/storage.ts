import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { Storage } from "@google-cloud/storage";

import { env } from "@/lib/env";
import { prepararCredencialesGoogle } from "@/lib/google-credenciales";

/**
 * Almacenamiento de archivos.
 *
 * En producción usa Cloud Storage, con el bucket en acceso privado — la app
 * nunca entrega la URL del objeto al navegador, las descargas siempre pasan
 * por /api/archivos/[id] (y equivalentes), que comprueba permisos antes de
 * leer el archivo del lado del servidor. En desarrollo, si no hay bucket
 * configurado, guarda en una carpeta local: así se puede construir y probar
 * toda la subida, la validación y la descarga sin depender de una cuenta ni
 * de una conexión. El resto de la aplicación no sabe cuál de los dos está
 * activo.
 *
 * Lo que se guarda en la base es la referencia que devuelven estas funciones,
 * nunca una ruta armada con el nombre que escribió el usuario.
 */

const PREFIJO_LOCAL = "local:";
const PREFIJO_GCS = "gcs:";
const CARPETA_LOCAL = path.join(process.cwd(), ".uploads");

function usandoGCS(): boolean {
  return Boolean(env.GCS_BUCKET_NAME);
}

/**
 * El cliente de Cloud Storage sí se puede construir de forma síncrona y
 * perezosa (a diferencia del conector de Cloud SQL): no autentica nada hasta
 * la primera llamada real a la API, así que no hace falta el mismo `await` de
 * nivel superior que tiene `src/db/index.ts`.
 */
let storageClient: Storage | undefined;

function bucket() {
  if (!storageClient) {
    prepararCredencialesGoogle();
    storageClient = new Storage();
  }
  return storageClient.bucket(env.GCS_BUCKET_NAME!);
}

/**
 * Guarda el archivo y devuelve su referencia.
 *
 * El nombre real se genera aquí, en el servidor, con un identificador
 * aleatorio. El nombre que escribió el usuario no interviene en la ruta: así no
 * hay forma de escapar de la carpeta con "../" ni de sobrescribir el archivo de
 * otro reporte adivinando su nombre.
 */
export async function guardarArchivo(
  datos: ArrayBuffer,
  opciones: { contentType: string; extension: string },
): Promise<string> {
  const nombreInterno = `${crypto.randomUUID()}${opciones.extension}`;

  if (usandoGCS()) {
    const objectName = `reportes/${nombreInterno}`;
    await bucket()
      .file(objectName)
      .save(Buffer.from(datos), { contentType: opciones.contentType });
    return `${PREFIJO_GCS}${objectName}`;
  }

  await mkdir(CARPETA_LOCAL, { recursive: true });
  await writeFile(
    path.join(CARPETA_LOCAL, nombreInterno),
    Buffer.from(datos),
  );
  return `${PREFIJO_LOCAL}${nombreInterno}`;
}

export async function leerArchivo(
  referencia: string,
): Promise<ArrayBuffer | null> {
  try {
    if (referencia.startsWith(PREFIJO_LOCAL)) {
      const nombre = referencia.slice(PREFIJO_LOCAL.length);

      // El nombre viene de la base, pero se comprueba igual: si alguna vez se
      // guardara un valor con "/" o "..", esto impide leer fuera de la carpeta.
      if (nombre.includes("/") || nombre.includes("\\") || nombre.includes("..")) {
        return null;
      }

      const buffer = await readFile(path.join(CARPETA_LOCAL, nombre));
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
    }

    if (referencia.startsWith(PREFIJO_GCS)) {
      const objectName = referencia.slice(PREFIJO_GCS.length);
      const [buffer] = await bucket().file(objectName).download();
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
    }

    // Referencia de una URL completa (legado de Vercel Blob, o cualquier otra
    // http/https) — se conserva este camino por si queda alguna sin migrar.
    const res = await fetch(referencia);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function borrarArchivo(referencia: string): Promise<void> {
  try {
    if (referencia.startsWith(PREFIJO_LOCAL)) {
      const nombre = referencia.slice(PREFIJO_LOCAL.length);
      if (nombre.includes("/") || nombre.includes("\\") || nombre.includes("..")) {
        return;
      }
      await unlink(path.join(CARPETA_LOCAL, nombre));
      return;
    }

    if (referencia.startsWith(PREFIJO_GCS)) {
      const objectName = referencia.slice(PREFIJO_GCS.length);
      await bucket().file(objectName).delete();
      return;
    }

    // Referencia de URL completa (legado) — nada que borrar por este camino;
    // ver el comentario equivalente en `leerArchivo`.
  } catch {
    // Si el archivo ya no está, la fila igual debe poder borrarse: dejar un
    // registro apuntando a un archivo inexistente es peor que no borrar nada.
  }
}
