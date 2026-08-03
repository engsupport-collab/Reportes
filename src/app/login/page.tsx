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
        {/* 40rem = 640px, porque el titular necesita 593px para caber en una
            sola línea a 60px. Con los 448px de antes partía en dos.
            `@container` para poder medir el titular contra ESTA columna. */}
        <div className="@container w-full max-w-[40rem]">
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
          {/* En celular va grande y se parte en dos líneas, que es como se
              quiere: ahí sobra alto y lo que hace falta es presencia.

              El escalado solo entra a partir de `lg`, que es cuando aparece el
              panel de la derecha y la columna se queda con media pantalla —
              ahí sí hay que encoger para no partir el titular. Los cortes se
              miden contra la columna (`@`) y no contra la ventana, porque una
              ventana ancha puede tener una columna estrecha.

              Cada umbral es el ancho que ese tamaño necesita, medido:
              36px→355, 48px→474, 60px→593. */}
          <h1 className="mt-3 text-6xl font-bold leading-[1.05] tracking-wide text-marca lg:text-4xl lg:@[490px]:text-5xl lg:@[600px]:text-6xl">
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

        {/* El bloque no va pegado al borde inferior: apoyado abajo del todo se
            lee como un pie de página. Levantado, queda a la altura de la
            mirada y se lee como el mensaje del panel. */}
        {/* El relleno lateral se queda en px-12 y no sube en `xl`: con px-16 la
            columna útil bajaba a 592px en una pantalla de 1440, justo por
            debajo de los 609 que necesita el titular, y se quedaba en el
            tamaño pequeño en una medida de pantalla muy común. */}
        <div className="@container relative max-w-3xl px-12 pb-32 xl:pb-40">
          {/* 44px es el tamaño pedido, y se usa en cuanto hay sitio: la
              primera frase necesita 609px de ancho para caber en una línea.
              Los escalones de reserva existen para que el titular siempre
              queden dos líneas — sin ellos se partía en cuatro. */}
          <p className="text-[28px] font-bold leading-[1.12] tracking-tight text-white @[450px]:text-[32px] @[610px]:text-[44px]">
            Menos tiempo administrando.
            <br />
            Más tiempo ejecutando.
          </p>
          <p className="mt-6 text-[18px] font-normal leading-[30px] text-white/80">
            Toda la información de campo, organizada de forma simple, segura y
            accesible.
          </p>
        </div>
      </div>
    </main>
  );
}
