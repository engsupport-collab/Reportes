import { SignJWT, jwtVerify } from "jose";

import type { UserRole } from "./roles";

/**
 * Firma y verificación del token de sesión.
 *
 * Este módulo tiene que poder ejecutarse en Edge Runtime, porque el middleware
 * lo usa en cada petición. Por eso:
 *   - solo depende de `jose` (Web Crypto), nunca de bcrypt ni de Drizzle;
 *   - no toca la base de datos;
 *   - no importa `next/headers`, que no existe en middleware.
 *
 * El manejo de la cookie vive en src/lib/auth-guard.ts, que sí corre en Node.
 */

export const SESSION_COOKIE = "sesion";

/** 8 horas: cubre una jornada laboral sin obligar a reingresar a media tarde. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export type SessionPayload = {
  /** id del usuario */
  sub: string;
  username: string;
  name: string;
  role: UserRole;
  /**
   * Empresa activa ("corp" | "saas").
   *
   * Va en el token y no en una cookie aparte para que no se pueda cambiar desde
   * el navegador: el token está firmado, así que editarlo lo invalida. Cambiar
   * de empresa vuelve a emitir la cookie, y el servidor comprueba antes que el
   * usuario tenga acceso a esa empresa.
   *
   * Puede faltar: es el estado justo después de iniciar sesión, cuando alguien
   * con acceso a las dos todavía no eligió.
   */
  empresa?: string;
};

/**
 * Se lee `process.env.SESSION_SECRET` de forma estática y no a través del
 * módulo de validación de entorno: Next.js necesita ver la referencia literal
 * para poder incrustar el valor en el bundle de Edge.
 */
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET no está definido o es demasiado corto (mínimo 32 caracteres).",
    );
  }

  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    username: payload.username,
    name: payload.name,
    role: payload.role,
    empresa: payload.empresa,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

/**
 * Devuelve el contenido del token si la firma es válida y no expiró.
 * Devuelve null en cualquier otro caso — token ausente, alterado o vencido.
 * Nunca lanza: quien llama solo necesita saber si hay sesión o no.
 */
export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "admin" && payload.role !== "empleado")
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      username: payload.username,
      name: payload.name,
      role: payload.role,
      empresa:
        typeof payload.empresa === "string" ? payload.empresa : undefined,
    };
  } catch {
    return null;
  }
}
