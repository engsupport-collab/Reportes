import "server-only";

import { AuthTypes, Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { prepararCredencialesGoogle } from "@/lib/google-credenciales";
import * as schema from "./schema";

/**
 * Cliente de Cloud SQL (PostgreSQL) y de Drizzle.
 *
 * La conexión pasa por el conector oficial de Google
 * (`@google-cloud/cloud-sql-connector`), que autentica con la cuenta de
 * servicio vía IAM y cifra el túnel con mTLS — la instancia no tiene IP
 * pública abierta a cualquiera ni depende de que Vercel tenga una IP fija
 * que poner en una lista blanca (no la tiene).
 *
 * El pool se mantiene deliberadamente pequeño (máx. 3): cada instancia de
 * función serverless de Vercel abre su propio pool, y Cloud SQL tiene un
 * límite total de conexiones — un pool grande por instancia agotaría ese
 * límite en cuanto Vercel escale a varias instancias a la vez.
 *
 * En desarrollo, Next.js recarga los módulos en cada cambio; el cliente se
 * guarda en globalThis para no crear uno nuevo (ni un pool nuevo) en cada
 * recarga.
 */
async function createDbClient() {
  prepararCredencialesGoogle();

  const connector = new Connector();
  const opciones = await connector.getOptions({
    instanceConnectionName: env.DB_INSTANCE_CONNECTION_NAME,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.PASSWORD,
  });

  const pool = new Pool({
    ...opciones,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    max: 3,
  });

  return drizzle(pool, { schema });
}

type Db = Awaited<ReturnType<typeof createDbClient>>;

const globalForDb = globalThis as unknown as { db?: Db };

export const db = globalForDb.db ?? (await createDbClient());

if (env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export { schema };
