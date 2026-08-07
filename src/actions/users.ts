"use server";

import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, quotes, reports, userCompanies, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import {
  generarContrasenaTemporal,
  hashPassword,
} from "@/lib/password";
import { todasLasEmpresas } from "@/lib/queries/users";
import { crearUsuarioSchema } from "@/lib/validation";

export type UsuarioState = { error?: string; credenciales?: string };

/**
 * Crea un empleado o un admin.
 *
 * No existe registro público en ningún punto del sistema — es parte del
 * requisito de que no pueda ser manipulado por cualquiera. Esta acción, detrás
 * de `requireAdmin()`, es la única forma de que exista una cuenta nueva.
 */
export async function crearUsuarioAction(
  _prevState: UsuarioState,
  formData: FormData,
): Promise<UsuarioState> {
  await requireAdmin();
  const t = await getTranslations("validacion");

  const parsed = crearUsuarioSchema(t).safeParse({
    username: formData.get("username"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    companyIds: formData.getAll("companyIds"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  // Las empresas elegidas se comprueban contra las que existen de verdad: un
  // valor inventado en el formulario no debe poder crear una fila de acceso a
  // una empresa que no existe. Para un admin no hace falta ninguna: ve las dos
  // siempre y no depende de user_companies.
  const validas = new Set((await todasLasEmpresas()).map((e) => e.id));
  const companyIds = parsed.data.companyIds.filter((id) => validas.has(id));
  if (parsed.data.role !== "admin" && companyIds.length === 0) {
    return { error: t("seleccionaEmpresaValida") };
  }

  const [existente] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, parsed.data.username))
    .limit(1);

  if (existente) {
    return { error: t("usuarioYaExiste") };
  }

  const password = generarContrasenaTemporal();
  const id = crypto.randomUUID();

  await db.insert(users).values({
    id,
    username: parsed.data.username,
    fullName: parsed.data.fullName,
    role: parsed.data.role,
    passwordHash: await hashPassword(password),
    isActive: true,
  });

  // .values([]) con un arreglo vacío falla en libSQL: se omite por completo
  // cuando no hay ninguna empresa que insertar (el caso normal de un admin).
  if (companyIds.length > 0) {
    await db
      .insert(userCompanies)
      .values(companyIds.map((companyId) => ({ userId: id, companyId })));
  }

  revalidatePath("/admin/usuarios");

  // La contraseña generada se devuelve una única vez, en la respuesta de esta
  // acción. No se guarda en ningún lado en texto plano; si se pierde, hay que
  // resetearla.
  return {
    credenciales: `Usuario: ${parsed.data.username}  ·  Contraseña temporal: ${password}`,
  };
}

/**
 * Da o quita a un empleado el acceso a una empresa.
 *
 * Solo aplica a empleados: el admin no depende de `user_companies` para nada,
 * ve las dos empresas siempre por definición del rol, así que tocar sus filas
 * de acceso no cambiaría lo que puede ver o hacer. Se permite igualmente por
 * si se quiere llevar el registro, pero no hace falta ninguna salvaguarda de
 * "no te quites tu propio acceso": para el admin es inofensivo.
 *
 * Si un empleado tiene la sesión abierta en la empresa a la que se le quita el
 * acceso, `getCurrentUser()` lo descubre en la siguiente petición —vuelve a
 * consultar la base en cada una— y lo manda al selector. No hace falta cerrarle
 * la sesión a la fuerza.
 */
export async function alternarAccesoEmpresaAction(
  userId: string,
  companyId: string,
  formData: FormData,
) {
  await requireAdmin();

  const otorgar = formData.get("otorgar") === "1";

  if (otorgar) {
    await db
      .insert(userCompanies)
      .values({ userId, companyId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(userCompanies)
      .where(
        and(
          eq(userCompanies.userId, userId),
          eq(userCompanies.companyId, companyId),
        ),
      );
  }

  revalidatePath("/admin/usuarios");
}

export async function alternarActivoAction(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return; // no desactivarse a sí mismo

  const [usuario] = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!usuario) return;

  await db
    .update(users)
    .set({ isActive: !usuario.isActive, updatedAt: new Date() })
    .where(eq(users.id, userId));

  revalidatePath("/admin/usuarios");
}

export type EliminarUsuarioState = { error?: string };

/**
 * Borrado definitivo — solo cuando de verdad no deja nada huérfano.
 *
 * `clients.createdBy`, `quotes.createdBy` y `reports.authorId` referencian a
 * `users` con `onDelete: "restrict"`: si esta persona alguna vez creó un
 * cliente, una cotización o un reporte, la base rechazaría el borrado igual
 * que con un cliente en uso (ver `eliminarClienteAction`). Se comprueba antes
 * para devolver un mensaje legible. En la práctica, esto significa que
 * cualquier cuenta que de verdad se haya usado se queda desactivada para
 * siempre — que es exactamente lo que preserva el historial y la auditoría.
 *
 * Los rastros que sí se sueltan (`quotes.updatedBy`, `reports.updatedBy`,
 * `report_events.userId`) tienen `onDelete: "set null"` y ya se muestran con
 * un texto de reemplazo cuando faltan (ver `usuarioEliminado` en
 * `HistorialEstado`): perder ESE dato puntual no es perder el historial.
 */
export async function eliminarUsuarioAction(
  userId: string,
): Promise<EliminarUsuarioState> {
  const admin = await requireAdmin();
  if (userId === admin.id) return {};
  const t = await getTranslations("usuarios");

  const [usuario] = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!usuario) return {};
  if (usuario.isActive) {
    return { error: t("usuarioActivoNoSeElimina") };
  }

  const [tieneClientes] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.createdBy, userId))
    .limit(1);
  const [tieneCotizaciones] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.createdBy, userId))
    .limit(1);
  const [tieneReportes] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(eq(reports.authorId, userId))
    .limit(1);

  if (tieneClientes || tieneCotizaciones || tieneReportes) {
    return { error: t("usuarioConHistorialNoSeElimina") };
  }

  await db.delete(users).where(eq(users.id, userId));
  // user_companies cae en cascada solo; nunca queda una fila de acceso
  // apuntando a un usuario que ya no existe.
  revalidatePath("/admin/usuarios");
  return {};
}

export type ResetState = { credenciales?: string };

export async function resetearContrasenaAction(
  userId: string,
): Promise<ResetState> {
  await requireAdmin();

  const [usuario] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!usuario) return {};

  const password = generarContrasenaTemporal();

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath("/admin/usuarios");

  return {
    credenciales: `Usuario: ${usuario.username}  ·  Contraseña temporal: ${password}`,
  };
}
