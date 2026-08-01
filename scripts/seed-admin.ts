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

import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { users } from "../src/db/schema";
import { PASSWORD_MIN_LENGTH, hashPassword } from "../src/lib/password";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const username = process.env.SEED_ADMIN_USERNAME?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const fullName = process.env.SEED_ADMIN_FULLNAME?.trim() || "Administrador";

  if (!url || !authToken) {
    throw new Error(
      "Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN. Copia .env.example a .env.local y complétalo.",
    );
  }
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

  const client = createClient({ url, authToken });
  const db = drizzle(client);

  const existente = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existente.length > 0) {
    console.log(
      `El usuario "${username}" ya existe. No se hizo ningún cambio.`,
    );
    client.close();
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

  client.close();
}

main().catch((error) => {
  console.error("Error al crear el administrador:", error);
  process.exit(1);
});
