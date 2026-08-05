import { getTranslations } from "next-intl/server";

import { CrearUsuarioForm } from "@/components/admin/crear-usuario-form";
import { UsersTable } from "@/components/admin/users-table";
import { Saludo } from "@/components/saludo";
import { requireAdmin } from "@/lib/auth-guard";
import { listarUsuarios, todasLasEmpresas } from "@/lib/queries/users";

/**
 * Gestión de usuarios: alta, acceso por empresa, activar/desactivar, reseteo
 * de contraseña. No hay registro público en ningún punto del sistema — esta
 * pantalla, protegida por requireAdmin(), es la única forma de que exista una
 * cuenta nueva.
 */
export default async function UsuariosPage() {
  const user = await requireAdmin();

  const [usuarios, empresas, t] = await Promise.all([
    listarUsuarios(),
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
          <h2 className="mb-3 text-sm font-semibold text-text">
            {t("listado", { count: usuarios.length })}
          </h2>
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
