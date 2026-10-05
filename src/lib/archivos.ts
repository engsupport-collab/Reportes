/**
 * Reglas de los archivos adjuntos.
 *
 * Sin dependencias de servidor, para que el navegador use exactamente los
 * mismos límites que el servidor y el usuario reciba el error antes de esperar
 * una subida que iba a ser rechazada. La validación del servidor es la que
 * manda: la del cliente es una cortesía y se puede saltar.
 */

/**
 * Lista blanca de tipos permitidos.
 *
 * Es lista blanca y no lista negra a propósito: con una lista negra, cualquier
 * formato peligroso que no se haya previsto entra por defecto.
 */
export const TIPOS_PERMITIDOS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
};

export const EXTENSIONES_PERMITIDAS = Object.values(TIPOS_PERMITIDOS).flat();

/**
 * Lo que ofrece el selector de archivos del teléfono.
 *
 * Las fotos van como `image/*` y no extensión por extensión, por dos motivos.
 * El iPhone guarda en HEIC, que casi nada fuera de Apple sabe abrir, y Safari
 * decide qué entregar según esta lista: con `.heic` en ella, desde Safari 17
 * puede incluso convertir a HEIC una foto que era JPEG. Pidiendo imágenes en
 * general entrega JPEG. Y como toda foto se vuelve a guardar en JPEG antes de
 * subirla (`imagen-cliente.ts`), sirve cualquier imagen que el navegador
 * pueda abrir, no solo tres formatos.
 */
export const ACEPTAR_EN_SELECTOR = [
  "image/*",
  ...EXTENSIONES_PERMITIDAS.filter((ext) => !ext.match(/^\.(jpe?g|png|webp|heic)$/)),
].join(",");

/**
 * 4 MB por archivo.
 *
 * El límite no es arbitrario: en Vercel, el cuerpo de una petición a una
 * función no puede pasar de 4,5 MB, y la subida viaja por ahí. Por eso cada
 * archivo viaja en su propia petición. Las fotos se reducen en el navegador
 * antes de enviarse, así que este límite se les mide ya reducidas —pesan unos
 * cientos de kilobytes— y nunca sobre la original, que en un teléfono actual
 * lo pasa casi siempre. En la práctica solo lo tocan los PDF grandes. Si más
 * adelante hacen falta archivos mayores, hay que pasar a subida directa del
 * navegador al almacenamiento, que evita ese límite.
 *
 * No hay tope de cuántos archivos lleva un reporte.
 */
export const MAX_BYTES = 4 * 1024 * 1024;

/** Lado mayor al que se reduce una foto antes de subirla. */
export const LADO_MAXIMO = 1600;
/** Lado mayor de la miniatura que se muestra en las listas. */
export const LADO_MINIATURA = 320;

export function esImagen(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto === -1 ? "" : nombre.slice(punto).toLowerCase();
}

/**
 * ¿Es una foto, según el navegador? Mira también la extensión: hay
 * selectores de archivos que entregan un HEIC sin decir de qué tipo es.
 */
export function pareceFoto(archivo: { name: string; type: string }): boolean {
  return (
    esImagen(archivo.type) ||
    /^\.(jpe?g|png|webp|heic|heif|gif|bmp)$/.test(extensionDe(archivo.name))
  );
}

/**
 * Limpia el nombre de archivo antes de guardarlo.
 *
 * Este nombre solo se usa para mostrarlo y para la descarga: el archivo real se
 * guarda con un identificador generado en el servidor. Aun así se sanea, porque
 * termina en una cabecera HTTP y en el disco de quien descarga.
 */
export function sanearNombre(nombre: string): string {
  return (
    nombre
      .replace(/[\\/]/g, "_") // separadores de ruta
      .replace(/\p{Cc}/gu, "") // caracteres de control
      .replace(/^\.+/, "") // nombres ocultos y ".."
      .trim()
      .slice(0, 120) || "archivo"
  );
}

/**
 * Nombre con el que se descarga o se adjunta el PDF de un reporte.
 *
 * Solo letras sin tilde, cifras y guiones: termina en una cabecera HTTP y en
 * un adjunto de correo, y ninguno de los dos admite cualquier carácter. La
 * tilde se le quita a la letra en vez de cambiar la letra entera por un guion
 * ("técnico" queda "tecnico", no "t-cnico").
 *
 * La palabra con la que empieza va en el idioma del documento: es lo primero
 * que el cliente ve del adjunto, antes de abrirlo.
 */
export function nombreDelPdf(proyecto: string, idioma: "es" | "en" = "es"): string {
  const base = proyecto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");

  return idioma === "en"
    ? `report-${base || "service"}.pdf`
    : `reporte-${base || "servicio"}.pdf`;
}

export type ResultadoValidacion = { ok: true } | { ok: false; error: string };

export function validarArchivo(archivo: {
  name: string;
  type: string;
  size: number;
}): ResultadoValidacion {
  if (archivo.size === 0) {
    return { ok: false, error: `"${archivo.name}" está vacío.` };
  }

  if (archivo.size > MAX_BYTES) {
    return {
      ok: false,
      error: `"${archivo.name}" pesa más de ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
    };
  }

  const extensiones = TIPOS_PERMITIDOS[archivo.type];
  if (!extensiones) {
    return {
      ok: false,
      error: `El tipo de "${archivo.name}" no está permitido. Se aceptan: ${EXTENSIONES_PERMITIDAS.join(", ")}.`,
    };
  }

  // Se comprueban tipo Y extensión: un ejecutable renombrado a .pdf declara un
  // tipo que no coincide con su extensión, y al revés.
  if (!extensiones.includes(extensionDe(archivo.name))) {
    return {
      ok: false,
      error: `La extensión de "${archivo.name}" no coincide con su contenido.`,
    };
  }

  return { ok: true };
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
