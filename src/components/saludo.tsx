import { getLocale, getTranslations } from "next-intl/server";

import { formatFechaEncabezado, horaLocal } from "@/lib/fechas";
import { type Idioma, REGION } from "@/lib/idiomas";

/**
 * "Buenas tardes, Camilo" con la fecha debajo.
 *
 * Vive fuera del marco de la aplicación y lo renderiza cada pantalla que lo
 * quiera. Antes lo ponía `AppShell` con un `saludo={false}` para apagarlo, y
 * eso dejó de ser posible al subir el marco a un layout: un layout no sabe —ni
 * debe saber— qué página tiene debajo. Que cada pantalla lo pida es además más
 * honesto, porque es contenido de la pantalla, no parte del marco.
 *
 * No lo llevan el perfil ni las analíticas: en el perfil, "Buenas noches,
 * Administrador" justo encima de la ficha del propio usuario dice dos veces lo
 * mismo.
 */
export async function Saludo({ nombreCompleto }: { nombreCompleto: string }) {
  const [t, locale] = await Promise.all([getTranslations("saludo"), getLocale()]);

  // horaLocal() y no getHours(): esto se renderiza en el servidor, que en
  // Vercel corre en UTC. Sin la conversión, el saludo diría "buenas noches" a
  // las tres de la tarde en Colombia.
  const hora = horaLocal();
  const momento = hora < 12 ? "manana" : hora < 19 ? "tarde" : "noche";

  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-text">
        {t(momento)}, {nombreCompleto.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm capitalize text-muted">
        {formatFechaEncabezado(new Date(), REGION[locale as Idioma])}
      </p>
    </div>
  );
}
