"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { FirmaState } from "@/actions/signature";

/**
 * Pad de firma con mouse o dedo.
 *
 * Los listeners van enganchados al canvas con addEventListener y
 * `{ passive: false }`, en vez de usar los props onPointerDown de React.
 *
 * El motivo es concreto: React registra sus listeners en la raíz del documento,
 * no en el elemento. Cuando el evento llega hasta ahí burbujeando, un navegador
 * móvil ya pudo haber decidido que el gesto era un desplazamiento de página, y
 * entonces `preventDefault()` llega tarde. Enganchados al propio canvas y de
 * forma no pasiva, el navegador sabe desde el primer contacto que ese gesto es
 * para dibujar.
 */
export function SignaturePad({
  action,
  nombrePorDefecto,
}: {
  action: (estado: FirmaState, formData: FormData) => Promise<FirmaState>;
  nombrePorDefecto: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hayTrazo = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);
  const [estado, setEstado] = useState<FirmaState>({});
  const [pendiente, startTransition] = useTransition();


  /**
   * Ajusta el tamaño interno del canvas a los píxeles reales del dispositivo.
   *
   * Asignar `canvas.width` BORRA el contenido, así que solo se toca si el
   * tamaño cambió de verdad. En un móvil, el evento `resize` de la ventana se
   * dispara cada vez que la barra de direcciones se oculta o aparece —o sea, en
   * cuanto tocas la pantalla— y sin esta comprobación la firma se borraba
   * apenas empezabas a dibujarla. Por eso también se observa el canvas con
   * ResizeObserver en lugar de escuchar la ventana.
   */
  const preparar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const ratio = window.devicePixelRatio || 1;
    const ancho = Math.round(rect.width * ratio);
    const alto = Math.round(rect.height * ratio);

    if (canvas.width === ancho && canvas.height === alto) return;

    const anterior = hayTrazo.current ? canvas.toDataURL() : null;

    canvas.width = ancho;
    canvas.height = alto;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";

    if (anterior) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = anterior;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    preparar();

    const observer = new ResizeObserver(preparar);
    observer.observe(canvas);

    let dibujando = false;

    function contexto() {
      return canvas!.getContext("2d");
    }

    function posicion(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function empezar(clientX: number, clientY: number) {
      const ctx = contexto();
      if (!ctx) return;

      dibujando = true;
      const { x, y } = posicion(clientX, clientY);

      ctx.beginPath();
      ctx.moveTo(x, y);
      // Un punto en el sitio del toque: si alguien firma con un golpe seco sin
      // llegar a arrastrar, sin esto no se dibujaría nada en absoluto.
      ctx.lineTo(x + 0.01, y);
      ctx.stroke();

      hayTrazo.current = true;
      setTieneTrazo(true);
    }

    function mover(clientX: number, clientY: number) {
      if (!dibujando) return;
      const ctx = contexto();
      if (!ctx) return;

      const { x, y } = posicion(clientX, clientY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    function terminar() {
      dibujando = false;
    }

    // --- Punteros (mouse, dedo y lápiz en un solo modelo) -------------------
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Sin captura el trazo funciona igual mientras el dedo no salga.
      }
      empezar(e.clientX, e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dibujando) return;
      e.preventDefault();
      mover(e.clientX, e.clientY);
    };

    /**
     * NO se escucha `pointerleave`, y esa ausencia es deliberada.
     *
     * Aquí estaba el fallo que hacía imposible firmar con el dedo. Al capturar
     * el puntero en `pointerdown`, el navegador considera que el puntero
     * "abandona" el elemento sobre el que estaba y dispara `pointerleave`
     * inmediatamente después. Con un mouse eso no ocurre porque el cursor sigue
     * físicamente encima; con un dedo, sí. El resultado era que el trazo se
     * daba por terminado en el mismo instante en que empezaba, y todos los
     * `pointermove` siguientes se descartaban: en el celular no se dibujaba
     * absolutamente nada, mientras que en el PC todo parecía correcto.
     *
     * `pointerleave` tampoco hace falta: al tener el puntero capturado, el
     * `pointerup` llega al canvas aunque el dedo se levante fuera del recuadro.
     * Por si la captura no estuviera disponible, se escucha además en window.
     */

    // --- Táctil, para navegadores sin soporte de punteros ------------------
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      empezar(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !dibujando) return;
      e.preventDefault();
      mover(t.clientX, t.clientY);
    };

    const onMouseDown = (e: MouseEvent) => empezar(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => mover(e.clientX, e.clientY);

    const usaPunteros = typeof window !== "undefined" && "PointerEvent" in window;

    if (usaPunteros) {
      canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
      canvas.addEventListener("pointermove", onPointerMove, { passive: false });
      canvas.addEventListener("pointerup", terminar);
      canvas.addEventListener("pointercancel", terminar);
      // Red de seguridad por si la captura del puntero no estuviera disponible:
      // sin esto, soltar fuera del recuadro dejaría el trazo activo y el
      // siguiente toque continuaría la línea desde donde se quedó.
      window.addEventListener("pointerup", terminar);
      window.addEventListener("pointercancel", terminar);
    } else {
      canvas.addEventListener("touchstart", onTouchStart, { passive: false });
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
      canvas.addEventListener("touchend", terminar);
      canvas.addEventListener("touchcancel", terminar);
      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", terminar);
    }

    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", terminar);
      canvas.removeEventListener("pointercancel", terminar);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", terminar);
      canvas.removeEventListener("touchcancel", terminar);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("pointerup", terminar);
      window.removeEventListener("pointercancel", terminar);
      window.removeEventListener("mouseup", terminar);
    };
  }, [preparar]);

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hayTrazo.current = false;
    setTieneTrazo(false);
    setEstado({});
  }

  function guardar(formData: FormData) {
    const canvas = canvasRef.current;
    if (!canvas || !hayTrazo.current) {
      setEstado({ error: "Dibuja la firma antes de guardar." });
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setEstado({ error: "No se pudo generar la firma. Intenta de nuevo." });
        return;
      }

      formData.set("firma", new File([blob], "firma.png", { type: "image/png" }));
      startTransition(async () => {
        setEstado(await action({}, formData));
      });
    }, "image/png");
  }

  return (
    <form action={guardar} className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="signatureName"
          className="block text-sm font-medium text-text"
        >
          Nombre de quien firma
        </label>
        <input
          id="signatureName"
          name="signatureName"
          required
          maxLength={120}
          defaultValue={nombrePorDefecto}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          placeholder="Nombre y apellido"
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-text">Firma</p>
        <canvas
          ref={canvasRef}
          // touchAction en línea además de la clase: es la propiedad que impide
          // que el navegador convierta el trazo en un desplazamiento de página,
          // y no debe depender de que una hoja de estilos haya cargado.
          style={{ touchAction: "none", WebkitUserSelect: "none" }}
          className="h-44 w-full touch-none select-none rounded-xl border border-dashed border-border bg-white"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Firma con el mouse o con el dedo dentro del recuadro.
          </p>
          <button
            type="button"
            onClick={limpiar}
            className="text-xs font-medium text-muted transition hover:text-text"
          >
            Borrar y volver a empezar
          </button>
        </div>

        {/**
         * PENDIENTE: firmar con el dedo no funciona en celular. En PC con mouse
         * sí. Ya se descartaron cuatro causas (borrado del canvas por el evento
         * resize, cancelación del gesto por scroll, listeners pasivos de React,
         * y el pointerleave que disparaba la captura del puntero). Queda
         * documentado en PLAN.md. Mientras tanto el flujo alternativo funciona:
         * firmar en papel y subir el documento como adjunto.
         *
         * El contador de diagnóstico se retiró de la interfaz para no mostrarlo
         * a los usuarios; el estado `diag` sigue disponible para reactivarlo.
         */}
      </div>

      {estado.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {estado.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendiente || !tieneTrazo}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Guardar firma"}
      </button>
    </form>
  );
}
