/**
 * Prueba de cómo se arma y se manda el correo con el reporte.
 *
 *   npm run test:correo
 *
 * NO envía ningún correo ni habla con Google: `fetch` se reemplaza por uno de
 * mentira que anota lo que se le pide y contesta lo que la prueba le diga. Las
 * credenciales también son de mentira — una clave generada aquí mismo, que no
 * abre nada.
 *
 * Lo que comprueba es lo que no se ve hasta que falla en producción: que el
 * mensaje va por el punto de subida de Gmail y sin doble codificación (un PDF
 * de varios megas no cabe por el otro), que el adjunto llega idéntico, que la
 * copia a administración va donde debe y a la vista, que el texto sale en el
 * idioma del reporte, y que cuando Google contesta mal queda dicho por qué.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";

import { config } from "dotenv";

config({ path: ".env.local" });

// Después de dotenv, para pisar lo que hubiera en .env.local: esta prueba
// nunca debe correr con las credenciales reales.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.GMAIL_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "prueba@ejemplo.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});
process.env.GMAIL_IMPERSONATE_EMAIL = "buzon@ejemplo.com";
process.env.GMAIL_SENDER_EMAIL = "remitente@ejemplo.com";
// Como en producción: sin definir, que es cuando la copia sale por defecto.
delete process.env.GMAIL_CC_EMAIL;

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

type Peticion = { url: string; metodo: string; cabeceras: Headers; cuerpo: string };

const peticiones: Peticion[] = [];
let contestarToken: () => Response | Promise<Response> = () =>
  Response.json({ access_token: "token-de-prueba" });
let contestarEnvio: () => Response | Promise<Response> = () => Response.json({ id: "1" });

const fetchReal = globalThis.fetch;
globalThis.fetch = async (entrada, opciones) => {
  const url = String(entrada);
  peticiones.push({
    url,
    metodo: opciones?.method ?? "GET",
    cabeceras: new Headers(opciones?.headers),
    cuerpo: typeof opciones?.body === "string" ? opciones.body : String(opciones?.body ?? ""),
  });
  if (url.startsWith("https://oauth2.googleapis.com/")) return contestarToken();
  if (url.startsWith("https://gmail.googleapis.com/")) return contestarEnvio();
  throw new Error(`La prueba no esperaba una petición a ${url}`);
};

/** Parte un mensaje MIME de dos partes en sus cabeceras y sus cuerpos. */
function leerMensaje(mensaje: string) {
  const [cabecerasTexto] = mensaje.split("\r\n\r\n", 1);
  const cabeceras = new Map(
    cabecerasTexto!.split("\r\n").map((linea) => {
      const corte = linea.indexOf(": ");
      return [linea.slice(0, corte), linea.slice(corte + 2)] as const;
    }),
  );
  const limite = /boundary="([^"]+)"/.exec(cabeceras.get("Content-Type") ?? "")?.[1] ?? "";
  const partes = mensaje
    .split(`--${limite}`)
    .slice(1, -1)
    .map((parte) => {
      const corte = parte.indexOf("\r\n\r\n");
      return { cabeceras: parte.slice(0, corte), cuerpo: parte.slice(corte + 4).trimEnd() };
    });
  return { cabeceras, partes };
}

async function main() {
  const { copiaPara, correoConfigurado, enviarCorreoConAdjunto, resolverCopia } = await import(
    "../src/lib/gmail"
  );

  // Como el PDF de un reporte con varias fotos: 3 MB que no se comprimen.
  const pdf = new Uint8Array(randomBytes(3 * 1024 * 1024));
  const datos = {
    para: "cliente@ejemplo.com",
    copia: "administracion@ejemplo.com",
    asunto: "Reporte firmado — Instalación eléctrica Ñandú",
    cuerpo: "Hola José,\n\nAdjunto encontrarás el reporte.\n\nGracias,",
    pdf,
    nombreArchivo: "reporte-instalacion-electrica-nandu.pdf",
    nombreRemitente: "Eng Supports",
  };

  console.log("\nUn envío que sale bien\n");

  comprobar("con las tres variables el envío está configurado", correoConfigurado());

  const resultado = await enviarCorreoConAdjunto(datos);
  comprobar("devuelve que salió", resultado.ok);
  comprobar(
    "son dos peticiones: pedir el permiso y mandar el mensaje",
    peticiones.length === 2,
    `${peticiones.length}`,
  );

  const envio = peticiones[1];
  if (envio) {
    comprobar(
      "el mensaje va por el punto de subida de Gmail, no por el de JSON",
      envio.url ===
        "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media" &&
        envio.metodo === "POST",
      envio.url,
    );
    comprobar(
      "viaja como mensaje de correo tal cual, con el permiso recibido",
      envio.cabeceras.get("content-type") === "message/rfc822" &&
        envio.cabeceras.get("authorization") === "Bearer token-de-prueba",
    );
    comprobar(
      "sin doble codificación: pesa lo del PDF más un tercio, no casi el doble",
      envio.cuerpo.length < pdf.length * 1.45,
      `${(envio.cuerpo.length / pdf.length).toFixed(2)} veces el PDF`,
    );

    const { cabeceras, partes } = leerMensaje(envio.cuerpo);
    comprobar(
      "remitente y destinatario",
      cabeceras.get("From") === '"Eng Supports" <remitente@ejemplo.com>' &&
        cabeceras.get("To") === "cliente@ejemplo.com",
    );
    comprobar(
      "la copia va a la vista (Cc), a quien se le indicó, y no hay copia oculta",
      cabeceras.get("Cc") === "administracion@ejemplo.com" && !cabeceras.has("Bcc"),
      cabeceras.get("Cc") ?? "sin Cc",
    );
    const asunto = /^=\?UTF-8\?B\?(.+)\?=$/.exec(cabeceras.get("Subject") ?? "")?.[1] ?? "";
    comprobar(
      "el asunto llega con sus tildes y su eñe",
      Buffer.from(asunto, "base64").toString("utf8") === datos.asunto,
    );
    comprobar("el mensaje tiene dos partes: el texto y el adjunto", partes.length === 2);
    if (partes.length === 2) {
      comprobar(
        "el texto llega igual",
        Buffer.from(partes[0]!.cuerpo, "base64").toString("utf8") === datos.cuerpo,
      );
      comprobar(
        "el adjunto se llama como el reporte y se declara como PDF",
        partes[1]!.cabeceras.includes(`filename="${datos.nombreArchivo}"`) &&
          partes[1]!.cabeceras.includes("application/pdf"),
      );
      comprobar(
        "el PDF llega idéntico, byte por byte",
        Buffer.compare(Buffer.from(partes[1]!.cuerpo, "base64"), Buffer.from(pdf)) === 0,
      );
      comprobar(
        "ningún renglón del adjunto pasa de los 76 caracteres que admite el correo",
        partes[1]!.cuerpo.split("\r\n").every((renglon) => renglon.length <= 76),
      );
    }
  }

  console.log("\nLa copia a administración\n");

  peticiones.length = 0;
  await enviarCorreoConAdjunto({ ...datos, copia: null });
  const sinCopia = peticiones[1] ? leerMensaje(peticiones[1].cuerpo).cabeceras : new Map();
  comprobar(
    "contraste: un correo al que no se le indica copia sale sin Cc",
    sinCopia.get("To") === "cliente@ejemplo.com" && !sinCopia.has("Cc"),
  );

  const remitente = "soporte@empresa.com.co";
  comprobar(
    "sin nada configurado, la copia va al buzón de administración del dominio que envía",
    resolverCopia({ configurada: undefined, remitente, destinatario: "cliente@otra.com" }) ===
      "administracion@empresa.com.co",
    resolverCopia({ configurada: undefined, remitente, destinatario: "cliente@otra.com" }) ?? "sin copia",
  );
  comprobar(
    "con otra dirección configurada, va a esa",
    resolverCopia({
      configurada: "contabilidad@empresa.com.co",
      remitente,
      destinatario: "cliente@otra.com",
    }) === "contabilidad@empresa.com.co",
  );
  comprobar(
    "configurada vacía, no se copia a nadie (así va en desarrollo)",
    resolverCopia({ configurada: "", remitente, destinatario: "cliente@otra.com" }) === null,
  );
  comprobar(
    "si quien firma es el propio buzón de administración, no se le manda dos veces",
    resolverCopia({
      configurada: undefined,
      remitente,
      destinatario: " Administracion@Empresa.com.co ",
    }) === null,
  );
  comprobar(
    "con la configuración de esta prueba, la copia sale del dominio del remitente",
    copiaPara("cliente@otra.com") === "administracion@ejemplo.com",
    copiaPara("cliente@otra.com") ?? "sin copia",
  );

  console.log("\nEl correo va en el idioma del reporte\n");

  const { textosDeEmpresa } = await import("../src/lib/pdf-idioma");
  const ENLACE = "https://ejemplo.com/api/reportes/publico/abc";
  const enIngles = textosDeEmpresa("corp");
  const enEspanol = textosDeEmpresa("saas");
  const cuerpoIngles = enIngles.correoCuerpo("John Smith", "HMI Intarema", ENLACE, "Eng Supports");
  const cuerpoEspanol = enEspanol.correoCuerpo("José Pérez", "HMI Intarema", ENLACE, "Eng Supports");
  comprobar(
    "el de un reporte de la LLC, en inglés: asunto, saludo, texto y despedida",
    enIngles.correoAsunto("HMI Intarema") === "Signed report — HMI Intarema" &&
      cuerpoIngles.startsWith("Hello John Smith,\n") &&
      cuerpoIngles.includes('Attached is the signed report for the project "HMI Intarema".') &&
      cuerpoIngles.includes(`You can also view it online: ${ENLACE}`) &&
      cuerpoIngles.endsWith("Thank you,\nEng Supports"),
    cuerpoIngles.split("\n")[0],
  );
  comprobar(
    "contraste: en el de inglés no quedó nada del texto en español",
    !/Hola|Adjunto|También|Gracias|Reporte firmado/.test(
      cuerpoIngles + enIngles.correoAsunto("HMI Intarema"),
    ),
  );
  comprobar(
    "el de la SAS sigue como estaba",
    enEspanol.correoAsunto("HMI Intarema") === "Reporte firmado — HMI Intarema" &&
      cuerpoEspanol ===
        `Hola José Pérez,\n\nAdjunto encontrarás el reporte firmado del proyecto "HMI Intarema".\n\nTambién puedes consultarlo en línea: ${ENLACE}\n\nGracias,\nEng Supports`,
  );
  comprobar(
    "sin enlace, el texto no deja la frase a medias",
    !enIngles.correoCuerpo("John", "X", null, "Eng Supports").includes("online") &&
      !enEspanol.correoCuerpo("José", "X", null, "Eng Supports").includes("en línea"),
  );

  console.log("\nCuando no sale, queda dicho por qué\n");

  // Estos casos hacen que el código avise por consola, que es lo correcto en
  // producción; aquí solo estorbaría entre los resultados.
  const avisar = console.warn;
  console.warn = () => {};

  const CASOS: [string, () => void, string][] = [
    [
      "Gmail rechaza el mensaje por grande",
      () => {
        contestarEnvio = () => new Response("Request Entity Too Large", { status: 413 });
      },
      "Gmail: HTTP 413",
    ],
    [
      "Gmail rechaza la dirección",
      () => {
        contestarEnvio = () => Response.json({ error: { message: "Invalid To header" } }, { status: 400 });
      },
      "Gmail: HTTP 400",
    ],
    [
      "Google no da el permiso",
      () => {
        contestarToken = () => Response.json({ error: "invalid_grant" }, { status: 400 });
      },
      "autorización de Google: HTTP 400",
    ],
    [
      "Google tarda más de lo que se espera",
      () => {
        contestarToken = () => {
          throw new DOMException("The operation timed out.", "TimeoutError");
        };
      },
      "tiempo agotado",
    ],
    [
      "no hay red",
      () => {
        contestarToken = () => {
          throw new TypeError("fetch failed");
        };
      },
      "sin respuesta de Google",
    ],
  ];

  for (const [nombre, preparar, causaEsperada] of CASOS) {
    contestarToken = () => Response.json({ access_token: "token-de-prueba" });
    contestarEnvio = () => Response.json({ id: "1" });
    preparar();
    const r = await enviarCorreoConAdjunto(datos);
    comprobar(
      `${nombre}: no lanza, y anota "${causaEsperada}"`,
      !r.ok && r.causa === causaEsperada,
      r.ok ? "dijo que salió" : r.causa,
    );
  }

  console.warn = avisar;
  globalThis.fetch = fetchReal;

  comprobar(
    "contraste: en toda la prueba no salió ninguna petición a un sitio no previsto",
    peticiones.every(
      (p) =>
        p.url.startsWith("https://oauth2.googleapis.com/") ||
        p.url.startsWith("https://gmail.googleapis.com/"),
    ),
    `${peticiones.length} peticiones, todas atendidas por la prueba`,
  );

  console.log(
    fallos === 0
      ? "\nTodas las comprobaciones pasaron.\n"
      : `\n${fallos} comprobación(es) fallaron.\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
