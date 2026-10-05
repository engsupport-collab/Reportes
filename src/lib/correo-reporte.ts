import "server-only";

import { nombreDelPdf } from "./archivos";
import { env } from "./env";
import { firmarEnlacePublico } from "./enlace-firma";
import { type ResultadoEnvio, correoConfigurado, enviarCorreoConAdjunto } from "./gmail";
import { generarReportePdf } from "./pdf";
import { listarAdjuntosParaPdf } from "./queries/attachments";
import { obtenerReporte } from "./queries/reports";

/**
 * Envío del reporte terminado al cliente.
 *
 * Ocurre al marcar el reporte como terminado, y cada vez que alguien pide
 * reenviarlo después. Guardar la firma no dispara nada — el cliente puede
 * firmar y el técnico seguir subiendo fotos durante un rato, y sería un mal
 * correo el que llegara a medio camino.
 *
 * El PDF viaja adjunto, armado aquí mismo con los datos actuales. Antes se
 * mandaba solo un enlace firmado y n8n se encargaba de descargarlo y
 * adjuntarlo; ahora que el correo sale de la propia aplicación, ese rodeo
 * sobra. El enlace se conserva igual dentro del cuerpo, como respaldo: sirve
 * si el adjunto se pierde por el camino o si el cliente prefiere abrirlo desde
 * el navegador.
 *
 * Devuelve si el envío salió y, si no, en qué paso se quedó: armar el PDF y
 * mandar el correo son dos cosas distintas que fallan por motivos distintos,
 * y quien llama lo anota en el historial del reporte. Nunca lanza — que el
 * correo falle no debe romper el marcado como terminado, que ya quedó guardado.
 */
const NOMBRE_REMITENTE = "Eng Supports";

export async function enviarReporteAlCliente(datos: {
  reportId: string;
  correo: string;
  nombreFirmante: string;
  proyecto: string;
}): Promise<ResultadoEnvio> {
  if (!correoConfigurado()) {
    console.warn(
      "No se envió el reporte %s al cliente: falta configurar el envío por Gmail.",
      datos.reportId,
    );
    return { ok: false, causa: "el envío de correo no está configurado" };
  }

  let pdf: Uint8Array;
  try {
    const reporte = await obtenerReporte(datos.reportId);
    if (!reporte) {
      console.warn("No se envió el reporte %s: ya no existe.", datos.reportId);
      return { ok: false, causa: "el reporte ya no existe" };
    }

    const adjuntos = await listarAdjuntosParaPdf(datos.reportId);
    pdf = await generarReportePdf(reporte, adjuntos);
  } catch (error) {
    console.warn("No se pudo armar el PDF del reporte %s:", datos.reportId, error);
    return { ok: false, causa: "no se pudo armar el PDF" };
  }

  try {
    // Sin APP_URL no hay forma de armar una URL absoluta, y un enlace relativo
    // dentro de un correo no lleva a ningún lado. El adjunto va igual.
    const enlace = env.APP_URL
      ? new URL(
          `/api/reportes/publico/${await firmarEnlacePublico(datos.reportId)}`,
          env.APP_URL,
        ).toString()
      : null;

    const cuerpo = [
      `Hola ${datos.nombreFirmante},`,
      "",
      `Adjunto encontrarás el reporte firmado del proyecto "${datos.proyecto}".`,
      ...(enlace ? ["", `También puedes consultarlo en línea: ${enlace}`] : []),
      "",
      "Gracias,",
      NOMBRE_REMITENTE,
    ].join("\n");

    return await enviarCorreoConAdjunto({
      para: datos.correo,
      asunto: `Reporte firmado — ${datos.proyecto}`,
      cuerpo,
      pdf,
      nombreArchivo: nombreDelPdf(datos.proyecto),
      nombreRemitente: NOMBRE_REMITENTE,
    });
  } catch (error) {
    console.warn(
      "No se pudo enviar el reporte %s al cliente:",
      datos.reportId,
      error,
    );
    return { ok: false, causa: "fallo inesperado al enviar" };
  }
}
