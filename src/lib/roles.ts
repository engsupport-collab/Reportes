/**
 * Tipos compartidos de rol y estado.
 *
 * Viven en su propio módulo, sin dependencias, a propósito: el middleware corre
 * en Edge Runtime y se ejecuta en *cada* petición. Si importara estos tipos
 * desde src/db/schema.ts, arrastraría Drizzle entero al bundle del middleware y
 * encarecería todas las peticiones. Ver PLAN.md, sección 7.1.
 */

export const USER_ROLES = ["admin", "empleado"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REPORT_STATUSES = ["en_proceso", "terminado"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Ruta de inicio según el rol, tras iniciar sesión. */
export function rutaInicio(role: UserRole): string {
  return role === "admin" ? "/admin" : "/reportes";
}
