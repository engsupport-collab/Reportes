"use server";

import { redirect } from "next/navigation";

import { createSessionCookie, requireUser } from "@/lib/auth-guard";
import { puedeEntrarAEmpresa } from "@/lib/queries/companies";
import { rutaInicio } from "@/lib/roles";

/**
 * Elige la empresa con la que se va a trabajar.
 *
 * Se vuelve a emitir la cookie de sesión con la empresa dentro. Lo importante
 * es la comprobación previa: el identificador llega desde el navegador, así que
 * antes de firmar nada se verifica contra la base que este usuario realmente
 * tenga acceso. Sin eso, bastaría con enviar "saas" para entrar a una empresa
 * ajena.
 *
 * Es exclusiva de empleados. Un admin nunca la llega a invocar desde la
 * interfaz —el cambiador de empresa no se le muestra—, pero si alguien la
 * invocara igual (por ejemplo desde la consola del navegador), no tiene efecto:
 * `getCurrentUser()` ignora `empresa` en la sesión para el rol admin, siempre
 * lo resuelve a null. Este `return` temprano solo evita que quede escrito un
 * valor sin sentido en su cookie.
 */
export async function elegirEmpresaAction(companyId: string) {
  const user = await requireUser();
  if (user.role === "admin") redirect(rutaInicio("admin"));

  if (!(await puedeEntrarAEmpresa(user.id, companyId))) {
    redirect("/empresas");
  }

  await createSessionCookie({
    sub: user.id,
    username: user.username,
    name: user.fullName,
    role: user.role,
    empresa: companyId,
  });

  redirect(rutaInicio(user.role));
}

/** Vuelve al selector sin cerrar la sesión. */
export async function cambiarEmpresaAction() {
  const user = await requireUser();

  await createSessionCookie({
    sub: user.id,
    username: user.username,
    name: user.fullName,
    role: user.role,
    empresa: undefined,
  });

  redirect("/empresas");
}
