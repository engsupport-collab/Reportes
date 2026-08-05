import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { clients, companies } from "@/db/schema";

export type ClienteConEmpresa = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
};

export type OpcionCliente = { id: string; name: string };

/**
 * Clientes de una empresa, con su nombre, para el listado del admin.
 * Sin `companyId` trae los de las dos empresas — solo uso legítimo desde
 * `/admin/clientes`, que muestra el catálogo completo.
 */
export async function listarClientes(
  companyId?: string,
): Promise<ClienteConEmpresa[]> {
  return db
    .select({
      id: clients.id,
      companyId: clients.companyId,
      companyName: companies.name,
      name: clients.name,
      isActive: clients.isActive,
      createdAt: clients.createdAt,
    })
    .from(clients)
    .innerJoin(companies, eq(companies.id, clients.companyId))
    .where(companyId ? eq(clients.companyId, companyId) : undefined)
    .orderBy(asc(clients.name));
}

/**
 * Clientes activos de una empresa, para el selector del formulario de
 * cotización (tanto el del admin como la creación mínima desde campo).
 */
export async function listarClientesActivos(
  companyId: string,
): Promise<OpcionCliente[]> {
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), eq(clients.isActive, true)))
    .orderBy(asc(clients.name));
}

/**
 * Este cliente, solo si existe, está activo y es de la empresa indicada.
 * Devuelve su nombre además de confirmar que es válido — quien llama casi
 * siempre lo necesita para mostrarlo, no solo para decidir si acepta o no.
 *
 * Mismo propósito que `obtenerCotizacionActivaDeEmpresa` en queries/quotes.ts:
 * un id de cliente manipulado en el formulario no debe poder colar una
 * cotización con el cliente de otra empresa.
 */
export async function obtenerClienteActivoDeEmpresa(
  clientId: string,
  companyId: string,
): Promise<OpcionCliente | null> {
  const [fila] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.id, clientId),
        eq(clients.companyId, companyId),
        eq(clients.isActive, true),
      ),
    )
    .limit(1);

  return fila ?? null;
}
