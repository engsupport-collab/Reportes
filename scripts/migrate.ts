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
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { crearClienteScript } from "./db-cliente";
import { anunciar, cargarCredenciales } from "./entorno";

async function main() {
  const credenciales = cargarCredenciales(process.argv);
  anunciar(credenciales);

  const { db, cerrar } = await crearClienteScript(credenciales);

  console.log("Aplicando migraciones...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migraciones aplicadas correctamente.");

  await cerrar();
}

main().catch((error) => {
  console.error("Error al migrar:", error);
  process.exit(1);
});
