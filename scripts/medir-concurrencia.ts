/**
 * ¿El cliente de Turso ejecuta consultas paralelas de verdad, o las encola?
 *
 * `obtenerResumen()` lanza 9 consultas con `Promise.all`, esperando que
 * corran concurrentes y que el tiempo total sea el de la más lenta, no la
 * suma de todas. Esto lo comprueba con una consulta trivial, para aislar el
 * comportamiento del cliente del costo de las consultas reales.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@libsql/client/web";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  // Calentar la conexión (TLS/handshake) antes de medir, para no mezclar ese
  // costo fijo con lo que se quiere observar aquí.
  await client.execute("SELECT 1");

  console.log("\n9 consultas SECUENCIALES (una espera a la otra):\n");
  let t0 = performance.now();
  for (let i = 0; i < 9; i++) await client.execute("SELECT 1");
  const secuencial = performance.now() - t0;
  console.log(`  total: ${secuencial.toFixed(1)} ms`);

  console.log("\n9 consultas CONCURRENTES (Promise.all, como obtenerResumen):\n");
  t0 = performance.now();
  await Promise.all(Array.from({ length: 9 }, () => client.execute("SELECT 1")));
  const concurrente = performance.now() - t0;
  console.log(`  total: ${concurrente.toFixed(1)} ms`);

  console.log(
    `\nSi fueran genuinamente concurrentes, el segundo número debería ser` +
      `\ncercano a 1/9 del primero, no a la mitad ni igual.` +
      `\nRazón: ${(secuencial / concurrente).toFixed(1)}x más rápido en paralelo` +
      ` (9x sería ideal).\n`,
  );
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
