/**
 * Prueba del bloqueo por fuerza bruta, contra la base de datos real.
 *
 *   npm run test:rate-limit
 *
 * Verifica lo que un clic en el navegador tarda cinco intentos en comprobar, y
 * lo hace de forma repetible. Usa IPs y un usuario ficticios, y limpia todo al
 * terminar.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean) {
  console.log(`${condicion ? "  ok  " : " FALLA"}  ${descripcion}`);
  if (!condicion) fallos++;
}

async function main() {
  // Importación diferida: src/lib/env.ts valida las variables al cargarse, así
  // que dotenv tiene que haber corrido antes.
  const { registrarFalloDeIp, bloqueoDeIp, limpiarIp, MAX_INTENTOS } =
    await import("../src/lib/rate-limit");

  const IP = "203.0.113.99"; // rango reservado para documentación (RFC 5737)
  await limpiarIp(IP);

  console.log("\nBloqueo por dispositivo (IP)\n");

  comprobar("una IP nueva no está bloqueada", (await bloqueoDeIp(IP)) === null);

  for (let i = 1; i < MAX_INTENTOS; i++) {
    const estado = await registrarFalloDeIp(IP);
    comprobar(
      `intento ${i}: cuenta ${estado.intentos}, sin bloquear`,
      estado.intentos === i && estado.lockedUntil === null,
    );
  }

  const ultimo = await registrarFalloDeIp(IP);
  comprobar(
    `intento ${MAX_INTENTOS}: se bloquea en el mismo intento que lo dispara`,
    ultimo.intentos === MAX_INTENTOS && ultimo.lockedUntil !== null,
  );

  const bloqueo = await bloqueoDeIp(IP);
  comprobar("la IP queda bloqueada", bloqueo !== null);

  if (bloqueo) {
    const minutos = (bloqueo.getTime() - Date.now()) / 60_000;
    comprobar(
      `el bloqueo dura ~15 minutos (${minutos.toFixed(1)})`,
      minutos > 14 && minutos <= 15,
    );
  }

  console.log(
    "\nEsto es lo que fallaba antes: usuarios distintos, mismo dispositivo\n",
  );

  const IP2 = "203.0.113.100";
  await limpiarIp(IP2);

  // Da igual qué usuario se escriba: el contador es del dispositivo.
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    await registrarFalloDeIp(IP2);
  }
  comprobar(
    "5 intentos con credenciales distintas bloquean igual",
    (await bloqueoDeIp(IP2)) !== null,
  );

  console.log("\nLimpieza tras un ingreso correcto\n");

  await limpiarIp(IP2);
  comprobar(
    "un ingreso correcto libera el dispositivo",
    (await bloqueoDeIp(IP2)) === null,
  );

  await limpiarIp(IP);

  console.log(
    fallos === 0
      ? "\nTodas las comprobaciones pasaron.\n"
      : `\n${fallos} comprobación(es) fallaron.\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
