/**
 * Verificación del contenido real de un archivo.
 *
 * El tipo que llega en la subida (`file.type`) lo declara el navegador: quien
 * envía la petición puede escribir lo que quiera. Comprobar solo ese valor y la
 * extensión no sirve de nada frente a alguien que lo hace a propósito — basta
 * con renombrar un ejecutable a .pdf y declararlo como application/pdf.
 *
 * Esto mira los primeros bytes del archivo, que son los que de verdad
 * identifican el formato.
 *
 * Para los documentos se comprueba que coincidan con lo declarado. Para las
 * imágenes se hace al revés: se pregunta qué son y se guardan como eso, diga
 * lo que diga el nombre. El navegador también se equivoca sin mala intención
 * — Safari, cuando se le pide convertir una foto a WebP, devuelve un PNG sin
 * avisar — y rechazar una foto válida por una etiqueta mal puesta deja a
 * alguien en campo sin poder registrar su trabajo.
 */

function empiezaCon(bytes: Uint8Array, firma: number[], desde = 0): boolean {
  if (bytes.length < desde + firma.length) return false;
  return firma.every((b, i) => bytes[desde + i] === b);
}

function textoEn(bytes: Uint8Array, desde: number, largo: number): string {
  return String.fromCharCode(...bytes.slice(desde, desde + largo));
}

/** Documento OLE2: .doc y .xls antiguos comparten esta cabecera. */
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** ZIP: .docx y .xlsx son archivos comprimidos por dentro. */
const ZIP = [0x50, 0x4b, 0x03, 0x04];

/**
 * Marcas de un HEIC/HEIF. La cabecera "ftyp" sola no alcanza: la comparten
 * los videos MP4 y MOV, que no son fotos.
 */
const MARCAS_HEIC = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

const VERIFICADORES = {
  "application/pdf": (b: Uint8Array) => empiezaCon(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  "image/jpeg": (b: Uint8Array) => empiezaCon(b, [0xff, 0xd8, 0xff]),
  "image/png": (b: Uint8Array) =>
    empiezaCon(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": (b: Uint8Array) =>
    textoEn(b, 0, 4) === "RIFF" && textoEn(b, 8, 4) === "WEBP",
  "image/heic": (b: Uint8Array) =>
    textoEn(b, 4, 4) === "ftyp" && MARCAS_HEIC.includes(textoEn(b, 8, 4)),
  "application/msword": (b: Uint8Array) => empiezaCon(b, OLE2),
  "application/vnd.ms-excel": (b: Uint8Array) => empiezaCon(b, OLE2),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
    b: Uint8Array,
  ) => empiezaCon(b, ZIP),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (
    b: Uint8Array,
  ) => empiezaCon(b, ZIP),
} satisfies Record<string, (b: Uint8Array) => boolean>;

/** Las cabeceras que interesan caben de sobra en los primeros bytes. */
function cabecera(datos: ArrayBuffer | Uint8Array): Uint8Array {
  return datos instanceof Uint8Array
    ? datos.subarray(0, 32)
    : new Uint8Array(datos.slice(0, 32));
}

/**
 * ¿El contenido corresponde al tipo declarado?
 *
 * Devuelve false si el tipo no está entre los aceptados, de modo que un tipo
 * desconocido nunca pasa por no tener verificador.
 */
export function contenidoCoincide(
  datos: ArrayBuffer | Uint8Array,
  mimeType: string,
): boolean {
  const verificador = (VERIFICADORES as Record<string, (b: Uint8Array) => boolean>)[
    mimeType
  ];
  if (!verificador) return false;

  return verificador(cabecera(datos));
}

const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export type TipoDeImagen = (typeof IMAGENES)[number];

/** Con qué extensión se guarda cada imagen, una vez se sabe qué es. */
export const EXTENSION_DE_IMAGEN: Record<TipoDeImagen, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

/**
 * Qué imagen es de verdad, por su contenido. Null si no es ninguna de las que
 * el sistema acepta — incluido cuando no es una imagen en absoluto.
 */
export function tipoRealDeImagen(
  datos: ArrayBuffer | Uint8Array,
): TipoDeImagen | null {
  const bytes = cabecera(datos);
  return IMAGENES.find((tipo) => VERIFICADORES[tipo](bytes)) ?? null;
}

export function esPdfReal(datos: ArrayBuffer | Uint8Array): boolean {
  return VERIFICADORES["application/pdf"](cabecera(datos));
}
