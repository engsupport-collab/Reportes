import { getLocale, getTranslations } from "next-intl/server";

import { logoutAction } from "@/actions/auth";
import { elegirEmpresaAction } from "@/actions/companies";
import { ShellChrome } from "@/components/shell-chrome";
import type { NavItem } from "@/components/side-nav";
import type { CurrentUser } from "@/lib/auth-guard";
import { formatFechaEncabezado, horaLocal } from "@/lib/fechas";
import { type Idioma, REGION } from "@/lib/idiomas";
import { CompanySwitcher } from "./company-switcher";

async function saludo(): Promise<string> {
  const t = await getTranslations("saludo");
  // horaLocal() y no getHours(): este componente se renderiza en el servidor,
  // que en Vercel corre en UTC. Sin la conversión, el saludo diría "buenas
  // noches" a las tres de la tarde en Colombia.
  const hora = horaLocal();
  if (hora < 12) return t("manana");
  if (hora < 19) return t("tarde");
  return t("noche");
}

async function navPara(user: CurrentUser): Promise<NavItem[]> {
  const t = await getTranslations("nav");

  if (user.role === "admin") {
    return [
      { href: "/admin", label: t("panel"), icono: "panel" },
      { href: "/admin/reportes", label: t("reportes"), icono: "reportes" },
      {
        href: "/admin/cotizaciones",
        label: t("cotizaciones"),
        icono: "cotizaciones",
      },
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
      { href: "/reportes/nuevo", label: t("nuevoReporte"), icono: "nuevo" },
      { href: "/admin/usuarios", label: t("usuarios"), icono: "usuarios" },
    ];
  }
  return [
    { href: "/reportes", label: t("misReportes"), icono: "reportes" },
    { href: "/reportes/nuevo", label: t("nuevoReporte"), icono: "nuevo" },
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
export async function AppShell({
  user,
  saludo: mostrarSaludo = true,
  children,
}: {
  user: CurrentUser;
  saludo?: boolean;
  children: React.ReactNode;
}) {
  // En paralelo: son consultas independientes, y una pantalla sin saludo
  // (como el perfil) no debería esperar por ninguna de las dos.
  const [nav, saludoTexto, locale] = await Promise.all([
    navPara(user),
    mostrarSaludo ? saludo() : Promise.resolve(null),
    getLocale(),
  ]);

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
      {saludoTexto ? (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {saludoTexto}, {user.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm capitalize text-muted">
            {formatFechaEncabezado(new Date(), REGION[locale as Idioma])}
          </p>
        </div>
      ) : null}
      {children}
    </ShellChrome>
  );
}
