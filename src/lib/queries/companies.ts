import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { companies, userCompanies } from "@/db/schema";

export type Empresa = { id: string; name: string };

/** Empresas activas a las que este usuario puede entrar. */
export async function empresasDelUsuario(userId: string): Promise<Empresa[]> {
  return db
    .select({ id: companies.id, name: companies.name })
    .from(userCompanies)
    .innerJoin(companies, eq(companies.id, userCompanies.companyId))
    .where(
      and(eq(userCompanies.userId, userId), eq(companies.isActive, true)),
    )
    .orderBy(asc(companies.name));
}

/**
 * ¿Este usuario puede entrar a esta empresa?
 *
 * Se consulta la base y no el token: si el admin le quita el acceso a alguien,
 * su sesión abierta tiene que dejar de funcionar de inmediato, no dentro de
 * ocho horas cuando expire la cookie.
 */
export async function puedeEntrarAEmpresa(
  userId: string,
  companyId: string,
): Promise<boolean> {
  const [fila] = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .innerJoin(companies, eq(companies.id, userCompanies.companyId))
    .where(
      and(
        eq(userCompanies.userId, userId),
        eq(userCompanies.companyId, companyId),
        eq(companies.isActive, true),
      ),
    )
    .limit(1);

  return Boolean(fila);
}

export async function listarEmpresas(): Promise<Empresa[]> {
  return db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.isActive, true))
    .orderBy(asc(companies.name));
}
