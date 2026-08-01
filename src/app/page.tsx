import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth-guard";
import { rutaInicio } from "@/lib/roles";

/**
 * Raíz del sitio: no muestra nada, solo manda a cada quien a donde corresponde.
 * El admin va directo a su panel — nunca elige empresa. Un empleado sin empresa
 * elegida va al selector; si ya eligió, a su vista.
 */
export default async function HomePage() {
  const user = await requireUser();

  if (user.role !== "admin" && !user.empresaActiva) redirect("/empresas");
  redirect(rutaInicio(user.role));
}
