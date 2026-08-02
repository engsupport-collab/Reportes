import { logoutAction } from "@/actions/auth";
import { elegirEmpresaAction } from "@/actions/companies";
import { SideNav, type NavItem } from "@/components/side-nav";
import type { CurrentUser } from "@/lib/auth-guard";
import { formatFechaEncabezado, horaLocal } from "@/lib/fechas";
import { CompanySwitcher } from "./company-switcher";

function saludo(): string {
  // horaLocal() y no getHours(): este componente se renderiza en el servidor,
  // que en Vercel corre en UTC. Sin la conversión, el saludo diría "buenas
  // noches" a las tres de la tarde en Colombia.
  const hora = horaLocal();
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

function navPara(role: CurrentUser["role"]): NavItem[] {
  if (role === "admin") {
    return [
      { href: "/admin", label: "Panel", icono: "panel" },
      { href: "/admin/reportes", label: "Reportes", icono: "reportes" },
      { href: "/reportes/nuevo", label: "Nuevo reporte", icono: "nuevo" },
      { href: "/admin/usuarios", label: "Usuarios", icono: "usuarios" },
    ];
  }
  return [
    { href: "/reportes", label: "Mis reportes", icono: "reportes" },
    { href: "/reportes/nuevo", label: "Nuevo reporte", icono: "nuevo" },
  ];
}

/**
 * Marco común de las dos vistas: rail de navegación a la izquierda y el
 * contenido de la página a la derecha.
 *
 * Recibe el usuario ya resuelto en vez de consultarlo por su cuenta: la página
 * que lo usa tiene que haber llamado antes a requireUser() o requireAdmin(),
 * así la comprobación de acceso ocurre siempre antes de renderizar nada.
 */
export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen md:flex">
      <SideNav
        user={user}
        nav={navPara(user.role)}
        onCerrarSesion={logoutAction}
      >
        {/* El admin no elige empresa a nivel de sesión — ve las dos siempre y
            filtra dentro de cada página. El cambiador solo aplica al empleado,
            que sí trabaja "dentro de" una empresa a la vez. */}
        {user.empresaActiva ? (
          <CompanySwitcher
            empresas={user.empresas}
            activa={user.empresaActiva}
            onCambiar={elegirEmpresaAction}
          />
        ) : null}
      </SideNav>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {saludo()}, {user.fullName.split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm capitalize text-muted">
              {formatFechaEncabezado()}
            </p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
