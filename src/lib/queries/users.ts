import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { companies, userCompanies, users } from "@/db/schema";

export type UsuarioConAccesos = {
  id: string;
  username: string;
  fullName: string;
  role: "admin" | "empleado";
  isActive: boolean;
  empresas: string[];
};

/** Todos los usuarios del sistema, con las empresas a las que cada uno accede. */
export async function listarUsuarios(): Promise<UsuarioConAccesos[]> {
  const [filas, accesos] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .orderBy(asc(users.fullName)),

    db
      .select({ userId: userCompanies.userId, companyId: userCompanies.companyId })
      .from(userCompanies),
  ]);

  const empresasPorUsuario = new Map<string, string[]>();
  for (const a of accesos) {
    const actuales = empresasPorUsuario.get(a.userId);
    if (actuales) actuales.push(a.companyId);
    else empresasPorUsuario.set(a.userId, [a.companyId]);
  }

  return filas.map((u) => ({
    ...u,
    empresas: empresasPorUsuario.get(u.id) ?? [],
  }));
}

/**
 * Datos de la cuenta que no viajan en la sesión, para la página de perfil.
 *
 * El token solo lleva lo que hace falta en cada petición (id, nombre, rol);
 * meterle la fecha de alta lo engordaría para mostrarla en una sola pantalla.
 */
export async function obtenerCuenta(userId: string) {
  const [fila] = await db
    .select({
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return fila ?? null;
}

export async function existeUsername(username: string): Promise<boolean> {
  const [fila] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  return Boolean(fila);
}

export async function todasLasEmpresas() {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      currency: companies.currency,
    })
    .from(companies)
    .orderBy(asc(companies.name));
}
