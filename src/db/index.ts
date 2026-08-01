import "server-only";

import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Cliente de Turso y de Drizzle.
 *
 * Se usa deliberadamente el build `/web` del cliente (basado en fetch) en vez
 * del build de Node: no arrastra el paquete de WebSockets ni el binding nativo
 * de sqlite3, así que el bundle de la función es más pequeño y arranca antes.
 * Combinado con una URL https:// de Turso, cada consulta es una petición HTTP
 * suelta, sin handshake previo. Ver PLAN.md, sección 7.1.
 *
 * En desarrollo, Next.js recarga los módulos en cada cambio; el cliente se
 * guarda en globalThis para no crear uno nuevo en cada recarga.
 */
function createDbClient() {
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDbClient>;

const globalForDb = globalThis as unknown as { db?: Db };

export const db = globalForDb.db ?? createDbClient();

if (env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export { schema };
