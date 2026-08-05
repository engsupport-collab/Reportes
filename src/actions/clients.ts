"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { listarEmpresas } from "@/lib/queries/companies";
import { clienteSchema } from "@/lib/validation";

export type ClienteState = { error?: string };

/**
 * Alta de un cliente. Solo el admin: es la fuente oficial del catálogo, y
 * dejarla abierta a cualquiera sería volver al problema de nombres distintos
 * que este módulo existe para resolver (ver PLAN-CLIENTES.md).
 */
export async function crearClienteAction(
  _prevState: ClienteState,
  formData: FormData,
): Promise<ClienteState> {
  const user = await requireAdmin();
  const t = await getTranslations("validacion");

  const enviado = formData.get("companyId");
  const empresas = await listarEmpresas();
  const empresa = empresas.find((e) => e.id === enviado);
  if (!empresa) {
    return { error: t("eligeEmpresaReporte") };
  }

  const parsed = clienteSchema(t).safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  await db.insert(clients).values({
    id: crypto.randomUUID(),
    companyId: empresa.id,
    name: parsed.data.name,
    createdBy: user.id,
  });

  revalidatePath("/admin/clientes");
  return {};
}

/**
 * Edición del nombre de un cliente. La empresa no se toca, mismo criterio que
 * `actualizarCotizacionAction`: moverlo de una empresa a otra es una
 * operación distinta, con sus propias implicaciones sobre las cotizaciones
 * que ya lo referencian.
 */
export async function actualizarClienteAction(
  id: string,
  _prevState: ClienteState,
  formData: FormData,
): Promise<ClienteState> {
  await requireAdmin();
  const t = await getTranslations("validacion");

  const parsed = clienteSchema(t).safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  await db
    .update(clients)
    .set({ name: parsed.data.name, updatedAt: new Date() })
    .where(eq(clients.id, id));

  revalidatePath("/admin/clientes");
  return {};
}

/**
 * Activa o desactiva un cliente. Sin borrado real: un cliente desactivado
 * sale del selector de cotizaciones nuevas, pero las que ya lo usan lo siguen
 * mostrando — mismo patrón que `alternarActivoAction` en actions/users.ts.
 */
export async function alternarActivoClienteAction(clientId: string) {
  await requireAdmin();

  const [cliente] = await db
    .select({ isActive: clients.isActive })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!cliente) return;

  await db
    .update(clients)
    .set({ isActive: !cliente.isActive, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  revalidatePath("/admin/clientes");
}
