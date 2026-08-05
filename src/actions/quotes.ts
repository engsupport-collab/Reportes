"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { quotes, reports } from "@/db/schema";
import { requireAccesoReportes, requireAdmin } from "@/lib/auth-guard";
import { esEstadoActivo } from "@/lib/cotizaciones";
import { obtenerClienteActivoDeEmpresa } from "@/lib/queries/clients";
import { listarEmpresas } from "@/lib/queries/companies";
import {
  esNumeroCotizacionDuplicado,
  insertarCotizacionConNumeroAutomatico,
  obtenerCotizacion,
  sincronizarSecuenciaConNumero,
} from "@/lib/queries/quotes";
import {
  cotizacionCampoSchema,
  cotizacionSchema,
  estadoCotizacionSchema,
} from "@/lib/validation";

export type CotizacionState = {
  error?: string;
  /**
   * Presente solo tras `crearCotizacionCampoAction`: lo mínimo que el
   * selector de cotización necesita para agregarla a su lista y dejarla
   * elegida, sin recargar la página.
   */
  creada?: { id: string; projectName: string; clientName: string };
};

/** Invalida la caché de las pantallas donde puede aparecer esta cotización. */
function revalidarListas(id?: string) {
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/reportes/nuevo");
  // El alta también: su campo de número llega con el siguiente consecutivo ya
  // escrito, y si esa pantalla se sirviera de caché propondría un número que
  // la cotización recién creada acaba de ocupar.
  revalidatePath("/admin/cotizaciones/nueva");
  if (id) revalidatePath(`/admin/cotizaciones/${id}`);
}

/**
 * Alta de una cotización completa. Solo el admin: es la fuente oficial que
 * reemplaza al Excel, y dejarla abierta a cualquiera sería volver al problema
 * de nombres distintos que este módulo existe para resolver.
 */
export async function crearCotizacionAction(
  _prevState: CotizacionState,
  formData: FormData,
): Promise<CotizacionState> {
  const user = await requireAdmin();
  const t = await getTranslations("validacion");

  const enviado = formData.get("companyId");
  const empresas = await listarEmpresas();
  const empresa = empresas.find((e) => e.id === enviado);
  if (!empresa) {
    return { error: t("eligeEmpresaReporte") };
  }

  const parsed = cotizacionSchema(t).safeParse({
    quoteNumber: formData.get("quoteNumber"),
    projectName: formData.get("projectName"),
    clientId: formData.get("clientId"),
    purchaseOrderNo: formData.get("purchaseOrderNo"),
    dueDate: formData.get("dueDate"),
    description: formData.get("description"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  // Un id de cliente manipulado en el formulario no debe poder colar una
  // cotización con el cliente de otra empresa, o uno ya desactivado.
  const cliente = await obtenerClienteActivoDeEmpresa(
    parsed.data.clientId,
    empresa.id,
  );
  if (!cliente) return { error: t("eligeCliente") };

  // El estado lo elige el admin al crear, con "en curso" ya preseleccionado:
  // si él la registra, es la autoridad y no hay a quién pedirle permiso. Un
  // valor que no sea de la lista se ignora y cae en "en curso".
  const estado = estadoCotizacionSchema.safeParse(formData.get("status"));
  const status = estado.success ? estado.data : "en_curso";

  const id = crypto.randomUUID();

  // El campo de número ya llega con una sugerencia escrita (ver
  // src/lib/queries/quotes.ts, siguienteNumeroCotizacionSugerido), para que
  // el admin no tenga que digitarla. Si la dejó tal cual, ese valor puede
  // haber quedado obsoleto para cuando por fin envía el formulario — otro
  // admin pudo crear una cotización mientras tanto — así que se ignora y el
  // número de verdad se asigna al guardar, de forma atómica. Si en cambio
  // escribió otra cosa a propósito, esa elección se respeta tal cual.
  const quoteNumberEnviado = String(formData.get("quoteNumber") ?? "").trim();
  const quoteNumberSugerido = String(
    formData.get("quoteNumberSugerido") ?? "",
  ).trim();
  const usarNumeroAutomatico =
    quoteNumberSugerido.length > 0 && quoteNumberEnviado === quoteNumberSugerido;

  // El try envuelve solo la escritura: `redirect` funciona lanzando, y si
  // quedara dentro se confundiría con un fallo de la base.
  try {
    if (usarNumeroAutomatico) {
      await insertarCotizacionConNumeroAutomatico({
        id,
        companyId: empresa.id,
        createdBy: user.id,
        status,
        projectName: parsed.data.projectName,
        clientId: parsed.data.clientId,
        purchaseOrderNo: parsed.data.purchaseOrderNo,
        dueDate: parsed.data.dueDate ? parsed.data.dueDate.getTime() : null,
        description: parsed.data.description,
        amount: parsed.data.amount,
        revisada: true,
      });
    } else {
      await db.insert(quotes).values({
        id,
        companyId: empresa.id,
        createdBy: user.id,
        status,
        ...parsed.data,
      });
      // El admin escribió el número a mano. Si va por delante del contador, se
      // adelanta el contador: si no, dentro de unas semanas la secuencia
      // llegaría a ese mismo número y lo entregaría por segunda vez.
      await sincronizarSecuenciaConNumero(parsed.data.quoteNumber);
    }
  } catch (error) {
    // Dos admins escribiendo el mismo número a la vez pasan los dos por la
    // validación —cada uno mira un instante en el que el otro no ha guardado—
    // y es el índice único quien los separa. Aquí ese rechazo se convierte en
    // algo que se puede leer y corregir, en vez de una pantalla de error.
    if (esNumeroCotizacionDuplicado(error)) {
      return { error: t("numeroCotizacionEnUso") };
    }
    throw error;
  }

  revalidarListas();
  redirect(`/admin/cotizaciones/${id}`);
}

/**
 * Edición de una cotización. La empresa no se toca aquí, igual que en
 * `actualizarReporteAction`: moverla de una empresa a otra es una operación
 * distinta, con sus propias implicaciones sobre los reportes que ya la usan.
 */
export async function actualizarCotizacionAction(
  id: string,
  _prevState: CotizacionState,
  formData: FormData,
): Promise<CotizacionState> {
  const user = await requireAdmin();
  const t = await getTranslations("validacion");

  const cotizacion = await obtenerCotizacion(id);
  if (!cotizacion) return { error: t("cotizacionNoExiste") };

  const parsed = cotizacionSchema(t).safeParse({
    quoteNumber: formData.get("quoteNumber"),
    projectName: formData.get("projectName"),
    clientId: formData.get("clientId"),
    purchaseOrderNo: formData.get("purchaseOrderNo"),
    dueDate: formData.get("dueDate"),
    description: formData.get("description"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  // La empresa de la cotización no se puede cambiar aquí (ver el comentario
  // de la función), así que el cliente elegido tiene que ser de esa misma
  // empresa, fija — no de la que venga en el formulario.
  const cliente = await obtenerClienteActivoDeEmpresa(
    parsed.data.clientId,
    cotizacion.companyId,
  );
  if (!cliente) return { error: t("eligeCliente") };

  try {
    await db
      .update(quotes)
      .set({ ...parsed.data, updatedAt: new Date(), updatedBy: user.id })
      .where(eq(quotes.id, id));

    // Mismo motivo que al crear: editar el número a mano también puede dejarlo
    // por delante del contador.
    await sincronizarSecuenciaConNumero(parsed.data.quoteNumber);
  } catch (error) {
    if (esNumeroCotizacionDuplicado(error)) {
      return { error: t("numeroCotizacionEnUso") };
    }
    throw error;
  }

  revalidarListas(id);
  redirect(`/admin/cotizaciones/${id}`);
}

export async function cambiarEstadoCotizacionAction(
  id: string,
  formData: FormData,
) {
  const user = await requireAdmin();

  const parsed = estadoCotizacionSchema.safeParse(formData.get("status"));
  if (!parsed.success) return;

  await db
    .update(quotes)
    .set({ status: parsed.data, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(quotes.id, id));

  revalidarListas(id);
}

/**
 * Marca una cotización creada en campo como revisada, y en ese único momento
 * propaga la corrección a los reportes que ya se crearon desde ella.
 *
 * Es la única excepción a que un reporte guarde su propia copia inmutable de
 * los datos: el técnico pudo escribir el nombre mal, y sin esta propagación el
 * error quedaría congelado para siempre en el reporte — el mismo problema que
 * el módulo vino a resolver, con otra cara.
 *
 * Alcanza solo a los reportes SIN firmar. Uno ya firmado es una constancia que
 * el cliente aceptó tal como estaba ese día; no se toca aquí ni en ningún otro
 * caso.
 *
 * No hace nada si la cotización ya estaba revisada: la propagación ocurre una
 * sola vez, en el paso de "sin revisar" a "revisada". Después de eso, editar
 * la cotización vuelve a comportarse como con cualquier otra — sin efecto
 * sobre los reportes ya creados.
 */
export async function marcarCotizacionRevisadaAction(id: string) {
  const user = await requireAdmin();
  const cotizacion = await obtenerCotizacion(id);

  if (!cotizacion || cotizacion.revisada) return;

  await db
    .update(quotes)
    .set({ revisada: true, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(quotes.id, id));

  await db
    .update(reports)
    .set({
      projectName: cotizacion.projectName,
      clientName: cotizacion.clientName,
      purchaseOrderNo: cotizacion.purchaseOrderNo,
      quoteNumber: cotizacion.quoteNumber,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(and(eq(reports.quoteId, id), isNull(reports.signatureUrl)));

  revalidarListas(id);
}

/**
 * Cotización mínima creada por un técnico desde campo, para un trabajo
 * acordado de palabra o urgente que todavía no está en el sistema.
 *
 * A diferencia de la que crea el admin, no pide número de cotización, orden de
 * compra ni fecha comprometida — son datos que en campo no se tienen, y que el
 * admin completa después. Nace `revisada: false`, para que quede agrupada en
 * el panel del admin hasta que la complete o corrija.
 */
export async function crearCotizacionCampoAction(
  _prevState: CotizacionState,
  formData: FormData,
): Promise<CotizacionState> {
  const user = await requireAccesoReportes();
  const t = await getTranslations("validacion");

  const parsed = cotizacionCampoSchema(t).safeParse({
    projectName: formData.get("projectName"),
    clientId: formData.get("clientId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  let companyId: string;
  if (user.role === "admin") {
    const enviado = formData.get("companyId");
    const empresas = await listarEmpresas();
    const empresa = empresas.find((e) => e.id === enviado);
    if (!empresa) return { error: t("eligeEmpresaReporte") };
    companyId = empresa.id;
  } else {
    companyId = user.empresaActiva.id;
  }

  // El técnico solo elige de lo que ya existe — nunca escribe un nombre.
  // La misma comprobación de siempre: un id manipulado no debe poder colar
  // el cliente de otra empresa.
  const cliente = await obtenerClienteActivoDeEmpresa(
    parsed.data.clientId,
    companyId,
  );
  if (!cliente) return { error: t("eligeCliente") };

  const id = crypto.randomUUID();

  // Aquí no hay número visible que sugerir — a diferencia del alta del
  // admin, este formulario no lo pide. Se asigna siempre con el generador
  // atómico, sin ninguna comparación previa.
  await insertarCotizacionConNumeroAutomatico({
    id,
    companyId,
    createdBy: user.id,
    status: "en_curso",
    projectName: parsed.data.projectName,
    clientId: cliente.id,
    purchaseOrderNo: null,
    dueDate: null,
    description: null,
    amount: null,
    revisada: false,
  });

  revalidatePath("/reportes/nuevo");
  revalidatePath("/admin/cotizaciones");

  return {
    creada: { id, projectName: parsed.data.projectName, clientName: cliente.name },
  };
}

/**
 * Verifica que una cotización exista, esté activa y sea de la empresa
 * correcta, antes de dejar que un reporte se cree contra ella.
 *
 * Vive aquí y no en `actions/reports.ts` porque es una regla del propio
 * concepto de "cotización" — quien más adelante cree otra forma de usarlas
 * (el módulo de viáticos, por ejemplo) necesita la misma comprobación.
 */
export async function obtenerCotizacionActivaDeEmpresa(
  quoteId: string,
  companyId: string,
) {
  const cotizacion = await obtenerCotizacion(quoteId);

  if (
    !cotizacion ||
    cotizacion.companyId !== companyId ||
    !esEstadoActivo(cotizacion.status)
  ) {
    return null;
  }

  return cotizacion;
}
