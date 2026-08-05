import { getTranslations } from "next-intl/server";

import { ClientsTable } from "@/components/admin/clients-table";
import { CrearClienteForm } from "@/components/admin/crear-cliente-form";
import { Saludo } from "@/components/saludo";
import { requireAdmin } from "@/lib/auth-guard";
import { listarClientes } from "@/lib/queries/clients";
import { listarEmpresas } from "@/lib/queries/companies";

/**
 * Catálogo de clientes: alta, edición del nombre, activar/desactivar. Sin
 * borrado real — un cliente desactivado sale del selector de cotizaciones
 * nuevas, pero las que ya lo usan lo siguen mostrando.
 *
 * Solo el admin: es la fuente oficial que reemplaza el texto libre que un
 * técnico escribía a mano en cada cotización. El técnico solo elige de aquí,
 * nunca crea ni edita.
 */
export default async function ClientesPage() {
  const user = await requireAdmin();

  const [clientes, empresas, t] = await Promise.all([
    listarClientes(),
    listarEmpresas(),
    getTranslations("clientes"),
  ]);

  return (
    <>
      <Saludo nombreCompleto={user.fullName} />

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">
            {t("nuevoCliente")}
          </h2>
          <CrearClienteForm empresas={empresas} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">
            {t("listado", { count: clientes.length })}
          </h2>
          <ClientsTable clientes={clientes} />
        </section>
      </div>
    </>
  );
}
