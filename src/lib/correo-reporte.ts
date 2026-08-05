import "server-only";

import { firmarEnlacePublico } from "./enlace-firma";

/**
 * Envío del reporte terminado al cliente.
 *
 * Ocurre en un solo momento del sistema: cuando alguien marca el reporte como
 * terminado. Guardar la firma ya no dispara nada — el cliente puede firmar y
 * el técnico seguir subiendo fotos durante un rato, y sería un mal correo el
 * que llegara a medio camino.
 *
 * Lo que viaja es un enlace firmado al PDF, no el PDF: n8n lo descarga de ahí
 * y lo adjunta. Así el correo no depende del tamaño del archivo y el enlace
 * caduca solo.
 *
 * Devuelve si el envío salió o no, en vez de tragarse el fallo: quien llama
 * necesita saberlo para decírselo a quien pulsó el botón. Nunca lanza — un
 * webhook caído no debe romper el marcado como terminado, que ya quedó
 * guardado.
 */
export async function enviarReporteAlCliente(datos: {
  reportId: string;
  correo: string;
  nombreFirmante: string;
  proyecto: string;
}): Promise<boolean> {
  const appUrl = process.env.APP_URL;
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!appUrl || !webhookUrl) {
    console.warn(
      "No se envió el reporte %s al cliente: falta APP_URL o N8N_WEBHOOK_URL.",
      datos.reportId,
    );
    return false;
  }

  try {
    const token = await firmarEnlacePublico(datos.reportId);
    const enlace = new URL(`/api/reportes/publico/${token}`, appUrl).toString();

    const respuesta = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correo: datos.correo,
        nombreFirmante: datos.nombreFirmante,
        proyecto: datos.proyecto,
        enlacePdf: enlace,
      }),
    });

    if (!respuesta.ok) {
      console.warn(
        "El webhook de n8n respondió %d al enviar el reporte %s.",
        respuesta.status,
        datos.reportId,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("No se pudo enviar el reporte %s al cliente:", datos.reportId, error);
    return false;
  }
}
