import { getTranslations } from "next-intl/server";

import { ClientsTable } from "@/components/admin/clients-table";
import { CrearClienteForm } from "@/components/admin/crear-cliente-form";
import { ToggleMostrarInactivos } from "@/components/admin/toggle-mostrar-inactivos";
import { Saludo } from "@/components/saludo";
import { requireAdmin } from "@/lib/auth-guard";
import { listarClientes } from "@/lib/queries/clients";
import { listarEmpresas } from "@/lib/queries/companies";

type Params = { searchParams: Promise<{ inactivos?: string }> };

/**
 * Catálogo de clientes: alta, edición del nombre, activar/desactivar, y
 * eliminar (solo un cliente ya desactivado, y solo si no tiene cotizaciones
 * — ver `eliminarClienteAction`). Por defecto se ven solo los activos; la
 * casilla de arriba trae también los desactivados.
 *
 * Solo el admin: es la fuente oficial que reemplaza el texto libre que un
 * técnico escribía a mano en cada cotización. El técnico solo elige de aquí,
 * nunca crea ni edita.
 */
export default async function ClientesPage({ searchParams }: Params) {
  const user = await requireAdmin();
  const { inactivos } = await searchParams;
  const mostrarInactivos = inactivos === "1";

  const [clientes, empresas, t] = await Promise.all([
    listarClientes(undefined, { incluirInactivos: mostrarInactivos }),
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text">
              {t("listado", { count: clientes.length })}
            </h2>
            <ToggleMostrarInactivos
              href={mostrarInactivos ? "/admin/clientes" : "/admin/clientes?inactivos=1"}
              activo={mostrarInactivos}
              etiqueta={t("mostrarInactivos")}
            />
          </div>
          <ClientsTable clientes={clientes} />
        </section>
      </div>
    </>
  );
}
