/**
 * Vuelca el contenido completo de la base de Turso a archivos JSON locales.
 *
 *   npm run respaldar:turso            -> dev
 *   npm run respaldar:turso -- --prod  -> prod
 *
 * Se ejecuta una sola vez, antes de dar de baja Turso. Es lo que convierte
 * "borrar la base vieja" en algo reversible: si dentro de un mes aparece un
 * dato que no cuadra, este volcado sigue ahí para consultarlo.
 *
 * Escribe **fuera** del repositorio a propósito — son datos reales de clientes
 * y no tienen por qué acabar en un commit por descuido.
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TABLAS = [
  "companies",
  "users",
  "user_companies",
  "clients",
  "quote_sequences",
  "quotes",
  "reports",
  "report_events",
  "report_tags",
  "attachments",
  "report_viaticos",
  "login_attempts",
];

const DESTINO_BASE = "C:/cursor/respaldos-reportes";

async function main() {
  const esProduccion = process.argv.includes("--prod");
  const archivoEnv = esProduccion ? ".env.prod" : ".env.local";
  config({ path: archivoEnv, override: true });

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error(
      `Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN en ${archivoEnv}.`,
    );
  }

  const etiqueta = esProduccion ? "prod" : "dev";
  const fecha = new Date().toISOString().slice(0, 10);
  const destino = join(DESTINO_BASE, `turso-${etiqueta}-${fecha}`);
  mkdirSync(destino, { recursive: true });

  console.log(`\n  ORIGEN:  ${url}`);
  console.log(`  DESTINO: ${destino}`);
  if (esProduccion) console.log("  *** PRODUCCIÓN ***");
  console.log("");

  const turso = createClient({ url, authToken });
  const resumen: Record<string, number> = {};

  for (const tabla of TABLAS) {
    try {
      const res = await turso.execute(`SELECT * FROM ${tabla}`);
      const filas = res.rows.map((fila) => Object.fromEntries(Object.entries(fila)));
      writeFileSync(
        join(destino, `${tabla}.json`),
        JSON.stringify(filas, null, 2),
        "utf8",
      );
      resumen[tabla] = filas.length;
      console.log(`  ${tabla}: ${filas.length} filas`);
    } catch (error) {
      console.log(`  ${tabla}: NO SE PUDO LEER (${(error as Error).message})`);
      resumen[tabla] = -1;
    }
  }

  writeFileSync(
    join(destino, "_resumen.json"),
    JSON.stringify(
      { origen: url, entorno: etiqueta, fecha: new Date().toISOString(), filas: resumen },
      null,
      2,
    ),
    "utf8",
  );

  turso.close();
  console.log(`\nRespaldo completo en ${destino}\n`);
}

main().catch((error) => {
  console.error("Error al respaldar:", error);
  process.exit(1);
});
