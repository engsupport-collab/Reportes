import "server-only";

import { headers } from "next/headers";

/**
 * IP del cliente que hace la petición.
 *
 * Vive en su propio módulo, separado de src/lib/rate-limit.ts, porque
 * `next/headers` solo existe dentro de Next.js. Manteniendo la lógica de
 * bloqueo libre de esa dependencia, se puede probar con un script normal
 * (ver scripts/test-rate-limit.ts) en vez de tener que levantar la aplicación
 * y hacer clic cinco veces.
 *
 * En Vercel, `x-forwarded-for` lo reescribe la propia plataforma, así que no se
 * puede falsificar desde fuera. Se prefiere `x-vercel-forwarded-for` cuando
 * está, y de `x-forwarded-for` se toma la primera entrada, que es el cliente.
 *
 * En desarrollo local no hay proxy y no llega ninguna cabecera; se usa una
 * etiqueta fija para que el mecanismo igual se pueda probar en el navegador.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();

  const vercelIp = h.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0]!.trim();

  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return "local";
}
