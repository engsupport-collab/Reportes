"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { AdjuntoState } from "@/actions/attachments";
import {
  ACEPTAR_EN_SELECTOR,
  MAX_BYTES,
  formatearTamano,
  pareceFoto,
  validarArchivo,
} from "@/lib/archivos";
import { FotoNoProcesable, prepararArchivo } from "@/lib/imagen-cliente";

/**
 * Un archivo elegido que todavía no está guardado: o va en camino, o falló.
 * Los que ya subieron salen de aquí — aparecen en la lista del reporte.
 */
type Pendiente = {
  id: number;
  original: File;
  estado: "espera" | "preparando" | "subiendo" | "error";
  error?: string;
};

/**
 * Selector y subida de archivos.
 *
 * Se pueden elegir todos los que haga falta de una vez. Por dentro viajan de
 * uno en uno, cada cual en su propia petición, por dos motivos:
 *
 * - Vercel no recibe una petición de más de 4,5 MB. Varias fotos juntas lo
 *   pasaban, y lo que se veía era una pantalla de error genérica del navegador.
 * - En campo la señal se corta. Si falla una, las anteriores ya quedaron
 *   guardadas y solo se reintenta esa, en vez de perderlas todas.
 *
 * Antes de enviar, las fotos se reducen en el navegador. Por eso el tamaño se
 * les mide después de reducirlas y nunca antes: la foto original de un
 * teléfono actual casi siempre pasa del límite, y reducida pesa una fracción.
 */
export function AttachmentUploader({
  action,
}: {
  action: (estado: AdjuntoState, formData: FormData) => Promise<AdjuntoState>;
}) {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [subidos, setSubidos] = useState(0);
  const [tanda, setTanda] = useState({ hechos: 0, total: 0 });
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const siguienteId = useRef(1);
  const t = useTranslations("adjuntos");

  function marcar(id: number, cambios: Partial<Pendiente>) {
    setPendientes((lista) => lista.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  /** Prepara y sube un archivo. Devuelve el motivo si no se pudo, o null. */
  async function subirUno(pendiente: Pendiente): Promise<string | null> {
    const { original } = pendiente;

    // Un documento se sube tal cual, así que se valida tal cual. Una foto no:
    // su tamaño y su formato de ahora no son los que van a viajar.
    if (!pareceFoto(original)) {
      const v = validarArchivo(original);
      if (!v.ok) return v.error;
    }

    marcar(pendiente.id, { estado: "preparando", error: undefined });

    let preparado;
    try {
      preparado = await prepararArchivo(original);
    } catch (error) {
      return error instanceof FotoNoProcesable && error.motivo === "tamano"
        ? t("errorTamano", { tamano: formatearTamano(MAX_BYTES) })
        : t("errorFormato");
    }

    const formData = new FormData();
    formData.append("archivos", preparado.archivo);
    formData.append("miniaturas", preparado.miniatura ?? new Blob([]));

    marcar(pendiente.id, { estado: "subiendo" });

    // Una petición que no llega —sin señal, o cortada a medias— no devuelve un
    // error: lanza. Sin este `catch`, eso tumbaba la página entera.
    try {
      const resultado = await action({}, formData);
      return resultado.error ?? null;
    } catch {
      return t("errorConexion");
    }
  }

  async function procesar(cola: Pendiente[]) {
    setOcupado(true);
    setSubidos(0);
    setTanda({ hechos: 0, total: cola.length });

    try {
      for (const [i, pendiente] of cola.entries()) {
        const error = await subirUno(pendiente);
        if (error) {
          marcar(pendiente.id, { estado: "error", error });
        } else {
          setPendientes((lista) => lista.filter((p) => p.id !== pendiente.id));
          setSubidos((n) => n + 1);
        }
        setTanda({ hechos: i + 1, total: cola.length });
      }
    } finally {
      setOcupado(false);
    }
  }

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (elegidos.length === 0) return;

    const nuevos = elegidos.map(
      (original): Pendiente => ({
        id: siguienteId.current++,
        original,
        estado: "espera",
      }),
    );
    // Los que fallaron antes se quedan a la vista, con su botón de reintentar.
    setPendientes((lista) => [...lista.filter((p) => p.estado === "error"), ...nuevos]);
    void procesar(nuevos);
  }

  function reintentar(pendiente: Pendiente) {
    const deNuevo: Pendiente = { ...pendiente, estado: "espera", error: undefined };
    marcar(pendiente.id, deNuevo);
    void procesar([deNuevo]);
  }

  const fallidos = pendientes.filter((p) => p.estado === "error");

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACEPTAR_EN_SELECTOR}
        onChange={alElegir}
        disabled={ocupado}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        className="w-full rounded-xl border border-dashed border-border px-4 py-6 text-center transition hover:border-brand hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="block text-sm font-medium text-text">
          {ocupado
            ? t("progreso", {
                actual: Math.min(tanda.hechos + 1, tanda.total),
                total: tanda.total,
              })
            : t("elegirArchivos")}
        </span>
        <span className="mt-1 block text-xs text-muted">
          {t("ayudaArchivos", { tamano: formatearTamano(MAX_BYTES) })}
        </span>
      </button>

      {pendientes.length > 0 ? (
        <ul className="space-y-2">
          {pendientes.map((p) => (
            <li
              key={p.id}
              className={`rounded-lg border px-3 py-2.5 text-sm ${
                p.estado === "error"
                  ? "border-danger/30 bg-danger/10"
                  : "border-border bg-surface-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-text">
                  {p.original.name}
                </span>
                {p.estado === "error" ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => reintentar(p)}
                      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:border-brand disabled:opacity-50"
                    >
                      {t("reintentar")}
                    </button>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() =>
                        setPendientes((lista) => lista.filter((x) => x.id !== p.id))
                      }
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition hover:text-text disabled:opacity-50"
                    >
                      {t("quitar")}
                    </button>
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted">
                    {p.estado === "preparando"
                      ? t("preparando")
                      : p.estado === "subiendo"
                        ? t("subiendo")
                        : t("enEspera")}
                  </span>
                )}
              </div>
              {p.error ? (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {p.error}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!ocupado && fallidos.length > 0 ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {t("fallidos", { count: fallidos.length })}
        </p>
      ) : null}

      {!ocupado && subidos > 0 ? (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
          {t("subidos", { count: subidos })}
        </p>
      ) : null}
    </div>
  );
}
