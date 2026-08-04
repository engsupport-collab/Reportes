import { SignJWT, jwtVerify } from "jose";

/**
 * Token del enlace público al PDF de un reporte firmado.
 *
 * Reutiliza `SESSION_SECRET` en vez de pedir un secreto aparte —es la misma
 * garantía que necesita (firmado, no reversible sin la clave)— pero con un
 * `purpose` propio en el payload: sin esa marca, un token de sesión filtrado
 * serviría también como enlace público, y viceversa.
 *
 * A propósito no depende de ninguna tabla: el propio token, firmado y con
 * expiración, es la credencial completa. Guardar cada enlace emitido en la
 * base solo tendría sentido si hiciera falta poder revocarlos uno por uno
 * antes de que caduquen, y hoy no hace falta.
 */

const DIAS_VALIDEZ = 30;
const PURPOSE = "pdf-publico";

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET no está definido o es demasiado corto (mínimo 32 caracteres).",
    );
  }

  return new TextEncoder().encode(secret);
}

export async function firmarEnlacePublico(reportId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, reportId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DIAS_VALIDEZ}d`)
    .sign(getSecret());
}

/** Devuelve el id del reporte si el token es válido, o null en cualquier otro caso. */
export async function verificarEnlacePublico(
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (payload.purpose !== PURPOSE || typeof payload.reportId !== "string") {
      return null;
    }

    return payload.reportId;
  } catch {
    return null;
  }
}
