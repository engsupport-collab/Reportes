"use client";

import { useState } from "react";

import { SideNav, type NavItem } from "@/components/side-nav";
import { TopBar } from "@/components/top-bar";
import type { CurrentUser } from "@/lib/auth-guard";

/**
 * Arma el marco de la aplicación: rail a la izquierda, barra superior encima
 * del contenido.
 *
 * Existe como componente de cliente aparte solo por el cajón del celular: el
 * botón que lo abre está en la barra superior y el cajón es el rail, así que el
 * estado tiene que vivir en algo que contenga a los dos. Todo lo que se le pasa
 * (`children`, `selectorEmpresa`) se sigue renderizando en el servidor — cruzar
 * esta frontera no los convierte en cliente.
 */
export function ShellChrome({
  user,
  nav,
  onCerrarSesion,
  selectorEmpresa,
  children,
}: {
  user: CurrentUser;
  nav: NavItem[];
  onCerrarSesion: () => void | Promise<void>;
  selectorEmpresa?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="min-h-screen md:flex">
      <SideNav
        user={user}
        nav={nav}
        onCerrarSesion={onCerrarSesion}
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
      >
        {selectorEmpresa}
      </SideNav>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} onAbrirMenu={() => setMenuAbierto(true)} />

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
