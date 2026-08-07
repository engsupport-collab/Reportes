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
 *
 * Por defecto solo los activos, igual que la lista de usuarios: un catálogo
 * que crece con el tiempo se vuelve ruido si mezcla para siempre lo que ya no
 * se usa. `incluirInactivos` es lo que enciende la casilla "Mostrar clientes
 * inactivos" de la pantalla.
 */
export async function listarClientes(
  companyId?: string,
  opciones?: { incluirInactivos?: boolean },
): Promise<ClienteConEmpresa[]> {
  const condiciones = [
    companyId ? eq(clients.companyId, companyId) : undefined,
    opciones?.incluirInactivos ? undefined : eq(clients.isActive, true),
  ].filter((c) => c !== undefined);

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
    .where(condiciones.length > 0 ? and(...condiciones) : undefined)
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
