import { AuthTypes, Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/db/schema";
import type { Credenciales } from "./entorno";

/**
 * Cliente de PostgreSQL para los scripts de una sola vez (seed, migrate, test,
 * medir-*). A diferencia de `src/db/index.ts` —pensado para vivir todo el
 * tiempo que dure una función serverless—, aquí hace falta poder cerrar la
 * conexión al terminar: sin `cerrar()`, el proceso de Node se queda colgado
 * esperando a que el pool se cierre solo.
 *
 * Tiene los mismos dos modos que `src/db/index.ts`: conexión directa por
 * cadena cuando la hay (el PostgreSQL efímero de CI) y conector de Cloud SQL
 * en cualquier otro caso. Así las migraciones y las semillas funcionan igual
 * en CI que en local, sin una segunda versión de cada script.
 */
export async function crearClienteScript(cred: Credenciales) {
  if (cred.connectionString) {
    const pool = new Pool({ connectionString: cred.connectionString, max: 3 });
    const db = drizzle(pool, { schema });
    return { db, pool, cerrar: () => pool.end() };
  }

  const connector = new Connector();
  const opciones = await connector.getOptions({
    instanceConnectionName: cred.instanceConnectionName,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.PASSWORD,
  });

  const pool = new Pool({
    ...opciones,
    user: cred.user,
    password: cred.password,
    database: cred.database,
    max: 3,
  });

  const db = drizzle(pool, { schema });

  async function cerrar() {
    await pool.end();
    connector.close();
  }

  return { db, pool, cerrar };
}
