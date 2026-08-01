/**
 * Prueba de control de acceso, por HTTP contra el servidor de desarrollo.
 *
 *   npm run dev          (en otra terminal)
 *   npm run test:acceso
 *
 * Firma cookies de sesión válidas para cada rol y pide las páginas como lo
 * haría un navegador. Es la única forma de comprobar de verdad que un empleado
 * no llega al reporte de otro: revisar el código no basta, y hacerlo a mano en
 * el navegador no es repetible.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { reports, users } from "../src/db/schema";
import { SESSION_COOKIE, signSession } from "../src/lib/session";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

async function pedir(ruta: string, cookie?: string) {
  const res = await fetch(`${BASE}${ruta}`, {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

async function main() {
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

  if (!admin || !empleado) {
    throw new Error("Faltan usuarios. Corre npm run seed:admin y npm run seed:demo.");
  }

  const [reporteAdmin] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(eq(reports.authorId, admin.id))
    .limit(1);
  const [reporteEmpleado] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.authorId, empleado.id)))
    .limit(1);

  if (!reporteAdmin || !reporteEmpleado) {
    throw new Error("Faltan reportes de prueba. Corre npm run seed:demo.");
  }

  // La empresa del reporte del empleado es la que se usa como "empresa activa":
  // así las comprobaciones de acceso propio se hacen dentro de su empresa.
  const [reporteEmpleadoCompleto] = await db
    .select({ companyId: reports.companyId })
    .from(reports)
    .where(eq(reports.id, reporteEmpleado.id))
    .limit(1);
  const empresaActiva = reporteEmpleadoCompleto!.companyId;
  const otraEmpresa = empresaActiva === "corp" ? "saas" : "corp";

  // Un reporte del propio empleado, pero en la OTRA empresa.
  const [reporteOtraEmpresa] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.authorId, empleado.id),
        eq(reports.companyId, otraEmpresa),
      ),
    )
    .limit(1);

  // Sin `empresa`: un admin real nunca la lleva en la sesión. El login jamás
  // se la asigna, y no hay pantalla donde pueda elegirla. Si esta prueba le
  // pusiera una, estaría simulando una sesión que el sistema no produce.
  const cookieAdmin = await signSession({
    sub: admin.id,
    username: admin.username,
    name: admin.fullName,
    role: "admin",
  });
  const cookieEmpleado = await signSession({
    sub: empleado.id,
    username: empleado.username,
    name: empleado.fullName,
    role: "empleado",
    empresa: empresaActiva,
  });
  const cookieSinEmpresa = await signSession({
    sub: empleado.id,
    username: empleado.username,
    name: empleado.fullName,
    role: "empleado",
  });

  console.log("\nSin sesión\n");

  let r = await pedir("/reportes");
  comprobar("/reportes redirige al login", r.status === 307, `${r.status}`);

  r = await pedir("/reportes", "token-inventado");
  comprobar(
    "una cookie con firma inválida no sirve",
    r.status === 307 && r.location.includes("/login"),
    `${r.status}`,
  );

  console.log("\nEmpleado\n");

  r = await pedir(`/reportes/${reporteEmpleado.id}`, cookieEmpleado);
  comprobar("puede ver su propio reporte", r.status === 200, `${r.status}`);

  r = await pedir(`/reportes/${reporteAdmin.id}`, cookieEmpleado);
  comprobar(
    "NO puede ver el reporte de otra persona",
    r.status === 404,
    `${r.status}`,
  );

  r = await pedir(`/reportes/${reporteAdmin.id}/editar`, cookieEmpleado);
  comprobar(
    "NO puede abrir la edición del reporte ajeno",
    r.status === 404,
    `${r.status}`,
  );

  r = await pedir("/admin", cookieEmpleado);
  comprobar(
    "NO entra a /admin escribiendo la URL",
    r.status === 307 && r.location.includes("/reportes"),
    `${r.status} -> ${r.location}`,
  );

  r = await pedir("/admin/reportes", cookieEmpleado);
  comprobar(
    "NO entra a /admin/reportes",
    r.status === 307 && r.location.includes("/reportes") && !r.location.includes("/admin"),
    `${r.status} -> ${r.location}`,
  );

  r = await pedir("/admin/usuarios", cookieEmpleado);
  comprobar(
    "NO entra a /admin/usuarios",
    r.status === 307,
    `${r.status} -> ${r.location}`,
  );

  console.log("\nAdministrador\n");

  r = await pedir("/admin", cookieAdmin);
  comprobar("entra al panel", r.status === 200, `${r.status}`);

  r = await pedir(`/reportes/${reporteEmpleado.id}`, cookieAdmin);
  comprobar(
    "puede ver el reporte de un empleado",
    r.status === 200,
    `${r.status}`,
  );

  r = await pedir("/admin/reportes", cookieAdmin);
  comprobar("entra a la lista global", r.status === 200, `${r.status}`);

  r = await pedir("/admin/usuarios", cookieAdmin);
  comprobar(
    "entra a la gestión de usuarios",
    r.status === 200,
    `${r.status}`,
  );

  // El admin no elige empresa: nunca debe caer en el selector, ni de entrada
  // ni si escribe la URL a mano.
  r = await pedir("/", cookieAdmin);
  comprobar(
    "la raíz lo manda directo a /admin, sin pasar por /empresas",
    r.status === 307 && r.location.includes("/admin") && !r.location.includes("/empresas"),
    `${r.status} -> ${r.location}`,
  );

  r = await pedir("/empresas", cookieAdmin);
  comprobar(
    "visitar /empresas a mano lo redirige a /admin, no le muestra el selector",
    r.status === 307 && r.location.includes("/admin"),
    `${r.status} -> ${r.location}`,
  );

  // "Mis reportes" es un concepto de empleado. El admin usa /admin/reportes.
  r = await pedir("/reportes", cookieAdmin);
  comprobar(
    "/reportes lo redirige a /admin/reportes, no intenta resolver una empresa activa",
    r.status === 307 && r.location.includes("/admin/reportes"),
    `${r.status} -> ${r.location}`,
  );

  // El filtro de empresa en la lista global es una URL, no una sesión: pasar
  // ?empresa=<x> tiene que seguir respondiendo 200, no requerir haber elegido
  // nada de antemano.
  r = await pedir(`/admin/reportes?empresa=${empresaActiva}`, cookieAdmin);
  comprobar(
    `/admin/reportes?empresa=${empresaActiva} responde 200 (filtro por URL)`,
    r.status === 200,
    `${r.status}`,
  );

  console.log("\nAislamiento entre empresas\n");

  r = await pedir("/reportes", cookieSinEmpresa);
  comprobar(
    "sin empresa elegida se va al selector",
    r.status === 307 && r.location.includes("/empresas"),
    `${r.status} -> ${r.location}`,
  );

  if (reporteOtraEmpresa) {
    r = await pedir(`/reportes/${reporteOtraEmpresa.id}`, cookieEmpleado);
    comprobar(
      `estando en "${empresaActiva}" NO ve su propio reporte de "${otraEmpresa}"`,
      r.status === 404,
      `${r.status}`,
    );

    // El admin no tiene empresa activa: ve las dos siempre. Este es el punto
    // central del rediseño — antes daba 404 aquí, ahora tiene que dar 200.
    r = await pedir(`/reportes/${reporteOtraEmpresa.id}`, cookieAdmin);
    comprobar(
      `el admin SÍ ve un reporte de "${otraEmpresa}" sin haber elegido empresa`,
      r.status === 200,
      `${r.status}`,
    );

    // Con la empresa correcta, el mismo reporte sí aparece: confirma que el 404
    // anterior es por el filtro de empresa y no porque el reporte no exista.
    const cookieOtraEmpresa = await signSession({
      sub: empleado.id,
      username: empleado.username,
      name: empleado.fullName,
      role: "empleado",
      empresa: otraEmpresa,
    });
    r = await pedir(`/reportes/${reporteOtraEmpresa.id}`, cookieOtraEmpresa);
    comprobar(
      `al cambiar a "${otraEmpresa}" el mismo reporte sí se ve`,
      r.status === 200,
      `${r.status}`,
    );
  } else {
    comprobar(
      "hay reportes en ambas empresas para probar el aislamiento",
      false,
      "corre npm run seed:demo",
    );
  }

  // Una empresa a la que el usuario no pertenece no sirve aunque venga firmada
  // correctamente: la pertenencia se comprueba contra la base en cada petición.
  const cookieEmpresaAjena = await signSession({
    sub: empleado.id,
    username: empleado.username,
    name: empleado.fullName,
    role: "empleado",
    empresa: "empresa-inexistente",
  });
  r = await pedir("/reportes", cookieEmpresaAjena);
  comprobar(
    "una empresa inexistente en el token manda al selector",
    r.status === 307 && r.location.includes("/empresas"),
    `${r.status} -> ${r.location}`,
  );

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
