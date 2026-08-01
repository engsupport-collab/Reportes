import bcrypt from "bcryptjs";

/**
 * Hasheo y verificación de contraseñas.
 *
 * Vive aparte para que el login, la creación de usuarios desde el panel de
 * admin y el script de seed usen exactamente el mismo costo y las mismas
 * reglas. Si esto estuviera duplicado, tarde o temprano una de las tres rutas
 * quedaría con un costo distinto.
 */

/**
 * Costo 11 y no 12: bcrypt es deliberadamente lento y cada incremento duplica
 * el tiempo de CPU. En serverless ese tiempo se paga en la respuesta del login.
 * 11 sigue estando muy por encima de lo que hace falta para resistir fuerza
 * bruta offline, y responde notablemente más rápido. Ver PLAN.md, sección 7.1.
 */
const BCRYPT_COST = 11;

export const PASSWORD_MIN_LENGTH = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Comparación falsa contra un hash descartable.
 *
 * Se usa cuando el usuario no existe, para que el login tarde lo mismo que
 * cuando sí existe. Sin esto, un atacante puede distinguir usuarios válidos de
 * inválidos midiendo el tiempo de respuesta, aunque el mensaje de error sea
 * idéntico en ambos casos.
 */
const DUMMY_HASH = "$2b$11$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function fakeVerify(): Promise<void> {
  await bcrypt.compare("contrasena-inexistente", DUMMY_HASH);
}

/**
 * Contraseña temporal para una cuenta nueva o un reseteo.
 *
 * Se genera con `crypto.randomBytes` (aleatoriedad criptográfica) y no con
 * `Math.random()`, que no está pensado para nada que deba ser impredecible.
 * Se excluyen caracteres que se confunden al leerlos en voz alta o a mano
 * (0/O, 1/l/I): esta contraseña se le va a dictar o escribir a alguien una
 * sola vez, y un error de transcripción no debería bloquear el primer ingreso.
 */
export function generarContrasenaTemporal(): string {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}
