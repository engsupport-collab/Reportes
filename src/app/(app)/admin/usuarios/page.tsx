import { getTranslations } from "next-intl/server";

import { CrearUsuarioForm } from "@/components/admin/crear-usuario-form";
import { ToggleMostrarInactivos } from "@/components/admin/toggle-mostrar-inactivos";
import { UsersTable } from "@/components/admin/users-table";
import { Saludo } from "@/components/saludo";
import { requireAdmin } from "@/lib/auth-guard";
import { listarUsuarios, todasLasEmpresas } from "@/lib/queries/users";

type Params = { searchParams: Promise<{ desactivados?: string }> };

/**
 * Gestión de usuarios: alta, acceso por empresa, activar/desactivar, reseteo
 * de contraseña, y eliminar (solo un usuario ya desactivado, y solo si nunca
 * creó nada — ver `eliminarUsuarioAction`). No hay registro público en ningún
 * punto del sistema — esta pantalla, protegida por requireAdmin(), es la
 * única forma de que exista una cuenta nueva.
 *
 * Por defecto se ven solo los activos; la casilla de arriba trae también los
 * desactivados.
 */
export default async function UsuariosPage({ searchParams }: Params) {
  const user = await requireAdmin();
  const { desactivados } = await searchParams;
  const mostrarDesactivados = desactivados === "1";

  const [usuarios, empresas, t] = await Promise.all([
    listarUsuarios({ incluirInactivos: mostrarDesactivados }),
    todasLasEmpresas(),
    getTranslations("usuarios"),
  ]);

  return (
    <>
      <Saludo nombreCompleto={user.fullName} />

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">{t("nuevoUsuario")}</h2>
          <CrearUsuarioForm empresas={empresas} />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text">
              {t("listado", { count: usuarios.length })}
            </h2>
            <ToggleMostrarInactivos
              href={
                mostrarDesactivados
                  ? "/admin/usuarios"
                  : "/admin/usuarios?desactivados=1"
              }
              activo={mostrarDesactivados}
              etiqueta={t("mostrarDesactivados")}
            />
          </div>
          <UsersTable
            usuarios={usuarios}
            empresas={empresas}
            idUsuarioActual={user.id}
          />
        </section>
      </div>
    </>
  );
}
