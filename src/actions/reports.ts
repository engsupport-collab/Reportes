"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { reportTags, reports } from "@/db/schema";
import { puedeAccederAReporte, requireAccesoReportes } from "@/lib/auth-guard";
import { listarEmpresas } from "@/lib/queries/companies";
import { obtenerReporte } from "@/lib/queries/reports";
import {
  estadoReporteSchema,
  leerEtiquetas,
  reporteSchema,
} from "@/lib/validation";

export type ReporteState = { error?: string };

function leerFormulario(formData: FormData) {
  return reporteSchema.safeParse({
    projectName: formData.get("projectName"),
    purchaseOrderNo: formData.get("purchaseOrderNo"),
    clientName: formData.get("clientName"),
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
  const parsed = leerFormulario(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
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
      return { error: "Elige para cuál empresa es este reporte." };
    }
    companyId = valida.id;
  } else {
    // Un empleado crea siempre dentro de su empresa activa. Nunca se lee del
    // formulario: si se leyera, podría crear un reporte en una empresa a la
    // que ni siquiera tiene acceso.
    companyId = user.empresaActiva.id;
  }

  const id = crypto.randomUUID();

  await db.insert(reports).values({
    id,
    companyId,
    authorId: user.id,
    ...parsed.data,
    status: "en_proceso",
  });

  await guardarEtiquetas(id, leerEtiquetas(formData.getAll("etiquetas")));

  revalidarListas();
  redirect(`/reportes/${id}`);
}

export async function actualizarReporteAction(
  id: string,
  _prevState: ReporteState,
  formData: FormData,
): Promise<ReporteState> {
  const { user, reporte } = await cargarConPermiso(id);
  if (!reporte) return { error: "El reporte no existe o no tienes acceso." };

  const parsed = leerFormulario(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  // La empresa de un reporte no se cambia al editarlo, solo al crearlo: mover
  // un reporte ya existente entre Corp y SaaS es una operación distinta, con
  // sus propias implicaciones, y no algo que deba pasar sin querer al corregir
  // el nombre de un cliente.
  await db
    .update(reports)
    .set({
      ...parsed.data,
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
