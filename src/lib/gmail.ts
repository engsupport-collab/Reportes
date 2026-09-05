import "server-only";

import { SignJWT, importPKCS8 } from "jose";

import { env } from "@/lib/env";

/**
 * Envío de correo por la API de Gmail, con la cuenta del cliente.
 *
 * Reemplaza al webhook de n8n que había antes. Aquel corría en un servidor
 * aparte, recibía un aviso, se descargaba el PDF por un enlace firmado y
 * recién ahí mandaba el correo. Eran tres piezas y dos saltos de red para algo
 * que la propia aplicación ya puede hacer: el PDF lo genera ella misma, así
 * que aquí se adjunta directo, sin intermediarios ni enlaces que caduquen.
 *
 * La autenticación es "delegación en todo el dominio": la cuenta de servicio
 * `reportes-correo@…` está autorizada en el Workspace del cliente para actuar
 * como un usuario suyo (`GMAIL_IMPERSONATE_EMAIL`), y solo con el permiso
 * `gmail.send` — no puede leer correo, ni tocar nada más. El remitente que ve
 * quien recibe (`GMAIL_SENDER_EMAIL`) es una identidad de envío verificada de
 * esa cuenta, no su dirección personal.
 *
 * No se usa la librería `googleapis`: son dos peticiones HTTP y `jose` ya está
 * en el proyecto para firmar el JWT. Traer ese paquete entero —y su árbol de
 * dependencias— al arranque en frío de una función serverless no se paga solo.
 */

const AMBITO = "https://www.googleapis.com/auth/gmail.send";
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_ENVIO = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const TIEMPO_MAXIMO_MS = 10_000;

/**
 * La clave privada se importa una sola vez por instancia. Parsear el PEM en
 * cada envío es trabajo repetido y el objeto resultante no cambia nunca.
 */
let clavePrivada: Promise<CryptoKey> | undefined;

type Credenciales = { clientEmail: string; privateKey: string };

function leerCredenciales(): Credenciales {
  const json = JSON.parse(env.GMAIL_SERVICE_ACCOUNT_JSON!) as {
    client_email?: string;
    private_key?: string;
  };

  if (!json.client_email || !json.private_key) {
    throw new Error(
      "GMAIL_SERVICE_ACCOUNT_JSON no tiene client_email o private_key.",
    );
  }

  return { clientEmail: json.client_email, privateKey: json.private_key };
}

async function obtenerAccessToken(): Promise<string> {
  const cred = leerCredenciales();
  clavePrivada ??= importPKCS8(cred.privateKey, "RS256");

  // `sub` es lo que convierte esto en delegación: el token no representa a la
  // cuenta de servicio, sino al usuario del Workspace al que suplanta.
  const assertion = await new SignJWT({
    scope: AMBITO,
    sub: env.GMAIL_IMPERSONATE_EMAIL,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(cred.clientEmail)
    .setAudience(URL_TOKEN)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(await clavePrivada);

  const respuesta = await fetch(URL_TOKEN, {
    method: "POST",
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(
      `Google rechazó la solicitud de token (HTTP ${respuesta.status}): ${await respuesta.text()}`,
    );
  }

  const datos = (await respuesta.json()) as { access_token?: string };
  if (!datos.access_token) throw new Error("Google no devolvió access_token.");
  return datos.access_token;
}

/** base64 en líneas de 76 caracteres, como pide RFC 2045 para el cuerpo MIME. */
function base64Envuelto(datos: Uint8Array | string): string {
  const buffer =
    typeof datos === "string" ? Buffer.from(datos, "utf8") : Buffer.from(datos);
  return buffer.toString("base64").replace(/.{76}/g, "$&\r\n");
}

/** base64url sin relleno: el formato que pide Gmail para el mensaje completo. */
function base64Url(texto: string): string {
  return Buffer.from(texto, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Un asunto con tildes o eñes no puede viajar tal cual en una cabecera: RFC
 * 2047 obliga a codificarlo. Sin esto, "Instalación" llega como "InstalaciÃ³n".
 */
function asuntoCodificado(asunto: string): string {
  return `=?UTF-8?B?${Buffer.from(asunto, "utf8").toString("base64")}?=`;
}

function construirMensaje(opciones: {
  de: string;
  para: string;
  asunto: string;
  cuerpo: string;
  pdf: Uint8Array;
  nombreArchivo: string;
}): string {
  const limite = `limite_${crypto.randomUUID()}`;

  return [
    `From: ${opciones.de}`,
    `To: ${opciones.para}`,
    `Subject: ${asuntoCodificado(opciones.asunto)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${limite}"`,
    "",
    `--${limite}`,
    'Content-Type: text/plain; charset="UTF-8"',
    // El cuerpo también va en base64: lleva tildes, y "7bit" solo admite ASCII.
    "Content-Transfer-Encoding: base64",
    "",
    base64Envuelto(opciones.cuerpo),
    "",
    `--${limite}`,
    `Content-Type: application/pdf; name="${opciones.nombreArchivo}"`,
    `Content-Disposition: attachment; filename="${opciones.nombreArchivo}"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Envuelto(opciones.pdf),
    "",
    `--${limite}--`,
  ].join("\r\n");
}

/** ¿Está configurado el envío por Gmail? Sin esto, quien llama no debe intentarlo. */
export function correoConfigurado(): boolean {
  return Boolean(
    env.GMAIL_SERVICE_ACCOUNT_JSON &&
      env.GMAIL_IMPERSONATE_EMAIL &&
      env.GMAIL_SENDER_EMAIL,
  );
}

/**
 * Devuelve si el envío salió, en vez de lanzar: quien llama necesita poder
 * decírselo a quien pulsó el botón, no quedarse a medias.
 */
export async function enviarCorreoConAdjunto(opciones: {
  para: string;
  asunto: string;
  cuerpo: string;
  pdf: Uint8Array;
  nombreArchivo: string;
  nombreRemitente: string;
}): Promise<boolean> {
  try {
    const accessToken = await obtenerAccessToken();

    const raw = base64Url(
      construirMensaje({
        de: `"${opciones.nombreRemitente}" <${env.GMAIL_SENDER_EMAIL}>`,
        para: opciones.para,
        asunto: opciones.asunto,
        cuerpo: opciones.cuerpo,
        pdf: opciones.pdf,
        nombreArchivo: opciones.nombreArchivo,
      }),
    );

    const respuesta = await fetch(URL_ENVIO, {
      method: "POST",
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!respuesta.ok) {
      console.warn(
        "Gmail respondió %d al enviar el correo: %s",
        respuesta.status,
        await respuesta.text(),
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("No se pudo enviar el correo por Gmail:", error);
    return false;
  }
}
