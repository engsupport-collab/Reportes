/**
 * Aplica las migraciones pendientes a la base de datos configurada.
 *
 *   npm run db:generate   -> genera el SQL en ./drizzle a partir del esquema
 *   npm run db:migrate    -> lo aplica a Turso
 *
 * Se usa un script propio en vez de `drizzle-kit migrate` para que el mismo
 * comando sirva en local y en el despliegue, leyendo las variables de entorno
 * de la misma forma en ambos casos.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN. Copia .env.example a .env.local y complétalo.",
    );
  }

  const client = createClient({ url, authToken });
  const db = drizzle(client);

  console.log("Aplicando migraciones...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migraciones aplicadas correctamente.");

  client.close();
}

main().catch((error) => {
  console.error("Error al migrar:", error);
  process.exit(1);
});
