/**
 * Prueba de la firma.
 *
 *   npm run dev         (en otra terminal)
 *   npm run test:firma
 *
 * Lo que se comprueba es que la imagen de la firma esté tan protegida como el
 * resto del reporte: es lo que le da valor como constancia del trabajo, así que
 * no puede quedar accesible a quien no debe verla.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { reports, users } from "../src/db/schema";
import { contenidoCoincide } from "../src/lib/archivos-firma";
import { SESSION_COOKIE, signSession } from "../src/lib/session";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

/** PNG mínimo válido: cabecera de 8 bytes. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  .buffer;
/** SVG: se puede abrir en un navegador y ejecutar scripts. No debe pasar. */
const SVG = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>")
  .buffer;

async function main() {
  console.log("\nValidación del formato de la firma\n");

  comprobar("un PNG de verdad se acepta", contenidoCoincide(PNG, "image/png"));
  comprobar(
    "un SVG disfrazado de PNG se RECHAZA",
    !contenidoCoincide(SVG, "image/png"),
  );

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const db = drizzle(client);

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  const [empleado] = await db
    .select()
    .from(users)
    .where(eq(users.role, "empleado"))
    .limit(1);

  // Se firma un reporte del admin directamente en la base, para poder probar
  // el acceso a la imagen sin depender de dibujar en un navegador.
  const [reporteAdmin] = await db
    .select({ id: reports.id, companyId: reports.companyId })
    .from(reports)
    .where(eq(reports.authorId, admin!.id))
    .limit(1);

  const empresa = reporteAdmin!.companyId;

  const [reporteEmpleado] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(eq(reports.authorId, empleado!.id), eq(reports.companyId, empresa)),
    )
    .limit(1);

  await db
    .update(reports)
    .set({
      signatureUrl: "local:firma-de-prueba-inexistente.png",
      signatureName: "Responsable de prueba",
      signedAt: new Date(),
    })
    .where(eq(reports.id, reporteAdmin!.id));

  // `emp` es opcional a propósito: un admin real nunca lleva `empresa` en la
  // sesión. Solo se pasa para las cookies de empleado, donde sí es obligatoria.
  function cookie(
    userRow: typeof admin,
    role: "admin" | "empleado",
    emp?: string,
  ) {
    return signSession({
      sub: userRow!.id,
      username: userRow!.username,
      name: userRow!.fullName,
      role,
      empresa: emp,
    });
  }

  async function pedirFirma(reportId: string, token?: string) {
    const res = await fetch(`${BASE}/api/firmas/${reportId}`, {
      headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
      redirect: "manual",
    });
    return res.status;
  }

  console.log("\nAcceso a la imagen de la firma\n");

  comprobar(
    "sin sesión -> 401",
    (await pedirFirma(reporteAdmin!.id)) === 401,
  );

  comprobar(
    "un empleado NO ve la firma de un reporte ajeno -> 403",
    (await pedirFirma(
      reporteAdmin!.id,
      await cookie(empleado, "empleado", empresa),
    )) === 403,
  );

  // El admin no elige empresa y no la necesita: ve la firma de cualquier
  // reporte, de cualquier empresa. Se firma la cookie sin `empresa`, tal como
  // la produce el login real para este rol.
  const estadoAdmin = await pedirFirma(
    reporteAdmin!.id,
    await cookie(admin, "admin"),
  );
  comprobar(
    `el admin pasa la comprobación de permisos sin haber elegido empresa (el reporte es de "${empresa}")`,
    estadoAdmin === 404,
    `${estadoAdmin} — 404 porque la imagen de prueba no existe en disco`,
  );

  if (reporteEmpleado) {
    comprobar(
      "un reporte sin firmar responde 404, no una imagen vacía",
      (await pedirFirma(
        reporteEmpleado.id,
        await cookie(empleado, "empleado", empresa),
      )) === 404,
    );
  }

  // Se deja el reporte como estaba.
  await db
    .update(reports)
    .set({ signatureUrl: null, signatureName: null, signedAt: null })
    .where(eq(reports.id, reporteAdmin!.id));

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
