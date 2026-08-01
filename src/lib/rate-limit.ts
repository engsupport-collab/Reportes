import { eq, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { loginAttempts, users } from "@/db/schema";

/**
 * Freno a los intentos de ingreso por fuerza bruta.
 *
 * Hay dos protecciones, y son complementarias:
 *
 *   1. Por dispositivo (IP) — tabla `login_attempts`. Frena a quien prueba
 *      muchos usuarios distintos desde el mismo equipo. Es la que importa en la
 *      práctica: sin ella, alguien puede probar "admin", "gerente", "camilo"...
 *      indefinidamente, porque cada fallo se anota en una cuenta distinta y
 *      ninguna llega nunca al límite.
 *
 *   2. Por cuenta — columnas en `users`. Frena el ataque distribuido contra un
 *      usuario concreto desde muchas IPs, donde el contador por IP nunca sube.
 *
 * Ambas se apoyan en la base de datos y no en memoria: el estado tiene que
 * sobrevivir a los reinicios constantes de las funciones serverless y ser el
 * mismo aunque dos peticiones caigan en instancias distintas.
 */

export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;

/**
 * Ventana móvil. Sin esto, dos fallos hoy y tres el mes que viene sumarían
 * cinco y bloquearían a alguien que solo tiene mala memoria.
 */
const VENTANA_MS = 15 * 60 * 1000;
const BLOQUEO_MS = MINUTOS_BLOQUEO * 60 * 1000;

export function estaBloqueado(lockedUntil: Date | null): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > Date.now();
}

export function minutosRestantes(lockedUntil: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
}

/** Bloqueo vigente para esta IP, o null. Se consulta antes de tocar bcrypt. */
export async function bloqueoDeIp(ip: string): Promise<Date | null> {
  const [fila] = await db
    .select({ lockedUntil: loginAttempts.lockedUntil })
    .from(loginAttempts)
    .where(eq(loginAttempts.ip, ip))
    .limit(1);

  if (!fila?.lockedUntil) return null;
  return estaBloqueado(fila.lockedUntil) ? fila.lockedUntil : null;
}

/**
 * Anota un fallo para esta IP y devuelve el estado ya actualizado.
 *
 * Todo ocurre en una sola sentencia (INSERT ... ON CONFLICT ... RETURNING) por
 * dos motivos: dos intentos simultáneos no pueden pisarse el contador, y quien
 * llama puede avisar del bloqueo en el mismo intento que lo dispara, en vez de
 * en el siguiente.
 */
export async function registrarFalloDeIp(
  ip: string,
): Promise<{ intentos: number; lockedUntil: Date | null }> {
  const ahora = Date.now();
  const inicioVentana = ahora - VENTANA_MS;

  // Si el último fallo quedó fuera de la ventana, el conteo empieza de nuevo.
  const conteoNuevo = sql`
    CASE
      WHEN ${loginAttempts.lastAttemptAt} < ${inicioVentana} THEN 1
      ELSE ${loginAttempts.failedCount} + 1
    END
  `;

  const [fila] = await db
    .insert(loginAttempts)
    .values({
      ip,
      failedCount: 1,
      firstAttemptAt: new Date(ahora),
      lastAttemptAt: new Date(ahora),
      lockedUntil: null,
    })
    .onConflictDoUpdate({
      target: loginAttempts.ip,
      set: {
        failedCount: conteoNuevo,
        firstAttemptAt: sql`
          CASE
            WHEN ${loginAttempts.lastAttemptAt} < ${inicioVentana} THEN ${ahora}
            ELSE ${loginAttempts.firstAttemptAt}
          END
        `,
        lastAttemptAt: new Date(ahora),
        lockedUntil: sql`
          CASE
            WHEN (${conteoNuevo}) >= ${MAX_INTENTOS} THEN ${ahora + BLOQUEO_MS}
            ELSE ${loginAttempts.lockedUntil}
          END
        `,
      },
    })
    .returning({
      intentos: loginAttempts.failedCount,
      lockedUntil: loginAttempts.lockedUntil,
    });

  return fila ?? { intentos: 1, lockedUntil: null };
}

/**
 * Tras un ingreso correcto, esta IP queda limpia.
 *
 * Se aprovecha para borrar filas viejas. Sin esta limpieza, la tabla crecería
 * sin límite: bastaría con lanzar intentos desde muchas IPs distintas para
 * llenarla. Va aquí porque un ingreso exitoso es poco frecuente y ya implica
 * una escritura, así que no agrega costo a la ruta caliente.
 */
export async function limpiarIp(ip: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.lastAttemptAt, new Date(Date.now() - 86_400_000)));
}

/** Suma un intento fallido a la cuenta y devuelve su estado actualizado. */
export async function registrarIntentoFallido(
  userId: string,
): Promise<{ intentos: number; lockedUntil: Date | null }> {
  const [fila] = await db
    .update(users)
    .set({
      failedAttempts: sql`${users.failedAttempts} + 1`,
      lockedUntil: sql`
        CASE
          WHEN ${users.failedAttempts} + 1 >= ${MAX_INTENTOS}
          THEN (unixepoch() * 1000) + ${BLOQUEO_MS}
          ELSE ${users.lockedUntil}
        END
      `,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      intentos: users.failedAttempts,
      lockedUntil: users.lockedUntil,
    });

  return fila ?? { intentos: 0, lockedUntil: null };
}

/** Tras un ingreso correcto, el contador de la cuenta vuelve a cero. */
export async function limpiarIntentos(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
