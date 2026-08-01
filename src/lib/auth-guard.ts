import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { type Empresa, empresasDelUsuario, listarEmpresas } from "./queries/companies";
import type { UserRole } from "./roles";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
  signSession,
  verifySession,
} from "./session";

/**
 * Autorización del lado del servidor.
 *
 * El proxy solo comprueba *que hay una sesión válida*. La autorización real
 * — quién puede ver o tocar qué, y de qué empresa — se decide aquí, y se invoca
 * al principio de cada página y de cada Server Action. Es la diferencia entre
 * esconder un botón y realmente impedir la operación.
 *
 * El admin es un caso aparte: no elige empresa, ve las dos siempre. Por eso
 * `empresaActiva` es null para admin de forma permanente — no es "todavía no
 * eligió", es "no aplica". Cada página del admin filtra por empresa con su
 * propio parámetro de consulta, no con un estado de sesión.
 */

export type CurrentUser = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  /**
   * Para un empleado: las empresas a las que tiene acceso (al menos una).
   * Para un admin: todas las empresas activas del sistema, siempre — el admin
   * no tiene una lista de "las suyas", ve todas por definición del rol.
   */
  empresas: Empresa[];
  /** Empresa elegida por un empleado. Siempre null para un admin. */
  empresaActiva: Empresa | null;
};

/**
 * Usuario ya autorizado a operar sobre reportes, con la ambigüedad de la
 * empresa resuelta según el rol.
 *
 * Es una unión discriminada por `role` a propósito: en la rama "empleado",
 * `empresaActiva` es `Empresa` (nunca null), así que el compilador lo exige en
 * cada sitio donde antes había que confiar en que "ya se comprobó antes". En
 * la rama "admin", sigue siendo `Empresa | null` porque no aplica — quien use
 * este tipo tiene que decidir explícitamente qué hacer en cada caso, en vez de
 * asumir un valor que para el admin nunca está.
 */
export type UserConAcceso =
  | (Omit<CurrentUser, "role"> & { role: "admin" })
  | (Omit<CurrentUser, "role" | "empresaActiva"> & {
      role: "empleado";
      empresaActiva: Empresa;
    });

export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, // inaccesible desde JavaScript: mitiga el robo por XSS
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // el navegador no la envía en peticiones de otros sitios
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Usuario de la sesión actual, o null.
 *
 * Consulta la base en cada llamada, a propósito. El token ya trae el rol y la
 * empresa, así que podríamos ahorrarnos las consultas — pero entonces un
 * empleado desactivado, o al que le quitaron el acceso a una empresa, seguiría
 * entrando hasta que su token expirara, hasta 8 horas después. Para el admin
 * hay una razón más: si mañana deja de ser admin, tiene que perder la vista de
 * "todo" en la siguiente petición, no en la siguiente sesión.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);

  if (!user || !user.isActive) return null;

  if (user.role === "admin") {
    // El admin ve todas las empresas activas, sin depender de user_companies:
    // esa tabla es el mecanismo de acceso de los empleados, no aplica al rol
    // que por definición ve todo. empresaActiva queda null siempre: no hay
    // nada que elegir.
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: "admin",
      empresas: await listarEmpresas(),
      empresaActiva: null,
    };
  }

  const empresas = await empresasDelUsuario(user.id);
  if (empresas.length === 0) return null;

  // La empresa del token solo vale si el usuario todavía tiene acceso a ella.
  // Si se lo quitaron, se comporta como si no hubiera elegido: va al selector.
  const empresaActiva = empresas.find((e) => e.id === session.empresa) ?? null;

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    empresas,
    empresaActiva,
  };
}

/** Exige sesión válida. Redirige a /login si no la hay. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exige sesión válida y, si es un empleado, empresa elegida. Al admin no se le
 * exige nada más: nunca elige, siempre ve todo.
 *
 * Es lo que usan las páginas y acciones de reportes, adjuntos y firma —
 * compartidas entre las dos vistas. `redirect()` no retorna (su tipo es
 * `never`), así que tras comprobar `role === "admin"` el compilador angosta el
 * tipo de retorno a la rama "empleado" de `UserConAcceso`, donde
 * `empresaActiva` deja de admitir null. Quien llama después no necesita volver
 * a comprobarlo.
 */
export async function requireAccesoReportes(): Promise<UserConAcceso> {
  const user = await requireUser();

  if (user.role === "admin") {
    return { ...user, role: "admin" };
  }

  if (!user.empresaActiva) redirect("/empresas");

  return { ...user, role: "empleado", empresaActiva: user.empresaActiva };
}

/**
 * Exige rol de administrador. No exige empresa: el admin nunca elige.
 *
 * Un empleado que escriba una URL de /admin a mano llega hasta aquí y es
 * devuelto a su propia vista. El proxy ya lo habría frenado antes; esta es la
 * segunda barrera, la que de verdad protege los datos.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/reportes");
  return user;
}

/**
 * ¿Este usuario alcanza este reporte?
 *
 * El admin siempre sí, de cualquier empresa — es la esencia del rol. Un
 * empleado, solo si el reporte es de su empresa activa y es suyo.
 */
export function puedeAccederAReporte(
  user: CurrentUser,
  reporte: { authorId: string; companyId: string },
): boolean {
  if (user.role === "admin") return true;
  if (!user.empresaActiva) return false;
  if (reporte.companyId !== user.empresaActiva.id) return false;
  return user.id === reporte.authorId;
}
