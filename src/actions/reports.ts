"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { reportTags, reports } from "@/db/schema";
import { obtenerCotizacionActivaDeEmpresa } from "@/actions/quotes";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { listarEmpresas } from "@/lib/queries/companies";
import { obtenerCotizacion } from "@/lib/queries/quotes";
import {
  obtenerReporte,
  obtenerReporteServicioParaEnlazar,
} from "@/lib/queries/reports";
import {
  estadoReporteSchema,
  leerEtiquetas,
  reporteSchema,
  reporteViaticoSchema,
} from "@/lib/validation";

export type ReporteState = { error?: string };

async function leerFormulario(formData: FormData) {
  const t = await getTranslations("validacion");
  return reporteSchema(t).safeParse({
    quoteId: formData.get("quoteId"),
    workDate: formData.get("workDate"),
    serviceType: formData.get("serviceType"),
    details: formData.get("details"),
  });
}

/**
 * Reemplaza las etiquetas de un reporte por las recibidas.
 *
 * Se borran todas y se insertan las nuevas en vez de calcular diferencias: son
 * como mucho cuatro filas, y así no hay forma de que quede una etiqueta vieja
 * colgada por un caso no contemplado.
 */
async function guardarEtiquetas(reportId: string, etiquetas: string[]) {
  await db.delete(reportTags).where(eq(reportTags.reportId, reportId));

  if (etiquetas.length > 0) {
    await db
      .insert(reportTags)
      .values(etiquetas.map((tag) => ({ reportId, tag })));
  }
}

/** Invalida la caché de las listas donde puede aparecer este reporte. */
function revalidarListas(id?: string) {
  revalidatePath("/reportes");
  revalidatePath("/admin");
  revalidatePath("/admin/reportes");
  if (id) revalidatePath(`/reportes/${id}`);
}

/**
 * Carga un reporte y comprueba que este usuario puede tocarlo.
 *
 * Se devuelve el mismo "no existe" tanto si el reporte no existe, como si es de
 * otro empleado, como si es de la otra empresa: decir "existe pero no es tuyo"
 * confirmaría qué identificadores son reales. Este es el punto que impide que
 * alguien edite un reporte ajeno cambiando el id en la URL. El admin siempre
 * pasa, de cualquier empresa — es la esencia del rol.
 */
async function cargarConPermiso(id: string) {
  const user = await requireAccesoReportes();
  const reporte = await obtenerReporte(id);

  if (!reporte || !puedeAccederAReporte(user, reporte)) {
    return { user, reporte: null as null };
  }

  return { user, reporte };
}

export async function crearReporteAction(
  _prevState: ReporteState,
  formData: FormData,
): Promise<ReporteState> {
  const user = await requireAccesoReportes();
  const tValidacion = await getTranslations("validacion");
  const parsed = await leerFormulario(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? tValidacion("revisaLosDatos") };
  }

  let companyId: string;

  if (user.role === "admin") {
    // El admin no tiene empresa de sesión: la manda el formulario, y se
    // comprueba contra las empresas reales antes de confiar en ella. Sin esa
    // comprobación, cualquier valor enviado a mano crearía el reporte con un
    // company_id inventado, violando la clave foránea o —peor— coincidiendo
    // por azar con un id real que no debía usarse.
    const enviado = formData.get("companyId");
    const empresas = await listarEmpresas();
    const valida = empresas.find((e) => e.id === enviado);

    if (!valida) {
      return { error: tValidacion("eligeEmpresaReporte") };
    }
    companyId = valida.id;
  } else {
    // Un empleado crea siempre dentro de su empresa activa. Nunca se lee del
    // formulario: si se leyera, podría crear un reporte en una empresa a la
    // que ni siquiera tiene acceso.
    companyId = user.empresaActiva.id;
  }

  // La cotización sostiene proyecto, cliente, orden de compra y número de
  // cotización: se comprueba que exista, esté activa y sea de esta empresa
  // antes de copiar nada. Sin esto, un id inventado o el de otra empresa
  // crearía un reporte con datos que no le corresponden.
  const { quoteId, ...resto } = parsed.data;
  const cotizacion = await obtenerCotizacionActivaDeEmpresa(quoteId, companyId);
  if (!cotizacion) {
    return { error: tValidacion("eligeCotizacion") };
  }

  const id = crypto.randomUUID();

  await db.insert(reports).values({
    id,
    companyId,
    authorId: user.id,
    type: "servicio",
    quoteId: cotizacion.id,
    projectName: cotizacion.projectName,
    clientName: cotizacion.clientName,
    purchaseOrderNo: cotizacion.purchaseOrderNo,
    quoteNumber: cotizacion.quoteNumber,
    ...resto,
    status: "en_proceso",
  });

  await guardarEtiquetas(id, leerEtiquetas(formData.getAll("etiquetas")));

  revalidarListas();
  redirect(`/reportes/${id}`);
}

/**
 * Crea un reporte de viáticos. A diferencia del de servicio, no pide sus
 * propios proyecto y cliente: los copia del reporte de servicio que justifica
 * al momento de crearse, así que no se le pregunta algo que ya está escrito
 * ahí. `workDate` queda en la fecha de creación — el dato que sí importa por
 * gasto es su propia fecha, capturada en cada línea, no en el reporte.
 */
export async function crearReporteViaticoAction(
  _prevState: ReporteState,
  formData: FormData,
): Promise<ReporteState> {
  const user = await requireAccesoReportes();
  const t = await getTranslations("validacion");

  const parsed = reporteViaticoSchema(t).safeParse({
    linkedReportId: formData.get("linkedReportId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  const enlazado = await obtenerReporteServicioParaEnlazar(
    parsed.data.linkedReportId,
  );

  // El reporte enlazado tiene que existir, ser de servicio, y de la empresa
  // en la que el usuario está creando este reporte de viáticos. Un empleado
  // no puede enlazar un reporte de la otra empresa; el admin, tampoco puede
  // mezclarlas — el enlace se valida contra la misma empresa que se asigna
  // abajo.
  let companyId: string;
  if (user.role === "admin") {
    const enviado = formData.get("companyId");
    const empresas = await listarEmpresas();
    const valida = empresas.find((e) => e.id === enviado);
    if (!valida) {
      return { error: t("eligeEmpresaReporte") };
    }
    companyId = valida.id;
  } else {
    companyId = user.empresaActiva.id;
  }

  if (
    !enlazado ||
    enlazado.type !== "servicio" ||
    enlazado.companyId !== companyId
  ) {
    return { error: t("eligeReporteAEnlazar") };
  }

  const id = crypto.randomUUID();

  await db.insert(reports).values({
    id,
    companyId,
    authorId: user.id,
    type: "viaticos",
    linkedReportId: enlazado.id,
    projectName: enlazado.projectName,
    clientName: enlazado.clientName,
    workDate: new Date(),
    status: "en_proceso",
  });

  revalidarListas();
  redirect(`/reportes/${id}`);
}

export async function actualizarReporteAction(
  id: string,
  _prevState: ReporteState,
  formData: FormData,
): Promise<ReporteState> {
  const { user, reporte } = await cargarConPermiso(id);
  const tValidacion = await getTranslations("validacion");
  // Un reporte de viáticos no tiene formulario de edición propio: sus únicos
  // datos editables son las líneas de gasto, que se agregan y borran desde su
  // detalle. Llegar aquí con uno solo puede ser una petición manipulada.
  if (!reporte || reporte.type !== "servicio") {
    return { error: tValidacion("reporteNoExiste") };
  }

  const parsed = await leerFormulario(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? tValidacion("revisaLosDatos") };
  }

  // Cambiar de cotización vuelve a copiar sus datos — es la misma regla que al
  // crear. La empresa del reporte no se toca aquí, así que la cotización tiene
  // que ser de la empresa que el reporte ya tiene, no de la que sea.
  //
  // Si es la misma cotización que el reporte ya tenía, no se exige que siga
  // activa: una cotización se cierra cuando el trabajo termina, y justo
  // entonces es cuando más falta hace poder editar el reporte (por ejemplo,
  // para completar los detalles). La exigencia de "activa" solo aplica al
  // elegir una cotización distinta.
  const { quoteId, ...resto } = parsed.data;
  const cotizacion =
    quoteId === reporte.quoteId
      ? await obtenerCotizacion(quoteId)
      : await obtenerCotizacionActivaDeEmpresa(quoteId, reporte.companyId);

  if (!cotizacion || cotizacion.companyId !== reporte.companyId) {
    return { error: tValidacion("eligeCotizacion") };
  }

  // La empresa de un reporte no se cambia al editarlo, solo al crearlo: mover
  // un reporte ya existente entre LLC y SAS es una operación distinta, con
  // sus propias implicaciones, y no algo que deba pasar sin querer al corregir
  // el nombre de un cliente.
  await db
    .update(reports)
    .set({
      quoteId: cotizacion.id,
      projectName: cotizacion.projectName,
      clientName: cotizacion.clientName,
      purchaseOrderNo: cotizacion.purchaseOrderNo,
      quoteNumber: cotizacion.quoteNumber,
      ...resto,
      updatedAt: new Date(),
      // Deja rastro de quién editó: el admin puede modificar reportes ajenos y
      // el autor tiene que poder ver que alguien más lo tocó.
      updatedBy: user.id,
    })
    .where(eq(reports.id, id));

  await guardarEtiquetas(id, leerEtiquetas(formData.getAll("etiquetas")));

  revalidarListas(id);
  redirect(`/reportes/${id}`);
}

export async function cambiarEstadoAction(id: string, formData: FormData) {
  const { user, reporte } = await cargarConPermiso(id);
  if (!reporte) return;

  const parsed = estadoReporteSchema.safeParse(formData.get("estado"));
  if (!parsed.success) return;

  const nuevoEstado = parsed.data;

  await db
    .update(reports)
    .set({
      status: nuevoEstado,
      // Al volver a "en proceso" se limpia la fecha de finalización, para que no
      // quede una marca de terminado en un reporte que ya no lo está.
      completedAt: nuevoEstado === "terminado" ? new Date() : null,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(reports.id, id));

  revalidarListas(id);
}

export async function eliminarReporteAction(id: string) {
  const { user, reporte } = await cargarConPermiso(id);
  if (!reporte) return;

  // Un reporte terminado es un registro del trabajo hecho: no se borra sin más.
  // Para eliminarlo hay que devolverlo antes a "en proceso", lo cual queda
  // anotado en updated_by.
  if (reporte.status === "terminado") return;

  await db.delete(reports).where(eq(reports.id, id));

  revalidarListas();
  redirect(user.role === "admin" ? "/admin/reportes" : "/reportes");
}
