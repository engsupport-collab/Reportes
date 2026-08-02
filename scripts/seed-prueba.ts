/**
 * Reportes de prueba para mirar el sistema con datos dentro.
 *
 *   npm run seed:prueba              -> crea 10 en Corp y 8 en SaaS
 *   npm run seed:prueba -- --limpiar -> borra exactamente los que creó
 *
 * A diferencia de `seed-demo`, este script **sí** está pensado para poder
 * correrse contra producción: no crea usuarios ni toca nada existente, solo
 * inserta reportes firmados con un id reconocible.
 *
 * Cada reporte creado lleva el id con prefijo `prueba-`. Ese es el único
 * rastro que los distingue, y es a propósito: marcar el nombre del proyecto
 * con "PRUEBA" ensuciaría las pantallas que se quieren evaluar, y reconocerlos
 * a ojo para borrarlos después es justo lo que sale mal. Con el prefijo, la
 * limpieza es exacta y no depende de acordarse de cuáles eran.
 */
import { config } from "dotenv";

// Se anota ANTES de cargar .env.local, para poder decir después de dónde
// salió la conexión. Sin este aviso, abrir una terminal nueva —donde ya no
// están las variables exportadas— haría que el script escribiera en
// desarrollo mientras uno cree que está tocando producción.
const urlVeniaDelEntorno = Boolean(process.env.TURSO_DATABASE_URL);

// No sobrescribe lo que ya esté en el entorno: si se exportó
// TURSO_DATABASE_URL apuntando a producción, eso manda sobre .env.local.
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { reportTags, reports, users } from "../src/db/schema";
import { parseFechaISO } from "../src/lib/fechas";

const PREFIJO = "prueba-";

/** Fecha de calendario N días atrás, anclada igual que la del formulario. */
function fechaDiasAtras(dias: number): Date {
  const d = new Date(Date.now() - dias * 86_400_000);
  return parseFechaISO(d.toISOString().slice(0, 10))!;
}

type Plantilla = {
  proyecto: string;
  cliente: string;
  servicio: "electrico" | "mecanico";
  etiquetas: string[];
  terminado: boolean;
  /** null deja el reporte sin orden, para ver la marca "Sin orden". */
  orden: string | null;
  detalles: string | null;
};

/**
 * Los casos están escritos a mano y no generados en bucle porque el objetivo
 * es ver la interfaz: hacen falta reportes sin orden, sin detalles, terminados
 * y en proceso, de los dos tipos de servicio y con una y varias etiquetas. Un
 * bucle daría dieciocho variantes de lo mismo.
 */
const CORP: Plantilla[] = [
  {
    proyecto: "Mantenimiento preventivo planta norte",
    cliente: "Industrias del Valle S.A.",
    servicio: "mecanico",
    etiquetas: ["preventivo"],
    terminado: true,
    orden: "OC-2026-2001",
    detalles:
      "Cambio de aceite y revisión de rodamientos en las tres líneas.\nTodo quedó operando con normalidad.",
  },
  {
    proyecto: "Falla en tablero principal",
    cliente: "Industrias del Valle S.A.",
    servicio: "electrico",
    etiquetas: ["urgencia"],
    terminado: true,
    orden: "OC-2026-2002",
    detalles:
      "Se encontró un breaker recalentado. Se reemplazó y se ajustaron las conexiones.",
  },
  {
    proyecto: "Instalación eléctrica bodega 3",
    cliente: "Alimentos Andinos",
    servicio: "electrico",
    etiquetas: ["proyecto"],
    terminado: false,
    orden: "OC-2026-2003",
    detalles: "Avance del 60%. Falta el tramo de la zona de refrigeración.",
  },
  {
    proyecto: "Revisión de bombas hidráulicas",
    cliente: "Alimentos Andinos",
    servicio: "mecanico",
    etiquetas: ["preventivo", "online"],
    terminado: true,
    orden: null,
    detalles: "Revisión de rutina. Sin novedades.",
  },
  {
    proyecto: "Calibración de sensores de temperatura",
    cliente: "Textiles Monserrate",
    servicio: "electrico",
    etiquetas: ["preventivo"],
    terminado: true,
    orden: "OC-2026-2005",
    detalles: null,
  },
  {
    proyecto: "Cambio de rodamientos línea 2",
    cliente: "Textiles Monserrate",
    servicio: "mecanico",
    etiquetas: ["urgencia"],
    terminado: false,
    orden: null,
    detalles: "Se pidió el repuesto, llega el jueves.",
  },
  {
    proyecto: "Soporte remoto sistema de control",
    cliente: "Cementos del Río",
    servicio: "electrico",
    etiquetas: ["online"],
    terminado: true,
    orden: "OC-2026-2007",
    detalles: "Se reconfiguró el PLC por acceso remoto.",
  },
  {
    proyecto: "Montaje de tablero de control",
    cliente: "Cementos del Río",
    servicio: "electrico",
    etiquetas: ["proyecto"],
    terminado: false,
    orden: "OC-2026-2008",
    detalles: null,
  },
  {
    proyecto: "Inspección de tanques de almacenamiento",
    cliente: "Industrias del Valle S.A.",
    servicio: "mecanico",
    etiquetas: ["preventivo"],
    terminado: true,
    orden: "OC-2026-2009",
    detalles: "Inspección visual y medición de espesores. Sin corrosión.",
  },
  {
    proyecto: "Reparación de banda transportadora",
    cliente: "Alimentos Andinos",
    servicio: "mecanico",
    etiquetas: ["urgencia", "preventivo"],
    terminado: true,
    orden: null,
    detalles: "Se empalmó la banda y se alineó el rodillo tensor.",
  },
];

const SAAS: Plantilla[] = [
  {
    proyecto: "Mantenimiento subestación",
    cliente: "Cementos del Río",
    servicio: "electrico",
    etiquetas: ["preventivo"],
    terminado: true,
    orden: "OC-2026-3001",
    detalles: "Limpieza y termografía de la subestación principal.",
  },
  {
    proyecto: "Parada de emergencia línea 4",
    cliente: "Textiles Monserrate",
    servicio: "electrico",
    etiquetas: ["urgencia"],
    terminado: true,
    orden: "OC-2026-3002",
    detalles: "Se restableció el servicio en dos horas.",
  },
  {
    proyecto: "Cambio de motorreductor",
    cliente: "Industrias del Valle S.A.",
    servicio: "mecanico",
    etiquetas: ["preventivo"],
    terminado: true,
    orden: null,
    detalles: null,
  },
  {
    proyecto: "Automatización de envasado",
    cliente: "Alimentos Andinos",
    servicio: "electrico",
    etiquetas: ["proyecto", "online"],
    terminado: false,
    orden: "OC-2026-3004",
    detalles: "Fase 1 de 3 terminada. Pendiente la integración con el ERP.",
  },
  {
    proyecto: "Diagnóstico de vibraciones",
    cliente: "Cementos del Río",
    servicio: "mecanico",
    etiquetas: ["preventivo"],
    terminado: true,
    orden: "OC-2026-3005",
    detalles: "Se detectó desbalanceo en el ventilador 2. Se recomienda balanceo.",
  },
  {
    proyecto: "Revisión de puesta a tierra",
    cliente: "Textiles Monserrate",
    servicio: "electrico",
    etiquetas: ["preventivo"],
    terminado: false,
    orden: null,
    detalles: null,
  },
  {
    proyecto: "Soporte online tablero de mando",
    cliente: "Industrias del Valle S.A.",
    servicio: "electrico",
    etiquetas: ["online"],
    terminado: true,
    orden: "OC-2026-3007",
    detalles: "Ajuste de parámetros por acceso remoto.",
  },
  {
    proyecto: "Alineación de bombas centrífugas",
    cliente: "Alimentos Andinos",
    servicio: "mecanico",
    etiquetas: ["preventivo", "proyecto"],
    terminado: true,
    orden: "OC-2026-3008",
    detalles: "Alineación láser de las cuatro bombas del cuarto de máquinas.",
  },
];

async function main() {
  const limpiar = process.argv.includes("--limpiar");

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error(
      "Faltan TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en el entorno.",
    );
  }

  // Se dice en voz alta contra qué base se va a escribir: este script puede
  // correr contra producción, y equivocarse de base no debería ser silencioso.
  console.log("");
  console.log(`  BASE DE DATOS: ${new URL(url).host}`);
  console.log(
    urlVeniaDelEntorno
      ? "  (de las variables de entorno)"
      : "  (de .env.local — si esperabas producción, CANCELA y exporta TURSO_DATABASE_URL)",
  );
  console.log("");

  const client = createClient({ url, authToken });
  const db = drizzle(client);

  if (limpiar) {
    // Las etiquetas y los adjuntos caen solos por ON DELETE CASCADE.
    const borrados = await db
      .delete(reports)
      .where(like(reports.id, `${PREFIJO}%`))
      .returning({ id: reports.id });

    console.log(`${borrados.length} reportes de prueba eliminados.`);
    client.close();
    return;
  }

  // Autor: se reutiliza una cuenta que ya exista, nunca se crea una. En
  // producción las cuentas son de personas reales y este script no tiene por
  // qué inventar ninguna.
  const [autor] = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (!autor) {
    throw new Error("No hay ningún usuario admin en esta base.");
  }
  console.log(`Autor de los reportes: ${autor.fullName}`);

  const ahora = Date.now();
  const todos = [
    ...CORP.map((p) => ({ ...p, companyId: "corp" })),
    ...SAAS.map((p) => ({ ...p, companyId: "saas" })),
  ];

  const filas = todos.map((p, i) => ({
    id: `${PREFIJO}${crypto.randomUUID()}`,
    companyId: p.companyId,
    authorId: autor.id,
    projectName: p.proyecto,
    purchaseOrderNo: p.orden,
    clientName: p.cliente,
    workDate: fechaDiasAtras(i + 1),
    details: p.detalles,
    serviceType: p.servicio,
    status: (p.terminado ? "terminado" : "en_proceso") as
      | "terminado"
      | "en_proceso",
    completedAt: p.terminado ? new Date(ahora - i * 86_400_000) : null,
    createdAt: new Date(ahora - i * 86_400_000),
    updatedAt: new Date(ahora - i * 86_400_000),
  }));

  await db.insert(reports).values(filas);

  const etiquetas = todos.flatMap((p, i) =>
    p.etiquetas.map((tag) => ({ reportId: filas[i]!.id, tag })),
  );
  await db.insert(reportTags).values(etiquetas);

  const corp = filas.filter((f) => f.companyId === "corp").length;
  const saas = filas.filter((f) => f.companyId === "saas").length;
  console.log(
    `Listo: ${corp} reportes en Corp y ${saas} en SaaS (${etiquetas.length} etiquetas).`,
  );
  console.log("Para borrarlos: npm run seed:prueba -- --limpiar");

  client.close();
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
