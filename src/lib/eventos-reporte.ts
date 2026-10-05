import "server-only";

import { db } from "@/db";
import { reportEvents } from "@/db/schema";
import type { ReportEventType } from "@/lib/roles";

/**
 * Lo que cada evento guarda además de quién y cuándo. Va como JSON en
 * `report_events.metadata` y no dentro de un texto ya armado: así el
 * historial puede decirlo en el idioma de quien lo lee.
 */
export type DatosDeEvento = {
  finalizado: undefined;
  reabierto: undefined;
  correo_enviado: { para: string };
  /** `causa` es un detalle técnico corto, para soporte: "gmail: HTTP 413". */
  correo_fallido: { para: string; causa: string };
  correo_corregido: { de: string; a: string };
};

/**
 * Registra un evento en la bitácora del reporte (`report_events`). Se llama
 * DESPUÉS de la escritura que lo origina, nunca antes ni en su lugar: son dos
 * cosas separadas — el estado actual del reporte, y la historia de cómo llegó
 * ahí.
 */
export async function registrarEvento<T extends ReportEventType>(datos: {
  reportId: string;
  tipo: T;
  userId: string;
  motivo?: string | null;
  metadata?: DatosDeEvento[T];
}): Promise<void> {
  await db.insert(reportEvents).values({
    id: crypto.randomUUID(),
    reportId: datos.reportId,
    tipo: datos.tipo,
    userId: datos.userId,
    motivo: datos.motivo ?? null,
    metadata: datos.metadata ? JSON.stringify(datos.metadata) : null,
  });
}

/** Lee `metadata` sin fiarse de lo que haya: un JSON roto no debe tumbar el historial. */
export function leerMetadata(texto: string | null): Record<string, string> {
  if (!texto) return {};
  try {
    const valor: unknown = JSON.parse(texto);
    if (typeof valor !== "object" || valor === null) return {};
    return Object.fromEntries(
      Object.entries(valor).filter((par): par is [string, string] => typeof par[1] === "string"),
    );
  } catch {
    return {};
  }
}
