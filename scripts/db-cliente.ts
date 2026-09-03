import { AuthTypes, Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/db/schema";
import type { Credenciales } from "./entorno";

/**
 * Cliente de Cloud SQL para los scripts de una sola vez (seed, migrate, test,
 * medir-*). A diferencia de `src/db/index.ts` —pensado para vivir todo el
 * tiempo que dure una función serverless—, aquí hace falta poder cerrar la
 * conexión al terminar: sin `cerrar()`, el proceso de Node se queda colgado
 * esperando a que el pool se cierre solo.
 */
export async function crearClienteScript(cred: Credenciales) {
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
