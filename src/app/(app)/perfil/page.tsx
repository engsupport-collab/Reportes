import { notFound } from "next/navigation";

import { cambiarMiContrasenaAction } from "@/actions/perfil";
import { AppShell } from "@/components/app-shell";
import { CambiarPassword } from "@/components/perfil/cambiar-password";
import { requireUser } from "@/lib/auth-guard";
import { formatFechaLarga } from "@/lib/fechas";
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
  const cuenta = await obtenerCuenta(user.id);

  // La sesión sigue siendo válida pero la cuenta ya no está: pasa si un admin
  // la borra mientras la persona la tiene abierta.
  if (!cuenta) notFound();

  const esAdmin = user.role === "admin";

  return (
    <AppShell user={user} saludo={false}>
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="h-24 bg-gradient-to-r from-brand to-brand-strong" />

          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="-mt-10 flex flex-wrap items-end gap-4">
              <span
                aria-hidden
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-surface bg-brand-soft text-2xl font-bold text-brand"
              >
                {cuenta.fullName.trim().charAt(0).toUpperCase()}
              </span>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-text">
                    {cuenta.fullName}
                  </h2>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                    {esAdmin ? "Administrador" : "Empleado"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted">@{cuenta.username}</p>
              </div>
            </div>

            <dl className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-3">
              <Dato etiqueta="Usuario" valor={cuenta.username} />
              <Dato
                etiqueta={esAdmin ? "Empresas del sistema" : "Empresas"}
                valor={user.empresas.map((e) => e.name).join(", ") || "Ninguna"}
              />
              <Dato
                etiqueta="Cuenta creada"
                valor={formatFechaLarga(cuenta.createdAt)}
              />
            </dl>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-text">
            Cambiar contraseña
          </h3>
          <p className="mb-4 mt-1 text-sm text-muted">
            Al cambiarla, la sesión actual sigue abierta. Nadie más conoce la
            contraseña nueva, ni siquiera un administrador.
          </p>
          <CambiarPassword action={cambiarMiContrasenaAction} />
        </div>
      </div>
    </AppShell>
  );
}
