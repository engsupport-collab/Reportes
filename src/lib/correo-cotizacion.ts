import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { quotes } from "@/db/schema";

import { type AvisoDeCotizacion, textoDelAviso } from "./aviso-cotizacion";
import { env } from "./env";
import { correoConfigurado, destinatariosDeAvisos, enviarCorreo } from "./gmail";
import { obtenerCotizacion } from "./queries/quotes";

/**
 * Envío del aviso de que se creó una cotización.
 *
 * Lo pidió el cliente para armar, al final de cada semana, el plan con los
 * pendientes: cada cotización nueva le llega a administración y a quien
 * coordina, con sus datos y un enlace para abrirla. Qué dice el correo está en
 * `aviso-cotizacion.ts`.
 *
 * Sale después de responderle a quien la creó (ver `after` en
 * `actions/quotes.ts`), para que crear una cotización no espere a Google, y
 * nunca la impide: la cotización ya está guardada cuando esto empieza. Cómo
 * terminó queda anotado en la propia cotización.
 */
const NOMBRE_REMITENTE = "Eng Supports";

async function enviarAviso(
  quoteId: string,
): Promise<{ ok: true; para: string[] } | { ok: false; causa: string } | null> {
  const para = destinatariosDeAvisos();
  // Sin destinatarios no hay aviso que dar ni fallo que anotar: es como está
  // desarrollo a propósito.
  if (para.length === 0) return null;

  if (!correoConfigurado()) {
    return { ok: false, causa: "el envío de correo no está configurado" };
  }

  const cotizacion = await obtenerCotizacion(quoteId);
  if (!cotizacion) return { ok: false, causa: "la cotización ya no existe" };

  // Sin APP_URL no hay forma de armar una URL absoluta; el aviso va igual.
  const enlace = env.APP_URL
    ? new URL(`/admin/cotizaciones/${quoteId}`, env.APP_URL).toString()
    : null;

  const resultado = await enviarCorreo({
    para,
    ...textoDelAviso(cotizacion, enlace),
    nombreRemitente: NOMBRE_REMITENTE,
  });

  return resultado.ok ? { ok: true, para } : resultado;
}

/**
 * Manda el aviso y deja anotado en la cotización cómo terminó. Nunca lanza:
 * corre cuando la respuesta ya se envió, y ahí un error no tiene a quién
 * llegarle. Devuelve null cuando no hay a quién avisar.
 */
export async function avisarCotizacionCreada(
  quoteId: string,
): Promise<AvisoDeCotizacion | null> {
  let resultado: Awaited<ReturnType<typeof enviarAviso>>;
  try {
    resultado = await enviarAviso(quoteId);
  } catch (error) {
    console.warn("No se pudo avisar de la cotización %s:", quoteId, error);
    resultado = { ok: false, causa: "fallo inesperado al avisar" };
  }
  if (!resultado) return null;

  const aviso: AvisoDeCotizacion = { ...resultado, cuando: new Date().toISOString() };
  try {
    await db
      .update(quotes)
      .set({ creationNotice: JSON.stringify(aviso) })
      .where(eq(quotes.id, quoteId));
  } catch (error) {
    console.warn("No se pudo anotar el aviso de la cotización %s:", quoteId, error);
  }
  return aviso;
}
