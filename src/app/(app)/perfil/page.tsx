import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { cambiarMiContrasenaAction } from "@/actions/perfil";
import { AppShell } from "@/components/app-shell";
import { CambiarPassword } from "@/components/perfil/cambiar-password";
import { requireUser } from "@/lib/auth-guard";
import { formatFechaLarga } from "@/lib/fechas";
import { type Idioma, REGION } from "@/lib/idiomas";
import { obtenerCuenta } from "@/lib/queries/users";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {etiqueta}
      </dt>
      <dd className="mt-1 text-sm text-text">{valor}</dd>
    </div>
  );
}

/**
 * Perfil de la propia cuenta.
 *
 * Es del usuario de la sesión, no de un id que venga por la URL: un perfil
 * direccionable por parámetro es una puerta para leer la cuenta de otro. Para
 * gestionar cuentas ajenas está /admin/usuarios, detrás de requireAdmin().
 */
export default async function PerfilPage() {
  const user = await requireUser();
  const [cuenta, t, tNav, locale] = await Promise.all([
    obtenerCuenta(user.id),
    getTranslations("perfil"),
    getTranslations("nav"),
    getLocale(),
  ]);
  const region = REGION[locale as Idioma];

  // La sesión sigue siendo válida pero la cuenta ya no está: pasa si un admin
  // la borra mientras la persona la tiene abierta.
  if (!cuenta) notFound();

  const esAdmin = user.role === "admin";

  return (
    <AppShell user={user} saludo={false}>
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="h-24 bg-gradient-to-r from-brand to-brand-strong" />

          {/* El avatar se posiciona en absoluto, montado a caballo sobre el
              borde del banner. Antes el nombre iba alineado al fondo del
              avatar dentro del mismo flex, y como el avatar sube 40px el
              nombre terminaba escrito encima del color. Así el texto queda
              siempre debajo de la línea, sin depender de cuánto mida. */}
          <span
            aria-hidden
            className="absolute left-5 top-24 flex h-20 w-20 -translate-y-1/2 items-center justify-center rounded-full border-4 border-surface bg-brand-soft text-2xl font-bold text-brand sm:left-6"
          >
            {cuenta.fullName.trim().charAt(0).toUpperCase()}
          </span>

          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="ml-24 min-h-11 pt-3 sm:ml-[6.5rem]">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-text">
                  {cuenta.fullName}
                </h2>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                  {tNav(esAdmin ? "administrador" : user.role === "contable" ? "contable" : "empleado")}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted">@{cuenta.username}</p>
            </div>

            <dl className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-3">
              <Dato etiqueta={t("usuario")} valor={cuenta.username} />
              <Dato
                etiqueta={esAdmin ? t("empresasDelSistema") : t("empresas")}
                valor={
                  user.empresas.map((e) => e.name).join(", ") || t("ninguna")
                }
              />
              <Dato
                etiqueta={t("cuentaCreada")}
                valor={formatFechaLarga(cuenta.createdAt, region)}
              />
            </dl>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-text">
            {t("cambiarContrasena")}
          </h3>
          <p className="mb-4 mt-1 text-sm text-muted">
            {t("cambiarContrasenaDesc")}
          </p>
          <CambiarPassword action={cambiarMiContrasenaAction} />
        </div>
      </div>
    </AppShell>
  );
}
