"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { FirmaState } from "@/actions/signature";
import {
  ESTILOS_FIRMA,
  generarFirmaEscrita,
  type EstiloFirma,
} from "@/lib/firma-escrita";

type Modo = "escribir" | "dibujar";

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
  const t = useTranslations("firma");

  /**
   * "Escribir" es lo primero que se ofrece a propósito: dibujar con el dedo no
   * funciona en algunos celulares (ver PLAN.md), y escribir el nombre sí
   * funciona en todos. Quien prefiera dibujar tiene la pestaña al lado.
   */
  const [modo, setModo] = useState<Modo>("escribir");
  const [nombre, setNombre] = useState(nombrePorDefecto);
  const [estilo, setEstilo] = useState<EstiloFirma>(ESTILOS_FIRMA[0]!);
  const vistaPreviaRef = useRef<HTMLDivElement>(null);


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
    // `modo` entra aquí porque el canvas solo existe en la pestaña de dibujo:
    // al volver a ella se monta uno nuevo y hay que engancharle los listeners.
  }, [preparar, modo]);

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hayTrazo.current = false;
    setTieneTrazo(false);
    setEstado({});
  }

  /** Los dos modos mandan el PNG con el mismo nombre: al servidor le da igual
   *  si se dibujó o se escribió. */
  function archivoFirma(blob: Blob): File {
    return new File([blob], "firma.png", { type: "image/png" });
  }

  function guardar(formData: FormData) {
    if (modo === "escribir") {
      // La fuente se lee de la vista previa en lugar de nombrarla aquí: es la
      // misma que el usuario está viendo, así que lo que se guarda no puede
      // salir distinto de lo que aprobó en pantalla.
      const pila = vistaPreviaRef.current
        ? getComputedStyle(vistaPreviaRef.current).fontFamily
        : "cursive";

      startTransition(async () => {
        const blob = await generarFirmaEscrita(nombre, pila);
        if (!blob) {
          setEstado({ error: t("errorGenerarFirma") });
          return;
        }
        formData.set("firma", archivoFirma(blob));
        setEstado(await action({}, formData));
      });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !hayTrazo.current) {
      setEstado({ error: t("errorDibujaFirma") });
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setEstado({ error: t("errorGenerarFirma") });
        return;
      }
      formData.set("firma", archivoFirma(blob));
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
          {t("nombreQuienFirma")}
        </label>
        <input
          id="signatureName"
          name="signatureName"
          required
          maxLength={120}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          placeholder={t("placeholderNombre")}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="signatureEmail"
          className="block text-sm font-medium text-text"
        >
          {t("correoQuienFirma")}
        </label>
        <input
          id="signatureEmail"
          name="signatureEmail"
          type="email"
          required
          maxLength={200}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          placeholder={t("placeholderCorreo")}
        />
        <p className="text-xs text-muted">{t("ayudaCorreo")}</p>
      </div>

      {/* Dos formas de firmar. Escribir va primero porque funciona en
          cualquier dispositivo; dibujar con el dedo falla en algunos
          celulares (ver PLAN.md). */}
      <div
        role="tablist"
        aria-label={t("formaDeFirmar")}
        className="inline-flex rounded-lg border border-border p-0.5"
      >
        {(
          [
            ["escribir", t("escribir")],
            ["dibujar", t("dibujar")],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={modo === id}
            onClick={() => {
              setModo(id);
              setEstado({});
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              modo === id
                ? "bg-brand-soft text-brand"
                : "text-muted hover:text-text"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {modo === "escribir" ? (
        <div>
          <p className="mb-1.5 text-sm font-medium text-text">
            {t("asiSeVeraFirma")}
          </p>
          <div
            ref={vistaPreviaRef}
            style={{ fontFamily: `var(${estilo.variable})` }}
            className="flex h-44 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-white px-6 text-center text-5xl leading-tight text-[#111827]"
          >
            {/* Lo que se ve aquí es exactamente lo que se guarda: la imagen se
                genera con la fuente que esté aplicada a este recuadro. */}
            {nombre.trim() || (
              <span className="font-sans text-base text-neutral-400">
                {t("escribeNombreArriba")}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">{t("estilo")}</span>
            {ESTILOS_FIRMA.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEstilo(e)}
                style={{ fontFamily: `var(${e.variable})` }}
                className={`rounded-lg border px-3 py-1 text-xl transition ${
                  estilo.id === e.id
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                {e.nombre}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-1.5 text-sm font-medium text-text">{t("firmaLabel")}</p>
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
              {t("firmaConMouseODedo")}
            </p>
            <button
              type="button"
              onClick={limpiar}
              className="text-xs font-medium text-muted transition hover:text-text"
            >
              {t("borrarYEmpezar")}
            </button>
          </div>

          {/**
           * PENDIENTE: firmar con el dedo no funciona en algunos celulares. En
           * PC con mouse sí. Ya se descartaron cuatro causas (borrado del canvas
           * por el evento resize, cancelación del gesto por scroll, listeners
           * pasivos de React, y el pointerleave que disparaba la captura del
           * puntero). Queda documentado en PLAN.md.
           *
           * Desde que existe la pestaña "Escribir" esto dejó de bloquear a
           * nadie: quien no pueda dibujar, teclea su nombre y firma igual.
           */}
        </div>
      )}

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
        // Cada modo tiene su propia condición para estar listo: un trazo en el
        // canvas, o un nombre escrito.
        disabled={
          pendiente ||
          (modo === "dibujar" ? !tieneTrazo : nombre.trim().length === 0)
        }
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendiente ? t("guardando") : t("guardarFirma")}
      </button>
    </form>
  );
}
