import "server-only";

import sharp from "sharp";

import { esPdfReal, tipoRealDeImagen } from "@/lib/archivos-firma";
import { leerArchivo } from "@/lib/storage";

/**
 * Deja los archivos de un reporte listos para entrar en su PDF.
 *
 * Un reporte puede llevar las fotos que haga falta: no hay tope de cantidad.
 * Lo que sí tiene tope es el documento, porque viaja entero por dos sitios que
 * no admiten cualquier tamaño — la descarga (Vercel no entrega una respuesta
 * de más de 4,5 MB) y el correo. Así que el límite se pone donde está de
 * verdad, en el peso del PDF, y se reparte entre las fotos:
 *
 * - Mientras caben, van a 1600 px, que es más de lo que se imprime en una hoja.
 * - Si no caben, se reducen todas por igual hasta que quepan. Con muchísimas
 *   fotos cada una va más pequeña, pero el documento siempre se puede
 *   descargar y enviar. Las originales siguen en el sistema, a su tamaño.
 *
 * Cada foto, además, se endereza. Un teléfono no gira los píxeles de una foto
 * tomada de lado: anota el giro en sus metadatos (EXIF), y un PDF no sabe
 * leer esa nota — la foto salía acostada.
 *
 * Qué es cada archivo se decide por su contenido, no por su nombre ni por el
 * tipo con el que se guardó: una foto mal etiquetada sigue siendo una foto.
 */

export type Adjunto = { id: string; blobUrl: string; fileName: string; mimeType: string };

export type AdjuntoLeido<T extends Adjunto> = { item: T; datos: Buffer | null };

export type AdjuntoPreparado<T extends Adjunto> =
  | { item: T; clase: "foto"; jpeg: Uint8Array }
  | { item: T; clase: "pdf"; bytes: Uint8Array }
  /** No entra: no se pudo leer, no es foto ni PDF, o no cabía. Se lista por nombre. */
  | { item: T; clase: "fuera" };

/**
 * Peso al que apunta el documento completo. Por debajo de los 4,5 MB de
 * Vercel con margen, porque el presupuesto se calcula sobre los archivos y el
 * PDF añade lo suyo alrededor.
 */
export const PESO_MAXIMO_PDF = 4 * 1024 * 1024;

/**
 * De mayor a menor: se usa el primero con el que todas las fotos caben. Antes
 * de achicar la foto se le baja un poco la calidad, que se nota menos. El
 * último escalón es el piso: medido con una foto real de campo (dos
 * manómetros), por debajo de 640 px los números ya cuestan y a 480 es lo
 * mínimo que todavía documenta algo.
 */
const NIVELES = [
  { lado: 1600, calidad: 80 },
  { lado: 1600, calidad: 70 },
  { lado: 1280, calidad: 72 },
  { lado: 1024, calidad: 70 },
  { lado: 800, calidad: 64 },
  { lado: 640, calidad: 56 },
  { lado: 480, calidad: 50 },
] as const;

type Nivel = (typeof NIVELES)[number];

/** Con cuántas fotos se prueba cada nivel antes de aplicarlo a todas. */
const FOTOS_DE_MUESTRA = 4;

/** Lo mínimo que se le guarda a cada foto antes de dejar entrar un PDF adjunto. */
const RESERVA_POR_FOTO = 25 * 1024;

/** Una foto así ya está como la queremos: se incrusta sin tocarla. */
const PESO_FOTO_LISTA = 450 * 1024;

const LECTURAS_A_LA_VEZ = 6;
const FOTOS_A_LA_VEZ = 2;

async function enTandas<E, S>(
  entradas: readonly E[],
  aLaVez: number,
  tarea: (entrada: E, indice: number) => Promise<S>,
): Promise<S[]> {
  const salidas = new Array<S>(entradas.length);
  let siguiente = 0;

  async function trabajar() {
    while (siguiente < entradas.length) {
      const indice = siguiente++;
      salidas[indice] = await tarea(entradas[indice]!, indice);
    }
  }

  await Promise.all(Array.from({ length: Math.min(aLaVez, entradas.length) }, trabajar));
  return salidas;
}

export async function leerAdjuntos<T extends Adjunto>(
  items: readonly T[],
): Promise<AdjuntoLeido<T>[]> {
  return enTandas(items, LECTURAS_A_LA_VEZ, async (item) => {
    const datos = await leerArchivo(item.blobUrl);
    return { item, datos: datos ? Buffer.from(datos) : null };
  });
}

/**
 * La firma del cliente, recortada a su trazo.
 *
 * Se guarda con todo el recuadro donde se firmó, que es casi todo
 * transparente. En el bloque de firmas, que es pequeño, ese vacío se comería
 * el sitio y la firma quedaría diminuta: recortada, lo que ocupa el espacio es
 * el trazo. Si no se puede recortar va como está — que la firma salga algo más
 * pequeña es mejor que quedarse sin documento.
 */
export async function recortarFirma(datos: ArrayBuffer): Promise<Uint8Array> {
  try {
    return await sharp(datos).trim().png().toBuffer();
  } catch {
    return new Uint8Array(datos);
  }
}

/** JPEG derecho, sin transparencia y con el lado mayor acotado. */
async function comoJpeg(datos: Uint8Array, nivel: Nivel): Promise<Uint8Array> {
  return sharp(datos, { failOn: "error" })
    .rotate() // sin argumentos: aplica el giro que diga el EXIF
    .resize({
      width: nivel.lado,
      height: nivel.lado,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    // mozjpeg aprieta casi un 30 % más y tarda el doble: solo se paga cuando
    // ya se está reduciendo porque no cabe.
    .jpeg({ quality: nivel.calidad, mozjpeg: nivel !== NIVELES[0] })
    .toBuffer();
}

/**
 * ¿Ya es un JPEG derecho, de tamaño razonable? Es el caso normal de una foto
 * subida desde la aplicación, que la reduce antes de enviarla: volver a
 * comprimirla solo le quitaría calidad.
 */
async function yaEstaLista(datos: Buffer): Promise<boolean> {
  if (datos.length > PESO_FOTO_LISTA) return false;
  const meta = await sharp(datos, { failOn: "error" }).metadata();
  return (
    meta.format === "jpeg" &&
    (meta.orientation ?? 1) === 1 &&
    Math.max(meta.width ?? 0, meta.height ?? 0) <= NIVELES[0].lado &&
    (meta.space === "srgb" || meta.space === "b-w")
  );
}

function pesoDe(fotos: readonly (Uint8Array | null)[]): number {
  return fotos.reduce((suma, f) => suma + (f?.length ?? 0), 0);
}

async function reducirTodas(
  fotos: readonly (Uint8Array | null)[],
  nivel: Nivel,
): Promise<(Uint8Array | null)[]> {
  return enTandas(fotos, FOTOS_A_LA_VEZ, async (foto) => {
    if (!foto) return null;
    try {
      return await comoJpeg(foto, nivel);
    } catch {
      return null;
    }
  });
}

/**
 * El nivel más alto con el que estas fotos caben en `disponible`.
 *
 * No se calcula con una tabla: cuánto adelgaza una foto al reducirla depende
 * de lo que tenga dentro. Se prueba cada nivel con unas pocas, repartidas a lo
 * largo del reporte, y lo que pesen ellas se proyecta sobre el total.
 */
async function elegirNivel(
  fotos: readonly (Uint8Array | null)[],
  disponible: number,
): Promise<number> {
  const presentes = fotos.filter((f): f is Uint8Array => f !== null);
  const paso = Math.max(1, Math.floor(presentes.length / FOTOS_DE_MUESTRA));
  const muestra = presentes.filter((_, i) => i % paso === 0).slice(0, FOTOS_DE_MUESTRA);
  const pesoTotal = pesoDe(presentes);
  const pesoMuestra = pesoDe(muestra);

  for (let nivel = 1; nivel < NIVELES.length - 1; nivel++) {
    const reducidas = await reducirTodas(muestra, NIVELES[nivel]!);
    const proyectado = pesoTotal * (pesoDe(reducidas) / pesoMuestra);
    if (proyectado <= disponible * 0.93) return nivel;
  }
  return NIVELES.length - 1;
}

/**
 * Reparte `presupuesto` bytes entre los adjuntos ya leídos. Devuelve uno por
 * cada entrada, en el mismo orden.
 */
export async function prepararAdjuntos<T extends Adjunto>(
  leidos: readonly AdjuntoLeido<T>[],
  presupuesto: number,
): Promise<AdjuntoPreparado<T>[]> {
  const clases = leidos.map(({ item, datos }) => {
    if (!datos) return "fuera" as const;
    if (esPdfReal(datos)) return "pdf" as const;
    // El tipo guardado cuenta solo como pista para intentarlo: quien decide
    // si de verdad es una imagen es `sharp`, al abrirla.
    if (tipoRealDeImagen(datos) || item.mimeType.startsWith("image/")) return "foto" as const;
    return "fuera" as const;
  });

  // Primera pasada: cada foto al nivel más alto (o tal cual, si ya lo está).
  let fotos: (Uint8Array | null)[] = await enTandas(leidos, FOTOS_A_LA_VEZ, async ({ datos }, i) => {
    if (clases[i] !== "foto" || !datos) return null;
    try {
      return (await yaEstaLista(datos)) ? datos : await comoJpeg(datos, NIVELES[0]);
    } catch {
      return null; // dañada, o un formato que no se sabe abrir (HEIC)
    }
  });

  const cuantasFotos = fotos.filter(Boolean).length;

  // Los PDF adjuntos no se pueden reducir: entran, en orden, mientras dejen
  // sitio para que cada foto conserve al menos lo mínimo.
  const pdfQueEntra = new Set<number>();
  let pesoPdfs = 0;
  for (const [i, { datos }] of leidos.entries()) {
    if (clases[i] !== "pdf" || !datos) continue;
    if (pesoPdfs + datos.length + cuantasFotos * RESERVA_POR_FOTO <= presupuesto) {
      pdfQueEntra.add(i);
      pesoPdfs += datos.length;
    }
  }

  const paraFotos = presupuesto - pesoPdfs;

  if (pesoDe(fotos) > paraFotos) {
    // Se va al nivel que la muestra dice que cabe, y de ahí se baja de uno en
    // uno mientras el peso real, ya con todas, diga que todavía no.
    const primeraPasada = fotos;
    for (let nivel = await elegirNivel(primeraPasada, paraFotos); nivel < NIVELES.length; nivel++) {
      fotos = await reducirTodas(primeraPasada, NIVELES[nivel]!);
      if (pesoDe(fotos) <= paraFotos) break;
    }

    // Ni al mínimo: son cientos. Entran las que quepan, en orden; las demás se
    // listan. El documento sale igual, que es lo que no puede fallar.
    let acumulado = 0;
    fotos = fotos.map((foto) => {
      if (!foto) return null;
      if (acumulado + foto.length > paraFotos) return null;
      acumulado += foto.length;
      return foto;
    });
  }

  return leidos.map(({ item, datos }, i): AdjuntoPreparado<T> => {
    const foto = fotos[i];
    if (foto) return { item, clase: "foto", jpeg: foto };
    if (pdfQueEntra.has(i) && datos) return { item, clase: "pdf", bytes: datos };
    return { item, clase: "fuera" };
  });
}
