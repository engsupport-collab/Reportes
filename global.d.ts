import type es from "./messages/es.json";

/**
 * Tipa las claves de traducción contra el diccionario en español.
 *
 * Así `useTranslations("nav")` y `t("panle")` (con la errata) marcan error de
 * TypeScript en vez de imprimir la clave sin traducir en producción. El
 * español es la fuente de verdad: los otros dos diccionarios se comprueban en
 * tiempo de ejecución, no aquí, por si alguna vez se desincronizan.
 */
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof es;
  }
}
