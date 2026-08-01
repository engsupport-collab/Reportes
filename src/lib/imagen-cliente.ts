import {
  LADO_MAXIMO,
  LADO_MINIATURA,
  esImagen,
} from "./archivos";

/**
 * Reducción de imágenes en el navegador, antes de subirlas.
 *
 * Una foto de celular pesa entre 3 y 5 MB. Diez fotos son 40 MB que hay que
 * subir por datos móviles, guardar, y volver a descargar cada vez que alguien
 * abre la lista. Reducidas a 1600 px quedan en unos cientos de kilobytes sin
 * pérdida visible para documentar un trabajo.
 *
 * Se hace aquí y no en el servidor porque procesar imágenes en el servidor
 * exige `sharp`, una dependencia pesada que aumentaría el arranque en frío de
 * todas las peticiones — justo lo que se intentó evitar en la sección 7.1 del
 * plan. Además así el archivo grande nunca llega a viajar por la red.
 */

async function dibujarEscalado(
  archivo: File,
  ladoMaximo: number,
  calidad: number,
): Promise<Blob | null> {
  // createImageBitmap respeta la orientación EXIF: sin esto, las fotos tomadas
  // en vertical con el celular se suben acostadas.
  const bitmap = await createImageBitmap(archivo, {
    imageOrientation: "from-image",
  });

  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }

  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/webp", calidad),
  );
}

export type ArchivoPreparado = {
  archivo: File;
  miniatura: File | null;
};

/**
 * Deja un archivo listo para subir.
 *
 * Si es imagen, devuelve una versión reducida más una miniatura. Si es PDF o
 * documento, lo devuelve tal cual: comprimirlos rompería el contenido.
 *
 * Ante cualquier problema al procesar, se devuelve el original. Un archivo
 * grande subido es mejor que un error que impide registrar el trabajo.
 */
export async function prepararArchivo(
  archivo: File,
): Promise<ArchivoPreparado> {
  if (!esImagen(archivo.type) || archivo.type === "image/heic") {
    return { archivo, miniatura: null };
  }

  try {
    const [grande, mini] = await Promise.all([
      dibujarEscalado(archivo, LADO_MAXIMO, 0.82),
      dibujarEscalado(archivo, LADO_MINIATURA, 0.7),
    ]);

    if (!grande) return { archivo, miniatura: null };

    const base = archivo.name.replace(/\.[^.]+$/, "");

    return {
      // Solo se reemplaza si de verdad quedó más liviano.
      archivo:
        grande.size < archivo.size
          ? new File([grande], `${base}.webp`, { type: "image/webp" })
          : archivo,
      miniatura: mini
        ? new File([mini], `${base}-mini.webp`, { type: "image/webp" })
        : null,
    };
  } catch {
    return { archivo, miniatura: null };
  }
}
