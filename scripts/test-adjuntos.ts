/**
 * Prueba de los adjuntos: validación de contenido y descarga autorizada.
 *
 *   npm run dev            (en otra terminal)
 *   npm run test:adjuntos
 *
 * Comprueba las dos cosas que de verdad importan de esta fase: que un archivo
 * disfrazado no pase la validación, y que nadie descargue el archivo de un
 * reporte ajeno aunque conozca su identificador.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { attachments, reports, users } from "../src/db/schema";
import { contenidoCoincide } from "../src/lib/archivos-firma";
import { validarArchivo } from "../src/lib/archivos";
import { SESSION_COOKIE, signSession } from "../src/lib/session";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

function bytes(...valores: number[]): ArrayBuffer {
  return new Uint8Array(valores).buffer;
}

async function main() {
  console.log("\nValidación por contenido real del archivo\n");

  // "%PDF" seguido de relleno.
  const pdfReal = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34);
  // "MZ": cabecera de un ejecutable de Windows.
  const exeDisfrazado = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);
  const pngReal = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

  comprobar(
    "un PDF de verdad se acepta",
    contenidoCoincide(pdfReal, "application/pdf"),
  );
  comprobar(
    "un .exe renombrado a .pdf se RECHAZA",
    !contenidoCoincide(exeDisfrazado, "application/pdf"),
  );
  comprobar("un PNG de verdad se acepta", contenidoCoincide(pngReal, "image/png"));
  comprobar(
    "un PNG declarado como PDF se RECHAZA",
    !contenidoCoincide(pngReal, "application/pdf"),
  );
  comprobar(
    "un tipo desconocido se RECHAZA",
    !contenidoCoincide(pdfReal, "application/x-msdownload"),
  );

  console.log("\nValidación de nombre, tipo y tamaño\n");

  comprobar(
    "extensión que no coincide con el tipo declarado",
    !validarArchivo({ name: "virus.exe", type: "application/pdf", size: 100 }).ok,
  );
  comprobar(
    "tipo no permitido",
    !validarArchivo({ name: "a.exe", type: "application/x-msdownload", size: 100 })
      .ok,
  );
  comprobar(
    "archivo demasiado grande",
    !validarArchivo({ name: "a.pdf", type: "application/pdf", size: 99_000_000 })
      .ok,
  );
  comprobar(
    "un PDF normal se acepta",
    validarArchivo({ name: "reporte.pdf", type: "application/pdf", size: 50_000 })
      .ok,
  );

  console.log("\nDescarga autorizada\n");

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
  const [reporteAdmin] = await db
    .select({ id: reports.id, companyId: reports.companyId })
    .from(reports)
    .where(eq(reports.authorId, admin!.id))
    .limit(1);

  const empresaDelReporte = reporteAdmin!.companyId;

  // Adjunto de prueba en un reporte del admin. Se guarda una referencia que no
  // existe en disco: alcanza para comprobar los permisos, que es lo que se
  // quiere medir, y quien tenga acceso recibirá 404 al no encontrar el archivo.
  const adjuntoId = crypto.randomUUID();
  await db.insert(attachments).values({
    id: adjuntoId,
    reportId: reporteAdmin!.id,
    blobUrl: "local:inexistente-de-prueba.pdf",
    fileName: "confidencial.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1234,
  });

  // Las cookies llevan la misma empresa del reporte: así, si el empleado
  // recibe 403, es por no ser el dueño y no por estar en otra empresa.
  const cookieEmpleado = await signSession({
    sub: empleado!.id,
    username: empleado!.username,
    name: empleado!.fullName,
    role: "empleado",
    empresa: empresaDelReporte,
  });
  // Sin `empresa`: un admin real nunca la lleva en la sesión, ve las dos
  // siempre. No hace falta una segunda cookie "en otra empresa" para el admin
  // — no existe tal cosa para su rol.
  const cookieAdmin = await signSession({
    sub: admin!.id,
    username: admin!.username,
    name: admin!.fullName,
    role: "admin",
  });

  async function pedirArchivo(cookie?: string) {
    const res = await fetch(`${BASE}/api/archivos/${adjuntoId}`, {
      headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
      redirect: "manual",
    });
    return res.status;
  }

  comprobar("sin sesión -> 401", (await pedirArchivo()) === 401);
  comprobar(
    "empleado pidiendo un archivo ajeno -> 403",
    (await pedirArchivo(cookieEmpleado)) === 403,
  );

  // El admin no tiene empresa activa y no la necesita: pasa la comprobación de
  // permisos de cualquier reporte, de cualquier empresa. Este es el 404 que
  // demuestra que llegó hasta el almacenamiento — si algo lo hubiera detenido
  // antes por motivo de empresa, el código habría sido 403, no 404.
  const estadoAdmin = await pedirArchivo(cookieAdmin);
  comprobar(
    `el admin pasa la comprobación de permisos sin haber elegido empresa (el reporte es de "${empresaDelReporte}")`,
    estadoAdmin === 404,
    `${estadoAdmin} — 404 porque el archivo de prueba no existe en disco, no por permisos`,
  );

  await db.delete(attachments).where(eq(attachments.id, adjuntoId));

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
