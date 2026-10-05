import {
  MAX_BYTES,
  TIPOS_PERMITIDOS,
  esImagen,
  extensionDe,
  sanearNombre,
  validarArchivo,
} from "@/lib/archivos";
import {
  EXTENSION_DE_IMAGEN,
  contenidoCoincide,
  tipoRealDeImagen,
} from "@/lib/archivos-firma";

/**
 * Qué se guarda de un archivo recién subido, una vez comprobado.
 *
 * Es la comprobación que manda: la del navegador es una cortesía y se puede
 * saltar. La comparten los adjuntos de un reporte y los recibos de viáticos.
 */
export type ArchivoAceptado = {
  datos: ArrayBuffer;
  /** El tipo real, que para una foto puede no ser el que declaró el navegador. */
  mimeType: string;
  extension: string;
  /** El nombre que verá la gente, ya saneado. */
  fileName: string;
  sizeBytes: number;
};

type Resultado =
  | { ok: true; archivo: ArchivoAceptado }
  | { ok: false; error: string };

export async function aceptarArchivo(archivo: File): Promise<Resultado> {
  if (archivo.size === 0) {
    return { ok: false, error: `"${archivo.name}" está vacío.` };
  }
  if (archivo.size > MAX_BYTES) {
    return {
      ok: false,
      error: `"${archivo.name}" pesa más de ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
    };
  }

  const datos = await archivo.arrayBuffer();

  // Una foto se acepta por lo que es, no por cómo se llama. Rechazar una
  // imagen válida porque su nombre dice otro formato no protege de nada —lo
  // que se guarda es el contenido, con el tipo que de verdad tiene— y deja a
  // alguien en campo sin poder subir su trabajo.
  const imagen = tipoRealDeImagen(datos);
  if (imagen) {
    const extensionDada = extensionDe(archivo.name);
    const fileName = TIPOS_PERMITIDOS[imagen]?.includes(extensionDada)
      ? archivo.name
      : `${archivo.name.replace(/\.[^.]+$/, "") || "foto"}${EXTENSION_DE_IMAGEN[imagen]}`;

    return {
      ok: true,
      archivo: {
        datos,
        mimeType: imagen,
        extension: EXTENSION_DE_IMAGEN[imagen],
        fileName: sanearNombre(fileName),
        sizeBytes: archivo.size,
      },
    };
  }

  // No es una imagen: tiene que ser un documento de los permitidos, y aquí sí
  // tiene que coincidir todo —tipo declarado, extensión y contenido—. Es donde
  // un ejecutable renombrado a .pdf queda fuera.
  const validacion = validarArchivo({
    name: archivo.name,
    type: archivo.type,
    size: archivo.size,
  });
  if (!validacion.ok) return validacion;

  if (esImagen(archivo.type) || !contenidoCoincide(datos, archivo.type)) {
    return {
      ok: false,
      error: `El contenido de "${archivo.name}" no corresponde a su extensión.`,
    };
  }

  return {
    ok: true,
    archivo: {
      datos,
      mimeType: archivo.type,
      extension: extensionDe(archivo.name),
      fileName: sanearNombre(archivo.name),
      sizeBytes: archivo.size,
    },
  };
}

/** Una miniatura de 320 px pesa unos 15 KB; esto es un techo holgado. */
const MAX_MINIATURA_BYTES = 300 * 1024;

/**
 * La miniatura que el navegador manda junto a una foto. Si falta o no sirve
 * no pasa nada: la lista muestra un icono en su lugar.
 */
export async function aceptarMiniatura(
  valor: FormDataEntryValue | null | undefined,
): Promise<{ datos: ArrayBuffer; mimeType: string; extension: string } | null> {
  if (!(valor instanceof File) || valor.size === 0 || valor.size > MAX_MINIATURA_BYTES) {
    return null;
  }

  const datos = await valor.arrayBuffer();
  const tipo = tipoRealDeImagen(datos);
  if (tipo !== "image/jpeg" && tipo !== "image/webp") return null;

  return { datos, mimeType: tipo, extension: EXTENSION_DE_IMAGEN[tipo] };
}
