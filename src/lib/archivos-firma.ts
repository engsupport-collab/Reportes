/**
 * Verificación del contenido real de un archivo.
 *
 * El tipo que llega en la subida (`file.type`) lo declara el navegador: quien
 * envía la petición puede escribir lo que quiera. Comprobar solo ese valor y la
 * extensión no sirve de nada frente a alguien que lo hace a propósito — basta
 * con renombrar un ejecutable a .pdf y declararlo como application/pdf.
 *
 * Esto mira los primeros bytes del archivo, que son los que de verdad
 * identifican el formato, y comprueba que coincidan con lo declarado.
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

const VERIFICADORES: Record<string, (b: Uint8Array) => boolean> = {
  "application/pdf": (b) => empiezaCon(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  "image/jpeg": (b) => empiezaCon(b, [0xff, 0xd8, 0xff]),
  "image/png": (b) =>
    empiezaCon(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": (b) =>
    textoEn(b, 0, 4) === "RIFF" && textoEn(b, 8, 4) === "WEBP",
  "image/heic": (b) => textoEn(b, 4, 4) === "ftyp",
  "application/msword": (b) => empiezaCon(b, OLE2),
  "application/vnd.ms-excel": (b) => empiezaCon(b, OLE2),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
    b,
  ) => empiezaCon(b, ZIP),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) =>
    empiezaCon(b, ZIP),
};

/**
 * ¿El contenido corresponde al tipo declarado?
 *
 * Devuelve false si el tipo no está entre los aceptados, de modo que un tipo
 * desconocido nunca pasa por no tener verificador.
 */
export function contenidoCoincide(
  datos: ArrayBuffer,
  mimeType: string,
): boolean {
  const verificador = VERIFICADORES[mimeType];
  if (!verificador) return false;

  // Las cabeceras que interesan caben de sobra en los primeros bytes.
  return verificador(new Uint8Array(datos.slice(0, 32)));
}
