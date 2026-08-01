import "server-only";

import { del, put } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Almacenamiento de archivos.
 *
 * En producción usa Vercel Blob. En desarrollo, si no hay token configurado,
 * guarda en una carpeta local: así se puede construir y probar toda la subida,
 * la validación y la descarga sin depender de una cuenta ni de una conexión.
 * El resto de la aplicación no sabe cuál de los dos está activo.
 *
 * Lo que se guarda en la base es la referencia que devuelven estas funciones,
 * nunca una ruta armada con el nombre que escribió el usuario.
 */

const PREFIJO_LOCAL = "local:";
const CARPETA_LOCAL = path.join(process.cwd(), ".uploads");

function usandoBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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

  if (usandoBlob()) {
    const { url } = await put(`reportes/${nombreInterno}`, datos, {
      access: "public",
      contentType: opciones.contentType,
      // Sufijo aleatorio: la URL resulta imposible de adivinar. Aun así nunca
      // se entrega al navegador — las descargas pasan por /api/archivos/[id],
      // que comprueba permisos primero.
      addRandomSuffix: true,
    });
    return url;
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

    await del(referencia);
  } catch {
    // Si el archivo ya no está, la fila igual debe poder borrarse: dejar un
    // registro apuntando a un archivo inexistente es peor que no borrar nada.
  }
}
