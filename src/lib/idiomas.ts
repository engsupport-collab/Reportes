/**
 * Idiomas de la interfaz.
 *
 * Traduce **la aplicación**, no su contenido: los botones, los menús y los
 * rótulos cambian de idioma, pero el texto que escriben los operarios en los
 * reportes —proyecto, cliente, detalles— se guarda y se muestra tal cual.
 * Traducir eso automáticamente sería reescribir un registro de trabajo que
 * puede tener valor probatorio.
 *
 * Este archivo no depende del servidor: lo usan el selector del navegador, la
 * validación y la carga de diccionarios. Duplicarlo obligaría a acordarse de
 * tocarlo en varios sitios al añadir un idioma.
 */

export const IDIOMAS = ["es", "en", "pt"] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const IDIOMA_POR_DEFECTO: Idioma = "es";

/**
 * Cada idioma se nombra en sí mismo, no traducido.
 *
 * Quien tiene la aplicación en un idioma que no entiende necesita reconocer el
 * suyo para salir de ahí; "Portugués" no le sirve a quien solo lee portugués,
 * "Português" sí.
 */
export const NOMBRES_IDIOMA: Record<Idioma, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
};

/** Etiqueta corta para el botón del selector. */
export const CODIGOS_IDIOMA: Record<Idioma, string> = {
  es: "ES",
  en: "EN",
  pt: "PT",
};

export function esIdiomaValido(valor: string): valor is Idioma {
  return (IDIOMAS as readonly string[]).includes(valor);
}

/**
 * Cookie de solo preferencia de idioma, aparte de la cookie de sesión.
 *
 * Guardarlo así, y no dentro del JWT, evita dos problemas: cambiar de idioma
 * no obliga a volver a firmar la sesión, y /login puede leerlo antes de que
 * exista ninguna sesión — así recuerda el idioma incluso para quien todavía no
 * ha entrado. La base de datos (`users.locale`) sigue siendo la que manda: al
 * iniciar sesión, esta cookie se vuelve a escribir con el valor de la cuenta,
 * así que no puede quedarse desincronizada entre un navegador y otro.
 */
export const IDIOMA_COOKIE = "idioma";

/**
 * Región para dar formato a fechas y números.
 *
 * El español va anclado a Colombia porque es donde se usa el sistema: cambia
 * el orden de la fecha y el separador de miles frente a otras variantes. Los
 * viáticos siguen siendo pesos colombianos en los tres idiomas — cambia cómo
 * se escribe la cifra, no la moneda.
 */
export const REGION: Record<Idioma, string> = {
  es: "es-CO",
  en: "en-US",
  pt: "pt-BR",
};
