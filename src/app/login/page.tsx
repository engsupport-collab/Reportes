import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";
import { Logotipo } from "@/components/logotipo";

export const metadata: Metadata = {
  title: "Ingresar · Gestor de Reportes",
};

/** Fondo del panel de marca. */
const PANEL = "#0a6b76";


/**
 * Pantalla de ingreso.
 *
 * Es la única ruta pública del sistema y no consulta la base de datos, así que
 * Next.js la puede pre-renderizar y servir desde el CDN. Eso importa: es la
 * primera pantalla que ve cualquiera, y si tarda, la aplicación entera se
 * percibe lenta. Ver PLAN.md, sección 7.1.
 *
 * Va partida en dos: el formulario a la izquierda y un panel de marca a la
 * derecha. El panel es el único sitio del sistema con espacio de sobra para la
 * identidad, y es lo primero que ve alguien que entra.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center bg-surface px-6 py-12 sm:px-14">
        <div className="w-full max-w-md">
          {/* El lockup completo y grande: es la única pantalla donde el
              logotipo se lee entero, subtítulo incluido. Centrado, aunque el
              resto de la columna vaya alineado a la izquierda: la marca
              preside, no forma parte de la lectura del formulario. */}
          <div className="flex justify-center">
            <Logotipo alto={108} />
          </div>

          {/* En violeta y no en el azul de la marca: repetir el azul del
              logotipo en la palabra de encima del titular los ata visualmente
              y la página se queda en un solo tono. Este es el acento
              secundario de la paleta, el que existe justo para lo que no es
              ni marca ni estado. */}
          <p className="mt-14 text-xs font-bold uppercase tracking-[0.2em] text-accent">
            Bienvenido
          </p>
          {/* En el azul de la marca: el logotipo está justo encima y el
              titular en otro color se leería como que no van juntos. */}
          <h1 className="mt-3 text-6xl font-bold leading-[1.05] tracking-wide text-marca">
            Ingresa a tu cuenta
          </h1>
          <p className="mt-4 text-base italic text-muted">
            Registra tus trabajos de forma rápida y sencilla.
          </p>

          <div className="mt-10">
            <LoginForm />
          </div>

          <p className="mt-12 text-xs text-muted">Sistema de reportes</p>
        </div>
      </div>

      {/* Panel de marca. Su color no cambia con el modo claro/oscuro: es color
          de marca, no de interfaz — igual que la portada de un catálogo no se
          vuelve gris porque se apague la luz. El blanco sobre este tono da
          6,2:1, suficiente para el titular y también para el texto pequeño.

          Oculto por debajo de `lg`: en el celular no hay sitio para las dos
          mitades, y lo que no puede faltar es el formulario. */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-end"
        style={{
          background: `linear-gradient(150deg, ${PANEL} 0%, #085760 55%, #064a52 100%)`,
        }}
      >
        {/* Formas de fondo, muy tenues: dan profundidad sin competir con el
            texto. aria-hidden porque no significan nada. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-40 -top-40 h-[38rem] w-[38rem] rounded-full border border-white/10" />
          <div className="absolute -right-24 top-10 h-[26rem] w-[26rem] rounded-full bg-white/5" />
          <div className="absolute bottom-1/3 left-1/4 h-56 w-80 -rotate-12 rounded-full bg-white/5" />
        </div>

        <div className="relative max-w-lg p-12 xl:p-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
            Todo en un solo reporte
          </p>
          <p className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
            Cada trabajo,
            <br />
            con su respaldo.
          </p>
          <p className="mt-4 text-sm text-white/80">
            Fotos, firma y viáticos en el mismo lugar.
          </p>
        </div>
      </div>
    </main>
  );
}
