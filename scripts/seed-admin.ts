/**
 * Crea la primera cuenta de administrador.
 *
 *   npm run seed:admin
 *
 * El sistema no tiene registro público — por diseño, es parte del requisito de
 * que no pueda ser manipulado por cualquiera. Este script es la única forma de
 * crear el primer admin; a partir de ahí, ese admin crea las demás cuentas
 * desde el panel.
 *
 * Es idempotente: si el usuario ya existe, avisa y no hace nada.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { eq } from "drizzle-orm";

import { crearClienteScript } from "./db-cliente";
import { anunciar, cargarCredenciales } from "./entorno";
import { users } from "../src/db/schema";
import { PASSWORD_MIN_LENGTH, hashPassword } from "../src/lib/password";

async function main() {
  // Por `cargarCredenciales` y no leyendo process.env a mano: así este script
  // también funciona contra una base directa (`DATABASE_URL`), que es como lo
  // levanta CI, sin una segunda versión del mismo código.
  const credenciales = cargarCredenciales(process.argv);
  const username = process.env.SEED_ADMIN_USERNAME?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const fullName = process.env.SEED_ADMIN_FULLNAME?.trim() || "Administrador";

  if (!username || !password) {
    throw new Error(
      "Faltan SEED_ADMIN_USERNAME o SEED_ADMIN_PASSWORD en .env.local.",
    );
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }

  anunciar(credenciales);
  const { db, cerrar } = await crearClienteScript(credenciales);

  const existente = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existente.length > 0) {
    console.log(
      `El usuario "${username}" ya existe. No se hizo ningún cambio.`,
    );
    await cerrar();
    return;
  }

  await db.insert(users).values({
    id: crypto.randomUUID(),
    username,
    passwordHash: await hashPassword(password),
    fullName,
    role: "admin",
    isActive: true,
  });

  console.log(`Administrador "${username}" creado correctamente.`);
  console.log(
    "Ahora borra SEED_ADMIN_PASSWORD de .env.local y cambia la contraseña desde la aplicación.",
  );

  await cerrar();
}

main().catch((error) => {
  console.error("Error al crear el administrador:", error);
  process.exit(1);
});
