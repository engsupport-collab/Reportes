import { logoutAction } from "@/actions/auth";
import { elegirEmpresaAction } from "@/actions/companies";
import { ShellChrome } from "@/components/shell-chrome";
import type { NavItem } from "@/components/side-nav";
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

function navPara(user: CurrentUser): NavItem[] {
  if (user.role === "admin") {
    return [
      { href: "/admin", label: "Panel", icono: "panel" },
      { href: "/admin/reportes", label: "Reportes", icono: "reportes" },
      {
        // Las opciones salen de las empresas reales del sistema: si mañana hay
        // una tercera, aparece sola sin tocar este archivo.
        href: "/admin/analiticas",
        label: "Analíticas",
        icono: "analiticas",
        hijos: user.empresas.map((e) => ({
          href: `/admin/analiticas/${e.id}`,
          label: e.name,
        })),
      },
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
 * Marco común de las dos vistas.
 *
 * Recibe el usuario ya resuelto en vez de consultarlo por su cuenta: la página
 * que lo usa tiene que haber llamado antes a requireUser() o requireAdmin(),
 * así la comprobación de acceso ocurre siempre antes de renderizar nada.
 *
 * `saludo` acepta ocultarse porque no toda pantalla lo quiere: en el perfil,
 * "Buenas noches, Administrador" justo encima de la ficha del propio usuario
 * dice dos veces lo mismo.
 */
export function AppShell({
  user,
  saludo: mostrarSaludo = true,
  children,
}: {
  user: CurrentUser;
  saludo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ShellChrome
      user={user}
      nav={navPara(user)}
      onCerrarSesion={logoutAction}
      selectorEmpresa={
        // El admin no elige empresa a nivel de sesión — ve las dos siempre y
        // filtra dentro de cada página. El cambiador solo aplica al empleado,
        // que sí trabaja "dentro de" una empresa a la vez.
        user.empresaActiva ? (
          <CompanySwitcher
            empresas={user.empresas}
            activa={user.empresaActiva}
            onCambiar={elegirEmpresaAction}
          />
        ) : null
      }
    >
      {mostrarSaludo ? (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {saludo()}, {user.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm capitalize text-muted">
            {formatFechaEncabezado()}
          </p>
        </div>
      ) : null}
      {children}
    </ShellChrome>
  );
}
