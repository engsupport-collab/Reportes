import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth-guard";

/**
 * Marco de la aplicación autenticada.
 *
 * Va aquí, en el grupo `(app)`, y no dentro de `admin/`: el rail lleva
 * indistintamente a `admin/...` y a `reportes/nuevo`, así que el punto donde
 * esos módulos comparten navegación es este, un nivel por encima de los dos.
 * Puesto en `admin/`, saltar de Cotizaciones a Nuevo reporte volvería a
 * desmontar el marco entero — que es justo lo que este archivo existe para
 * evitar.
 *
 * Al vivir por encima del segmento que cambia, React conserva el rail y la
 * barra superior entre navegaciones: solo se sustituye `children`.
 *
 * Sobre permisos: `requireUser()` está aquí para poder pintar el marco (hace
 * falta el nombre, el rol y las empresas), NO como control de acceso. Cada
 * página conserva su propio `requireAdmin()` / `requireAccesoReportes()`,
 * porque un layout no es una barrera fiable: Next puede reutilizarlo entre
 * navegaciones y no vuelve a ejecutarlo. La autorización se comprueba donde
 * se usa el dato, no en el marco que lo rodea.
 *
 * La consulta del usuario no se duplica: `getCurrentUser` está memoizada por
 * petición con el `cache()` de React, así que el layout y la página comparten
 * una sola lectura.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return <AppShell user={user}>{children}</AppShell>;
}
