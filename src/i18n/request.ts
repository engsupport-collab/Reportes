import "server-only";

import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { esIdiomaValido, IDIOMA_COOKIE, IDIOMA_POR_DEFECTO } from "@/lib/idiomas";

/**
 * De dónde sale el idioma de cada petición.
 *
 * No hay enrutado por idioma (`/en/reportes`), así que `requestLocale` —lo
 * que next-intl completaría a partir del segmento `[locale]` de la URL—
 * siempre llega vacío aquí. Se resuelve a mano, en dos pasos:
 *
 *   1. La cookie `idioma`, que guarda tanto la preferencia de una sesión
 *      iniciada (la escribe la acción del selector) como la de alguien que
 *      todavía no ha entrado — así /login también respeta lo último elegido.
 *   2. Si no hay cookie, el español por defecto.
 *
 * No se consulta la base de datos aquí a propósito: este archivo se ejecuta
 * en cada petición que renderiza algo, y ya hay guards (`requireUser`, etc.)
 * que hacen esa consulta más abajo en el árbol. Duplicarla aquí sería una
 * segunda ida a la base solo para saber el idioma.
 */
export default getRequestConfig(async () => {
  const valorCookie = (await cookies()).get(IDIOMA_COOKIE)?.value;
  const locale =
    valorCookie && esIdiomaValido(valorCookie)
      ? valorCookie
      : IDIOMA_POR_DEFECTO;

  const mensajes = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages: mensajes };
});
