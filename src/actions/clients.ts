"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, quotes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { idiomaDeEmpresa } from "@/lib/idioma-documento";
import { listarEmpresas } from "@/lib/queries/companies";
import { clienteSchema } from "@/lib/validation";

export type ClienteState = {
  error?: string;
  /**
   * Presente solo tras crear con éxito: lo mínimo que un selector de cliente
   * (el de una cotización) necesita para agregarlo a su lista y dejarlo
   * elegido, sin recargar la página — mismo patrón que `creada` en
   * `CotizacionState` (src/actions/quotes.ts).
   */
  creado?: { id: string; name: string };
};

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

  const parsed = clienteSchema(t).safeParse({
    name: formData.get("name"),
    documentLanguage: formData.get("documentLanguage") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  const id = crypto.randomUUID();
  await db.insert(clients).values({
    id,
    companyId: empresa.id,
    name: parsed.data.name,
    // Un cliente nuevo queda siempre con su idioma escrito. Si el formulario
    // no lo trajo, el de su empresa: es lo mismo que se le habría propuesto.
    documentLanguage: parsed.data.documentLanguage ?? idiomaDeEmpresa(empresa.id),
    createdBy: user.id,
  });

  revalidatePath("/admin/clientes");
  // También se ofrece desde el formulario de cotización (botón "+ Crear
  // nuevo cliente"); su selector se refresca de verdad al volver a esa
  // pantalla, no solo con el estado que ya trae en memoria.
  revalidatePath("/admin/cotizaciones/nueva");
  return { creado: { id, name: parsed.data.name } };
}

/**
 * Edición de un cliente: su nombre y el idioma en que recibe sus reportes. La
 * empresa no se toca, mismo criterio que `actualizarCotizacionAction`: moverlo
 * de una empresa a otra es una operación distinta, con sus propias
 * implicaciones sobre las cotizaciones que ya lo referencian.
 *
 * Cambiar el idioma vale también para los reportes que el cliente ya tiene: el
 * PDF se arma en el momento, así que el próximo que se descargue o se reenvíe
 * sale en el idioma nuevo. Es lo que permite corregir uno que ya se mandó en
 * el idioma equivocado.
 */
export async function actualizarClienteAction(
  id: string,
  _prevState: ClienteState,
  formData: FormData,
): Promise<ClienteState> {
  await requireAdmin();
  const t = await getTranslations("validacion");

  const parsed = clienteSchema(t).safeParse({
    name: formData.get("name"),
    documentLanguage: formData.get("documentLanguage") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  await db
    .update(clients)
    .set({
      name: parsed.data.name,
      // Sin idioma en el formulario no se toca el que tenga.
      ...(parsed.data.documentLanguage
        ? { documentLanguage: parsed.data.documentLanguage }
        : {}),
      updatedAt: new Date(),
    })
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

export type EliminarClienteState = { error?: string };

/**
 * Borrado definitivo — solo cuando de verdad no deja nada huérfano.
 *
 * `quotes.clientId` referencia a `clients` con `onDelete: "restrict"`: la
 * base ya rechazaría este borrado si alguna cotización lo usa. Se comprueba
 * aquí antes, para devolver un mensaje legible en vez de dejar que la
 * consulta falle con un error de restricción — mismo criterio que ya usa
 * `crearCotizacionAction` con el número de cotización repetido.
 *
 * Ambos requisitos —estar desactivado, y no tener cotizaciones— se
 * comprueban aunque la interfaz ya solo ofrezca este botón en ese caso: la
 * integridad se garantiza en el servidor, no en lo que el botón deja hacer.
 */
export async function eliminarClienteAction(
  clientId: string,
): Promise<EliminarClienteState> {
  await requireAdmin();
  const t = await getTranslations("clientes");

  const [cliente] = await db
    .select({ isActive: clients.isActive })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!cliente) return {};
  if (cliente.isActive) {
    return { error: t("clienteActivoNoSeElimina") };
  }

  const [enUso] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.clientId, clientId))
    .limit(1);

  if (enUso) {
    return { error: t("clienteConHistorialNoSeElimina") };
  }

  await db.delete(clients).where(eq(clients.id, clientId));
  revalidatePath("/admin/clientes");
  return {};
}
