/**
 * Aplica las migraciones pendientes a la base de datos configurada.
 *
 *   npm run db:generate         -> genera el SQL en ./drizzle a partir del esquema
 *   npm run db:migrate          -> lo aplica a la base de desarrollo
 *   npm run db:migrate -- --prod -> lo aplica a producción (lee .env.prod)
 *
 * Se usa un script propio en vez de `drizzle-kit migrate` para que el mismo
 * comando sirva en local y en el despliegue, leyendo las credenciales de la
 * misma forma en ambos casos.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { anunciar, cargarCredenciales } from "./entorno";

async function main() {
  const credenciales = cargarCredenciales(process.argv);
  anunciar(credenciales);

  const { url, authToken } = credenciales;
  const client = createClient({ url, authToken });
  const db = drizzle(client);

  // drizzle-orm@0.45.2 trae un bug real en su migrador de libsql: la tabla de
  // control usa "id SERIAL PRIMARY KEY", sintaxis de Postgres que algunos
  // servidores de Turso rechazan. Se crea antes, con sintaxis de SQLite, para
  // que el CREATE TABLE IF NOT EXISTS del migrador la encuentre ya creada y
  // nunca llegue a ejecutar la sentencia con el error.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  console.log("Aplicando migraciones...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migraciones aplicadas correctamente.");

  client.close();
}

main().catch((error) => {
  console.error("Error al migrar:", error);
  process.exit(1);
});
