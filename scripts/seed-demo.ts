/**
 * Datos de prueba para desarrollo.
 *
 *   npm run seed:demo            -> un empleado y ~10 reportes
 *   npm run seed:demo -- 2000    -> volumen para medir rendimiento (fase 9)
 *
 * Crea reportes de dos autores distintos, para poder comprobar que un empleado
 * no alcanza los reportes de otro. Nunca debe ejecutarse contra producción.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { reportTags, reports, userCompanies, users } from "../src/db/schema";
import { ETIQUETAS_TRABAJO, TIPOS_SERVICIO } from "../src/lib/etiquetas";
import { parseFechaISO } from "../src/lib/fechas";
import { hashPassword } from "../src/lib/password";

/** Fecha de calendario N días atrás, anclada igual que la del formulario. */
function fechaDiasAtras(dias: number): Date {
  const d = new Date(Date.now() - dias * 86_400_000);
  return parseFechaISO(d.toISOString().slice(0, 10))!;
}

const EMPLEADO = {
  username: "camilo",
  password: "empleado2026",
  fullName: "Camilo Restrepo",
};

const PROYECTOS = [
  "Mantenimiento planta norte",
  "Instalación eléctrica bodega 3",
  "Revisión de bombas hidráulicas",
  "Cambio de rodamientos línea 2",
  "Calibración de sensores",
  "Reparación de banda transportadora",
  "Montaje de tablero de control",
  "Inspección de tanques",
];

const CLIENTES = [
  "Industrias del Valle S.A.",
  "Alimentos Andinos",
  "Textiles Monserrate",
  "Cementos del Río",
];

function elegir<T>(lista: T[], i: number): T {
  return lista[i % lista.length]!;
}

async function main() {
  const cantidad = Number(process.argv[2]) || 10;

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const db = drizzle(client);

  // --- Empleado de prueba ---
  let [empleado] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, EMPLEADO.username))
    .limit(1);

  if (!empleado) {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      username: EMPLEADO.username,
      passwordHash: await hashPassword(EMPLEADO.password),
      fullName: EMPLEADO.fullName,
      role: "empleado",
      isActive: true,
    });
    empleado = { id };
    console.log(
      `Empleado creado: ${EMPLEADO.username} / ${EMPLEADO.password}`,
    );
  } else {
    console.log(`Empleado "${EMPLEADO.username}" ya existía.`);
  }

  // Acceso a las dos empresas, para poder probar el cambio y el aislamiento.
  await db
    .insert(userCompanies)
    .values([
      { userId: empleado.id, companyId: "corp" },
      { userId: empleado.id, companyId: "saas" },
    ])
    .onConflictDoNothing();

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (!admin) throw new Error("No hay ningún admin. Corre antes npm run seed:admin.");

  // --- Reportes ---
  const ahora = Date.now();
  const filas = Array.from({ length: cantidad }, (_, i) => {
    // Uno de cada cinco reportes es del admin, para probar el aislamiento.
    const esDelAdmin = i % 5 === 4;
    // Dos de cada tres terminados; de esos, algunos quedan sin adjunto y
    // aparecen como incompletos, que es lo que hay que poder ver.
    const terminado = i % 3 !== 0;

    return {
      id: crypto.randomUUID(),
      // Se reparten entre las dos empresas para poder comprobar que al cambiar
      // de empresa cambia realmente el conjunto de datos.
      companyId: i % 2 === 0 ? "corp" : "saas",
      // Math.floor(i / 2) y no i: con i, el tipo de servicio alternaría al
      // mismo ritmo que la empresa y toda una empresa quedaría de un solo tipo,
      // lo que haría pasar los filtros por casualidad.
      serviceType: elegir(TIPOS_SERVICIO, Math.floor(i / 2)).id,
      authorId: esDelAdmin ? admin.id : empleado.id,
      projectName: `${elegir(PROYECTOS, i)} #${i + 1}`,
      purchaseOrderNo: `OC-2026-${String(1000 + i).padStart(4, "0")}`,
      clientName: elegir(CLIENTES, i),
      workDate: fechaDiasAtras(i),
      details:
        `Se realizó el trabajo programado según la orden de compra.\n\n` +
        `Observaciones: sin novedades relevantes. Equipo entregado en operación.`,
      status: (terminado ? "terminado" : "en_proceso") as
        | "terminado"
        | "en_proceso",
      completedAt: terminado ? new Date(ahora - i * 86_400_000) : null,
      createdAt: new Date(ahora - i * 86_400_000),
      updatedAt: new Date(ahora - i * 86_400_000),
    };
  });

  // Inserción por lotes: 2.000 filas en una sola sentencia excede los límites
  // de la petición HTTP a Turso.
  const LOTE = 100;
  for (let i = 0; i < filas.length; i += LOTE) {
    await db.insert(reports).values(filas.slice(i, i + LOTE));
    if (filas.length > LOTE) {
      console.log(`  insertados ${Math.min(i + LOTE, filas.length)}/${filas.length}`);
    }
  }

  // Etiquetas: una fija por posición y, en uno de cada tres, una segunda, para
  // que en las pruebas haya reportes con varias.
  const etiquetas = filas.flatMap((fila, i) => {
    const marcas = [elegir(ETIQUETAS_TRABAJO, i).id];
    if (i % 3 === 0) marcas.push(elegir(ETIQUETAS_TRABAJO, i + 1).id);
    return [...new Set(marcas)].map((tag) => ({ reportId: fila.id, tag }));
  });

  for (let i = 0; i < etiquetas.length; i += LOTE) {
    await db.insert(reportTags).values(etiquetas.slice(i, i + LOTE));
  }

  console.log(`${filas.length} reportes creados, ${etiquetas.length} etiquetas.`);
  client.close();
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
