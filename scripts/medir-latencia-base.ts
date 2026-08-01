/**
 * Latencia pura de red hacia Turso, sin lógica de consulta.
 *
 * Sirve para separar dos cosas que las mediciones de medir-rendimiento.ts
 * mezclan: cuánto tarda la red en ida y vuelta hasta Turso desde este equipo
 * (irrelevante para producción, porque Vercel no corre desde aquí) y cuánto
 * tarda realmente la base en resolver la consulta (lo único que sí viaja con
 * el código a producción).
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@libsql/client/web";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  console.log("\n10 consultas triviales seguidas (SELECT 1), una por una:\n");
  const tiempos: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    await client.execute("SELECT 1");
    const ms = performance.now() - t0;
    tiempos.push(ms);
    console.log(`  intento ${i + 1}: ${ms.toFixed(1)} ms`);
  }

  const promedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
  const minimo = Math.min(...tiempos);
  console.log(`\nPromedio: ${promedio.toFixed(1)} ms   Mínimo: ${minimo.toFixed(1)} ms`);
  console.log(
    "\nEsto es casi puramente el viaje de ida y vuelta por HTTP hasta Turso" +
      "\ndesde este equipo — no hay consulta real de por medio. Cualquier" +
      "\nmedición de las páginas reales que se acerque a este número está" +
      "\nlimitada por la red, no por el trabajo que hace la base.\n",
  );
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
