"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSessionCookie,
  destroySessionCookie,
  setIdiomaCookie,
} from "@/lib/auth-guard";
import { fakeVerify, verifyPassword } from "@/lib/password";
import { empresasDelUsuario } from "@/lib/queries/companies";
import {
  bloqueoDeIp,
  estaBloqueado,
  limpiarIntentos,
  limpiarIp,
  minutosRestantes,
  registrarFalloDeIp,
  registrarIntentoFallido,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { rutaInicio } from "@/lib/roles";
import { loginSchema } from "@/lib/validation";

export type LoginState = { error?: string };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const [t, tValidacion] = await Promise.all([
    getTranslations("login"),
    getTranslations("validacion"),
  ]);

  /**
   * Mensaje único para credenciales inválidas.
   *
   * Da igual si el usuario no existe o si la contraseña está mal: la respuesta
   * es la misma. Decir "ese usuario no existe" le confirmaría a un atacante qué
   * nombres son reales, y eso reduce el problema a adivinar solo la contraseña.
   */
  const credencialesInvalidas = t("credencialesInvalidas");

  function mensajeBloqueo(hasta: Date): string {
    return t("bloqueo", { minutos: minutosRestantes(hasta) });
  }

  const ip = await getClientIp();

  // Se comprueba el bloqueo del dispositivo antes que nada: si esta IP está
  // frenada, no se consulta la base ni se ejecuta bcrypt. Además de cerrar el
  // ataque de fuerza bruta, evita que alguien consuma CPU del servidor a
  // voluntad lanzando intentos en cadena.
  const ipBloqueada = await bloqueoDeIp(ip);
  if (ipBloqueada) {
    return { error: mensajeBloqueo(ipBloqueada) };
  }

  const parsed = loginSchema(tValidacion).safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? credencialesInvalidas,
    };
  }

  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    // Comparación falsa para que tarde lo mismo que con un usuario real. Sin
    // esto, el tiempo de respuesta delata qué usuarios existen aunque el
    // mensaje de error sea idéntico.
    await fakeVerify();
    const estado = await registrarFalloDeIp(ip);
    if (estado.lockedUntil && estaBloqueado(estado.lockedUntil)) {
      return { error: mensajeBloqueo(estado.lockedUntil) };
    }
    return { error: credencialesInvalidas };
  }

  if (estaBloqueado(user.lockedUntil)) {
    return { error: mensajeBloqueo(user.lockedUntil!) };
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);

  if (!passwordOk) {
    // Se anotan los dos contadores: el del dispositivo y el de la cuenta.
    const [porIp, porCuenta] = await Promise.all([
      registrarFalloDeIp(ip),
      registrarIntentoFallido(user.id),
    ]);

    const bloqueo =
      (porIp.lockedUntil && estaBloqueado(porIp.lockedUntil)
        ? porIp.lockedUntil
        : null) ??
      (porCuenta.lockedUntil && estaBloqueado(porCuenta.lockedUntil)
        ? porCuenta.lockedUntil
        : null);

    // El aviso sale en el mismo intento que dispara el bloqueo. Si se avisara
    // en el siguiente, desde fuera parecería que el bloqueo no funciona.
    if (bloqueo) return { error: mensajeBloqueo(bloqueo) };

    return { error: credencialesInvalidas };
  }

  // Cuenta desactivada: se comprueba después de validar la contraseña para no
  // revelar el estado de la cuenta a quien no conoce las credenciales.
  if (!user.isActive) {
    return { error: t("cuentaDesactivada") };
  }

  await Promise.all([limpiarIntentos(user.id), limpiarIp(ip)]);

  // El admin no elige empresa: ve las dos siempre. Entra directo al panel, sin
  // pasar por /empresas ni depender de user_companies para nada.
  if (user.role === "admin") {
    await createSessionCookie({
      sub: user.id,
      username: user.username,
      name: user.fullName,
      role: user.role,
    });
    // Al entrar, la cookie de idioma se vuelve a escribir desde la cuenta:
    // así este navegador queda igual que el resto, aunque antes tuviera
    // guardada la preferencia de una sesión anterior distinta.
    await setIdiomaCookie(user.locale);
    redirect(rutaInicio(user.role));
  }

  const empresas = await empresasDelUsuario(user.id);
  if (empresas.length === 0) {
    return { error: t("sinEmpresa") };
  }

  // Quien pertenece a una sola empresa entra directo: no tiene sentido pedirle
  // que elija cuando no hay nada que elegir.
  const empresaUnica = empresas.length === 1 ? empresas[0]!.id : undefined;

  await createSessionCookie({
    sub: user.id,
    username: user.username,
    name: user.fullName,
    role: user.role,
    empresa: empresaUnica,
  });
  await setIdiomaCookie(user.locale);

  // redirect() lanza una excepción de control interna de Next.js: tiene que
  // quedar fuera de cualquier try/catch o quedaría atrapada.
  redirect(empresaUnica ? rutaInicio(user.role) : "/empresas");
}

export async function logoutAction() {
  await destroySessionCookie();
  redirect("/login");
}
