import { getTranslations } from "next-intl/server";

import { logoutAction } from "@/actions/auth";
import { elegirEmpresaAction } from "@/actions/companies";
import { ShellChrome } from "@/components/shell-chrome";
import type { NavItem } from "@/components/side-nav";
import type { CurrentUser } from "@/lib/auth-guard";
import { CompanySwitcher } from "./company-switcher";

async function navPara(user: CurrentUser): Promise<NavItem[]> {
  const t = await getTranslations("nav");

  if (user.role === "admin") {
    // El orden sigue el recorrido real del trabajo, no las categorías: se
    // cotiza, se reporta contra esa cotización, y los catálogos y consultas
    // (clientes, reportes, analíticas, usuarios) van después.
    return [
      { href: "/admin", label: t("panel"), icono: "panel" },
      {
        href: "/admin/cotizaciones",
        label: t("cotizaciones"),
        icono: "cotizaciones",
      },
      { href: "/reportes/nuevo", label: t("nuevoReporte"), icono: "nuevo" },
      { href: "/admin/clientes", label: t("clientes"), icono: "clientes" },
      { href: "/admin/reportes", label: t("reportes"), icono: "reportes" },
      {
        // Las opciones salen de las empresas reales del sistema: si mañana hay
        // una tercera, aparece sola sin tocar este archivo. El nombre de cada
        // empresa no se traduce: es un dato, no texto de la interfaz.
        href: "/admin/analiticas",
        label: t("analiticas"),
        icono: "analiticas",
        hijos: user.empresas.map((e) => ({
          href: `/admin/analiticas/${e.id}`,
          label: e.name,
        })),
      },
      { href: "/admin/usuarios", label: t("usuarios"), icono: "usuarios" },
    ];
  }
  return [
    { href: "/reportes", label: t("misReportes"), icono: "reportes" },
    { href: "/reportes/nuevo", label: t("nuevoReporte"), icono: "nuevo" },
  ];
}

/**
 * Marco común de las dos vistas: rail a la izquierda, barra superior arriba.
 *
 * Lo monta el layout del grupo `(app)`, NO cada página. Esa es la diferencia
 * que hace que cambiar de sección se sienta instantáneo: el marco queda por
 * encima del segmento que cambia, así que React conserva sus nodos y solo
 * sustituye el contenido. Cuando lo montaba cada página, el rail y la barra
 * eran parte del segmento de la página y se destruían y reconstruían en cada
 * clic — medido: 275 nodos, entre el 39% y el 59% del árbol, cada vez.
 *
 * Sigue recibiendo el usuario en vez de consultarlo por su cuenta: quien lo
 * monta ya lo resolvió. La comprobación de permisos de verdad vive en cada
 * página, que es donde tiene que estar — un layout no protege lo que cuelga
 * de él.
 */
export async function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const nav = await navPara(user);

  return (
    <ShellChrome
      user={user}
      nav={nav}
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
      {children}
    </ShellChrome>
  );
}
