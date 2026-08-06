"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { reportEvents, reportTags, reports } from "@/db/schema";
import { obtenerCotizacionActivaDeEmpresa } from "@/actions/quotes";
import {
  puedeAccederAReporte,
  reporteBloqueado,
  requireAccesoReportes,
  requireAdmin,
} from "@/lib/auth-guard";
import { enviarReporteAlCliente } from "@/lib/correo-reporte";
import { listarEmpresas } from "@/lib/queries/companies";
import { obtenerCotizacion } from "@/lib/queries/quotes";
import { obtenerReporte } from "@/lib/queries/reports";
import {
  correoClienteSchema,
  estadoReporteSchema,
  leerEtiquetas,
  motivoReaperturaSchema,
  reporteSchema,
  reporteViaticoSchema,
} from "@/lib/validation";

/**
 * Registra un evento en la bitácora del reporte (`report_events`). Se llama
 * DESPUÉS del `UPDATE` que cambia el estado, nunca antes ni en su lugar: son
 * dos escrituras separadas porque son dos cosas separadas — el estado actual
 * del reporte, y la historia de cómo llegó ahí.
 */
async function registrarEvento(datos: {
  reportId: string;
  tipo: "finalizado" | "reabierto";
  userId: string;
  motivo?: string | null;
}) {
  await db.insert(reportEvents).values({
    id: crypto.randomUUID(),
    reportId: datos.reportId,
    tipo: datos.tipo,
    userId: datos.userId,
    motivo: datos.motivo ?? null,
  });
}

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
 * Crea un reporte de viáticos. A diferencia del de servicio, solo pide a qué
 * cotización pertenece — no pide fecha de trabajo, tipo de servicio ni
 * etiquetas, que no le aplican. El resto (proyecto, cliente, orden de
 * compra, número de cotización) se copia de la cotización al momento de
 * crearse, igual que un reporte de servicio. `workDate` queda en la fecha de
 * creación — el dato que sí importa por gasto es su propia fecha, capturada
 * en cada línea, no en el reporte.
 *
 * Es hermano del reporte de servicio bajo la misma cotización, no algo que
 * cuelgue de él: los dos existen independientes, y por diseño ningún dato de
 * viáticos llega al PDF ni a la pantalla del reporte de servicio.
 */
export async function crearReporteViaticoAction(
  _prevState: ReporteState,
  formData: FormData,
): Promise<ReporteState> {
  const user = await requireAccesoReportes();
  const t = await getTranslations("validacion");

  const parsed = reporteViaticoSchema(t).safeParse({
    quoteId: formData.get("quoteId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

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

  const cotizacion = await obtenerCotizacionActivaDeEmpresa(
    parsed.data.quoteId,
    companyId,
  );
  if (!cotizacion) {
    return { error: t("eligeCotizacion") };
  }

  const id = crypto.randomUUID();

  await db.insert(reports).values({
    id,
    companyId,
    authorId: user.id,
    type: "viaticos",
    quoteId: cotizacion.id,
    projectName: cotizacion.projectName,
    clientName: cotizacion.clientName,
    purchaseOrderNo: cotizacion.purchaseOrderNo,
    quoteNumber: cotizacion.quoteNumber,
    workDate: new Date(),
    status: "en_proceso",
  });

  revalidarListas();
  revalidatePath(`/admin/cotizaciones/${cotizacion.id}`);
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

  // Un reporte terminado es un documento cerrado: ni el autor ni el admin lo
  // editan por aquí. La única puerta de vuelta es `reabrirReporteAction`.
  if (reporteBloqueado(reporte)) {
    return { error: tValidacion("reporteTerminadoBloqueado") };
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

export type FinalizarState = { error?: string };

/**
 * Marca un reporte de servicio como terminado y se lo manda al cliente.
 *
 * Es el ÚNICO punto del sistema desde el que sale el reporte hacia el cliente.
 * Firmar ya no envía nada: el cliente firma delante del técnico, pero después
 * todavía pueden faltar fotos o la orden de compra, y un correo enviado en ese
 * momento llevaría un reporte a medias. Aquí, en cambio, "terminado" quiere
 * decir terminado.
 *
 * El correo no se pide aquí: es el que el cliente escribió al firmar, en
 * "Correo de quien firma". Volver a pedirlo sería teclear dos veces el mismo
 * dato y abrir la puerta a que las dos copias no coincidan. Si el reporte no
 * está firmado no hay a dónde mandarlo, y eso es lo que se dice.
 *
 * El orden importa: primero se marca terminado, y solo después se intenta
 * enviar. Al revés, un webhook caído dejaría al técnico sin poder cerrar el
 * trabajo. Si el envío falla, el reporte queda terminado igual y se le dice
 * qué pasó, en vez de fingir que salió.
 *
 * Un reporte YA terminado puede volver a pasar por aquí sin que eso sea
 * "editarlo": es el reintento de envío tras un fallo (ver más abajo), y no
 * toca ningún dato del reporte — solo lo reintenta. Por eso esta acción NO
 * usa `reporteBloqueado()` como las demás: bloquearla también le quitaría al
 * técnico su única forma de reintentar un correo que falló.
 */
export async function finalizarReporteAction(
  id: string,
): Promise<FinalizarState> {
  const { user, reporte } = await cargarConPermiso(id);
  const t = await getTranslations("validacion");

  // Un reporte de viáticos es información interna y no se manda a nadie: su
  // detalle usa `cambiarEstadoAction`, no esta acción.
  if (!reporte || reporte.type !== "servicio") {
    return { error: t("reporteNoExiste") };
  }

  const parsed = correoClienteSchema(t).safeParse(reporte.signatureEmail ?? "");
  if (!parsed.success) {
    return { error: t("firmaAntesDeTerminar") };
  }

  // Ya estaba terminado: esto es el reintento del correo, no una nueva
  // finalización. No se vuelve a escribir el estado ni un evento nuevo — ese
  // rastro es de la vez que de verdad se cerró, no de cada reintento.
  if (!reporteBloqueado(reporte)) {
    await db
      .update(reports)
      .set({
        status: "terminado",
        completedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: user.id,
      })
      .where(eq(reports.id, id));

    await registrarEvento({ reportId: id, tipo: "finalizado", userId: user.id });
  }

  const enviado = await enviarReporteAlCliente({
    reportId: id,
    correo: parsed.data,
    nombreFirmante: reporte.signatureName ?? reporte.clientName,
    proyecto: reporte.projectName,
  });

  if (!enviado) {
    // Aquí NO se revalida, y es deliberado. Al revalidar, la pantalla se
    // vuelve a dibujar con el reporte ya terminado: el botón de finalizar
    // desaparece y se lleva consigo este mensaje, dejando al técnico sin
    // saber que el correo no salió. Sin revalidar, la pantalla se queda como
    // está y el aviso se lee. Volver a pulsar el mismo botón reintenta el
    // envío — el reporte ya está terminado, así que solo se repite el correo.
    return { error: t("terminadoSinCorreo") };
  }

  revalidarListas(id);

  // Terminado y enviado: el técnico ya no tiene nada que hacer en esta
  // pantalla, y lo siguiente casi siempre es el próximo trabajo.
  redirect("/reportes/nuevo");
}

/**
 * Marca un reporte de viáticos como terminado (lo cierra). Es la única
 * dirección que esta acción admite: la vuelta a "en proceso" ya no pasa por
 * aquí, sino por `reabrirReporteAction`, exclusiva del administrador — sin
 * esa separación habría dos caminos hacia lo mismo, uno con el candado y
 * otro sin él.
 *
 * Para un reporte de SERVICIO, cerrarlo pasa siempre por
 * `finalizarReporteAction`, que es donde se resuelve el correo y se envía;
 * esta acción lo rechaza, para que una petición armada a mano no pueda dejar
 * uno terminado sin que el cliente reciba nada.
 */
export async function cambiarEstadoAction(id: string, formData: FormData) {
  const { user, reporte } = await cargarConPermiso(id);
  if (!reporte) return;

  const parsed = estadoReporteSchema.safeParse(formData.get("estado"));
  if (!parsed.success) return;

  if (parsed.data !== "terminado") return;
  if (reporte.type === "servicio") return;
  // Un reporte terminado no vuelve a "terminarse": ya lo está.
  if (reporteBloqueado(reporte)) return;

  await db
    .update(reports)
    .set({
      status: "terminado",
      completedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(reports.id, id));

  await registrarEvento({ reportId: id, tipo: "finalizado", userId: user.id });

  revalidarListas(id);
}

export type ReabrirState = { error?: string };

/**
 * Reabre un reporte terminado. Es el ÚNICO camino de vuelta a "en proceso",
 * para servicio y para viáticos por igual, y exclusivo del administrador —
 * `requireAdmin()`, no un chequeo de rol suelto, para que quede tan protegido
 * como cualquier otra pantalla exclusiva de admin en el sistema.
 *
 * El motivo es opcional: el admin puede escribir por qué reabre ("faltaban
 * fotos", "firma ilegible") y queda en la bitácora junto al evento, pero no
 * se exige — a veces la razón ya se habló de palabra.
 */
export async function reabrirReporteAction(
  id: string,
  _prevState: ReabrirState,
  formData: FormData,
): Promise<ReabrirState> {
  const user = await requireAdmin();
  const t = await getTranslations("validacion");
  const reporte = await obtenerReporte(id);

  if (!reporte || !reporteBloqueado(reporte)) {
    return { error: t("reporteNoExiste") };
  }

  const parsed = motivoReaperturaSchema(t).safeParse(formData.get("motivo") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("revisaLosDatos") };
  }

  await db
    .update(reports)
    .set({
      status: "en_proceso",
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(reports.id, id));

  await registrarEvento({
    reportId: id,
    tipo: "reabierto",
    userId: user.id,
    motivo: parsed.data.length > 0 ? parsed.data : null,
  });

  revalidarListas(id);
  return {};
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
