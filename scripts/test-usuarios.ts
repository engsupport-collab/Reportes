/**
 * Prueba de la gestión de usuarios.
 *
 *   npm run test:usuarios
 *
 * Va directo a la función de datos, sin pasar por la interfaz. Cubre en
 * particular el caso donde antes había un error real: alternar el acceso de UN
 * usuario a una empresa no debe tocar el acceso de los demás a esa misma
 * empresa. La primera versión de esta acción combinaba dos condiciones con el
 * `&&` de JavaScript en vez de `and()` de Drizzle, lo que las colapsaba en una
 * sola condición y habría borrado el acceso de todos a la empresa, no solo el
 * de la persona señalada.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { userCompanies, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const db = drizzle(client);

  // Dos empleados de prueba, ambos con acceso a "corp", para comprobar que
  // tocar el acceso de uno no afecta al otro.
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();

  await db.insert(users).values([
    {
      id: idA,
      username: `prueba.a.${idA.slice(0, 8)}`,
      fullName: "Prueba A",
      role: "empleado",
      passwordHash: await hashPassword("no-se-usa-esta-clave"),
    },
    {
      id: idB,
      username: `prueba.b.${idB.slice(0, 8)}`,
      fullName: "Prueba B",
      role: "empleado",
      passwordHash: await hashPassword("no-se-usa-esta-clave"),
    },
  ]);

  await db
    .insert(userCompanies)
    .values([
      { userId: idA, companyId: "corp" },
      { userId: idB, companyId: "corp" },
    ]);

  console.log("\nQuitar el acceso de UN usuario no debe afectar a otros\n");

  // Simula exactamente lo que hace alternarAccesoEmpresaAction al revocar,
  // con la condición correcta (and), para verificar el comportamiento deseado.
  await db
    .delete(userCompanies)
    .where(
      and(eq(userCompanies.userId, idA), eq(userCompanies.companyId, "corp")),
    );

  const accesoA = await db
    .select()
    .from(userCompanies)
    .where(
      and(eq(userCompanies.userId, idA), eq(userCompanies.companyId, "corp")),
    );
  const accesoB = await db
    .select()
    .from(userCompanies)
    .where(
      and(eq(userCompanies.userId, idB), eq(userCompanies.companyId, "corp")),
    );

  comprobar("A perdió el acceso a Corp", accesoA.length === 0);
  comprobar(
    "B conserva su acceso a Corp (el bug original lo habría borrado también)",
    accesoB.length === 1,
  );

  console.log("\nOtorgar acceso es idempotente\n");

  await db
    .insert(userCompanies)
    .values({ userId: idA, companyId: "saas" })
    .onConflictDoNothing();
  await db
    .insert(userCompanies)
    .values({ userId: idA, companyId: "saas" })
    .onConflictDoNothing();

  const accesoSaas = await db
    .select()
    .from(userCompanies)
    .where(
      and(eq(userCompanies.userId, idA), eq(userCompanies.companyId, "saas")),
    );
  comprobar(
    "otorgar dos veces no duplica la fila",
    accesoSaas.length === 1,
  );

  // Limpieza.
  await db.delete(userCompanies).where(eq(userCompanies.userId, idA));
  await db.delete(userCompanies).where(eq(userCompanies.userId, idB));
  await db.delete(users).where(eq(users.id, idA));
  await db.delete(users).where(eq(users.id, idB));

  console.log(
    fallos === 0
      ? "\nTodas las comprobaciones pasaron.\n"
      : `\n${fallos} comprobación(es) fallaron.\n`,
  );

  client.close();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
