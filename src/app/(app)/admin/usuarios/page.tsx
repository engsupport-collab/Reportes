import { AppShell } from "@/components/app-shell";
import { CrearUsuarioForm } from "@/components/admin/crear-usuario-form";
import { UsersTable } from "@/components/admin/users-table";
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

  const [usuarios, empresas] = await Promise.all([
    listarUsuarios(),
    todasLasEmpresas(),
  ]);

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">Nuevo usuario</h2>
          <CrearUsuarioForm empresas={empresas} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">
            Usuarios ({usuarios.length})
          </h2>
          <UsersTable
            usuarios={usuarios}
            empresas={empresas}
            idUsuarioActual={user.id}
          />
        </section>
      </div>
    </AppShell>
  );
}
