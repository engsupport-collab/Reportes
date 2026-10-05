import {
  LADO_MAXIMO,
  LADO_MINIATURA,
  MAX_BYTES,
  pareceFoto,
} from "./archivos";

/**
 * Reducción de imágenes en el navegador, antes de subirlas.
 *
 * Una foto de celular pesa entre 3 y 12 MB. Diez fotos son decenas de megas
 * que hay que subir por datos móviles, guardar, y volver a descargar cada vez
 * que alguien abre la lista. Reducidas a 1600 px quedan en unos cientos de
 * kilobytes sin pérdida visible para documentar un trabajo.
 *
 * Se hace aquí y no en el servidor porque así el archivo grande nunca llega a
 * viajar por la red — y no podría: Vercel no recibe una petición de más de
 * 4,5 MB, que es menos de lo que pesa una sola foto de un teléfono actual.
 *
 * Toda foto sale de aquí como JPEG. Antes salía como WebP, que pesa algo
 * menos, pero Safari no sabe escribirlo: cuando se le pide, devuelve un PNG
 * sin avisar. El código daba por hecho que era WebP, lo etiquetaba así y el
 * servidor lo rechazaba — ninguna foto reducida entraba desde un iPhone. JPEG
 * lo escriben igual todos los navegadores.
 */

const CALIDAD = 0.82;
const CALIDAD_MINIATURA = 0.7;

/** Lo que el servidor acepta como foto sin haber pasado por aquí. */
const SE_PUEDE_SUBIR_TAL_CUAL = ["image/jpeg", "image/png", "image/webp"];

/**
 * La foto no se pudo reducir, y tal como está tampoco se puede subir: o el
 * navegador no sabe abrir ese formato, o pesa más de lo que cabe en un envío.
 */
export class FotoNoProcesable extends Error {
  constructor(readonly motivo: "formato" | "tamano") {
    super(`No se pudo preparar la foto (${motivo}).`);
    this.name = "FotoNoProcesable";
  }
}

type Abierta = {
  fuente: CanvasImageSource;
  ancho: number;
  alto: number;
  cerrar: () => void;
};

/**
 * Abre la foto ya derecha. Los dos caminos respetan la orientación que el
 * teléfono anota en los metadatos (EXIF): sin eso, las fotos tomadas en
 * vertical se subirían acostadas.
 */
async function abrir(archivo: File): Promise<Abierta> {
  try {
    const bitmap = await createImageBitmap(archivo, {
      imageOrientation: "from-image",
    });
    return {
      fuente: bitmap,
      ancho: bitmap.width,
      alto: bitmap.height,
      cerrar: () => bitmap.close(),
    };
  } catch {
    // Segundo intento, por el camino que usa el navegador para mostrar
    // cualquier imagen: a veces abre lo que `createImageBitmap` no.
    const url = URL.createObjectURL(archivo);
    try {
      const imagen = new Image();
      imagen.src = url;
      await imagen.decode();
      return {
        fuente: imagen,
        ancho: imagen.naturalWidth,
        alto: imagen.naturalHeight,
        cerrar: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}

function dibujar(
  fuente: CanvasImageSource,
  anchoOrigen: number,
  altoOrigen: number,
  ladoMaximo: number,
): HTMLCanvasElement {
  const escala = Math.min(1, ladoMaximo / Math.max(anchoOrigen, altoOrigen));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(anchoOrigen * escala));
  canvas.height = Math.max(1, Math.round(altoOrigen * escala));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no entregó un lienzo para dibujar.");

  // JPEG no tiene transparencia: sin este fondo, lo transparente de un PNG
  // saldría negro.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);

  return canvas;
}

/**
 * El lienzo como JPEG. Se comprueba lo que el navegador devolvió de verdad en
 * vez de dar por hecho que fue lo pedido: ese supuesto es el fallo que se
 * describe arriba.
 */
function comoJpeg(canvas: HTMLCanvasElement, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob && blob.type === "image/jpeg" ? blob : null),
      "image/jpeg",
      calidad,
    ),
  );
}

/** Safari guarda la memoria de un lienzo hasta que se le quita el tamaño. */
function soltar(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

async function reducir(archivo: File): Promise<{ grande: Blob; mini: Blob | null }> {
  const abierta = await abrir(archivo);
  try {
    const lienzoGrande = dibujar(abierta.fuente, abierta.ancho, abierta.alto, LADO_MAXIMO);
    try {
      const grande = await comoJpeg(lienzoGrande, CALIDAD);
      if (!grande) throw new Error("El navegador no devolvió un JPEG.");

      // La miniatura sale de la foto ya reducida, no de la original: así la
      // original, que es la que ocupa memoria, se abre una sola vez.
      const lienzoMini = dibujar(
        lienzoGrande,
        lienzoGrande.width,
        lienzoGrande.height,
        LADO_MINIATURA,
      );
      try {
        return { grande, mini: await comoJpeg(lienzoMini, CALIDAD_MINIATURA) };
      } finally {
        soltar(lienzoMini);
      }
    } finally {
      soltar(lienzoGrande);
    }
  } finally {
    abierta.cerrar();
  }
}

export type ArchivoPreparado = {
  archivo: File;
  miniatura: File | null;
};

/**
 * Deja un archivo listo para subir.
 *
 * Si es una foto, devuelve su versión reducida más una miniatura. Si es PDF o
 * documento, lo devuelve tal cual: comprimirlos rompería el contenido.
 *
 * Si la foto no se puede reducir, se sube la original siempre que el servidor
 * la vaya a aceptar: una foto grande subida es mejor que un trabajo sin
 * registrar. Si ni eso, lanza `FotoNoProcesable` para que quien llama lo
 * explique — subirla solo serviría para que la rechace el servidor.
 */
export async function prepararArchivo(archivo: File): Promise<ArchivoPreparado> {
  if (!pareceFoto(archivo)) return { archivo, miniatura: null };

  try {
    const { grande, mini } = await reducir(archivo);
    const base = archivo.name.replace(/\.[^.]+$/, "") || "foto";

    return {
      archivo: new File([grande], `${base}.jpg`, { type: "image/jpeg" }),
      miniatura: mini ? new File([mini], `${base}-mini.jpg`, { type: "image/jpeg" }) : null,
    };
  } catch {
    if (!SE_PUEDE_SUBIR_TAL_CUAL.includes(archivo.type)) {
      throw new FotoNoProcesable("formato");
    }
    if (archivo.size > MAX_BYTES) {
      throw new FotoNoProcesable("tamano");
    }
    return { archivo, miniatura: null };
  }
}
