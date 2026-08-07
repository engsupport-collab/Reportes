"use client";

import { useEffect, useRef } from "react";

/**
 * Modal genérico sobre `<dialog>` nativo: foco atrapado, capa de fondo y
 * cierre con Escape los da el navegador solo, así que el JS propio se reduce
 * a abrir/cerrar el elemento y sincronizar el estado de React con él.
 *
 * `children` solo se monta mientras `abierto` es true — no se oculta con
 * CSS — para que un formulario adentro (con su propio `useActionState`)
 * arranque limpio cada vez que se abre, sin arrastrar el envío anterior.
 */
export function Modal({
  abierto,
  onCerrar,
  titulo,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (abierto && !dialog.open) dialog.showModal();
    if (!abierto && dialog.open) dialog.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => {
        // Un clic en el propio <dialog> (fuera de su contenido, es decir en
        // la zona del backdrop) también cae aquí: el navegador no distingue
        // los dos con un evento aparte.
        if (e.target === e.currentTarget) onCerrar();
      }}
      // El centrado nativo de <dialog> depende de `margin: auto` en el
      // navegador — el preflight de Tailwind lo resetea a `margin: 0` en
      // todos los elementos, este incluido, así que sin centrarlo a mano
      // quedaba pegado a la esquina superior izquierda. `fixed` + `inset-0`
      // + `m-auto` sobre un tamaño explícito es lo que lo vuelve a centrar,
      // sin depender de ese reset.
      className="fixed inset-0 m-auto h-fit w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      {abierto ? (
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text">{titulo}</h3>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="text-lg leading-none text-muted transition hover:text-text"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
