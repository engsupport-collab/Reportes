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
      <div className="flex items-center justify-center bg-surface px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-4">
            <Logotipo tamano="grande" />
            {/* Separador y bajada: dicen qué es esto, no solo de quién es.
                Cuando entre el logotipo del cliente, el nombre del sistema
                tiene que seguir leyéndose aparte de la marca. */}
            <span className="h-9 w-px bg-border" />
            <span className="text-xs font-semibold uppercase leading-tight tracking-widest text-muted">
              Reportes
              <br />
              de trabajo
            </span>
          </div>

          <p className="mt-12 text-xs font-semibold uppercase tracking-widest text-brand">
            Bienvenido
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">
            Ingresa a tu cuenta
          </h1>
          <p className="mt-2 text-sm text-muted">
            Registra tus trabajos de forma rápida y sencilla.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>

          <p className="mt-10 text-xs text-muted">
            Sistema interno. El acceso queda registrado.
          </p>
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
