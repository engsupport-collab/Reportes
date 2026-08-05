"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { crearCotizacionCampoAction } from "@/actions/quotes";
import type { OpcionCliente } from "@/lib/queries/clients";

export type OpcionCotizacionSelector = {
  id: string;
  label: string;
  clientName: string;
  purchaseOrderLabel: string;
  dueDateLabel: string;
};

const CAMPO =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

const NO_ENCUENTRO = "__no_encuentro__";

/**
 * Registro mínimo de una cotización desde campo, embebido dentro del selector.
 * Al crearla, `onCreada` la agrega a la lista y la deja elegida — no hace falta
 * salir del formulario de reporte para seguir.
 *
 * A propósito NO usa un `<form>`: este bloque vive dentro del formulario del
 * reporte, y anidar formularios es HTML inválido — el navegador descarta el
 * interior y React avisa de un error de hidratación. Los campos van sueltos y
 * el `FormData` se arma a mano al pulsar el botón, que por lo mismo es
 * `type="button"` y no envía nada por su cuenta.
 */
function CrearCotizacionCampo({
  companyId,
  clientesActivos,
  onCreada,
  onCancelar,
}: {
  companyId: string;
  /** El técnico solo elige de aquí — nunca escribe ni crea un cliente. */
  clientesActivos: OpcionCliente[];
  onCreada: (opcion: OpcionCotizacionSelector) => void;
  onCancelar: () => void;
}) {
  const t = useTranslations("cotizacionCampoForm");
  const tSelector = useTranslations("quoteSelector");
  const [error, setError] = useState<string | undefined>();
  const [pendiente, startTransition] = useTransition();
  const proyectoRef = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState("");

  function crear() {
    const projectName = proyectoRef.current?.value.trim() ?? "";

    const formData = new FormData();
    formData.set("companyId", companyId);
    formData.set("projectName", projectName);
    formData.set("clientId", clientId);

    startTransition(async () => {
      const resultado = await crearCotizacionCampoAction({}, formData);
      setError(resultado.error);

      if (resultado.creada) {
        onCreada({
          id: resultado.creada.id,
          label: `${resultado.creada.projectName} — ${resultado.creada.clientName}`,
          clientName: resultado.creada.clientName,
          purchaseOrderLabel: tSelector("sinAsignar"),
          dueDateLabel: tSelector("sinFecha"),
        });
      }
    });
  }

  // Sin clientes activos, el técnico no tiene nada que elegir: no puede
  // crear ni un cliente ni una cotización, así que se le avisa en vez de
  // mostrarle un selector vacío o un formulario que va a fallar al guardar.
  if (clientesActivos.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm font-medium text-text">{t("titulo")}</p>
        <p className="text-sm text-muted">{t("sinClientesActivos")}</p>
        <button
          type="button"
          onClick={onCancelar}
          className="text-sm font-medium text-muted transition hover:text-text"
        >
          {t("cancelar")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
      <div>
        <p className="text-sm font-medium text-text">{t("titulo")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("ayuda")}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="quote-campo-proyecto" className="block text-sm font-medium text-text">
          {t("projectName")}
        </label>
        <input
          ref={proyectoRef}
          id="quote-campo-proyecto"
          maxLength={200}
          disabled={pendiente}
          className={CAMPO}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="quote-campo-cliente" className="block text-sm font-medium text-text">
          {t("clientName")}
        </label>
        <select
          id="quote-campo-cliente"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={pendiente}
          className={CAMPO}
        >
          <option value="" disabled>
            {t("eligeCliente")}
          </option>
          {clientesActivos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={crear}
          disabled={pendiente}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendiente ? t("creando") : t("crear")}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:text-text"
        >
          {t("cancelar")}
        </button>
      </div>
    </div>
  );
}

/**
 * Selector de cotización para el formulario de reporte.
 *
 * El técnico ya no escribe proyecto ni cliente: los elige de aquí, y el
 * servidor los copia al reporte. La opción "No encuentro la cotización" va al
 * final de la lista a propósito — obliga a mirar lo que ya existe antes de
 * crear algo nuevo, que es lo que evita los duplicados.
 */
export function QuoteSelector({
  companyId,
  opcionesIniciales,
  valorInicial,
  clientesActivos,
}: {
  /** Empresa activa en el momento — la del empleado, o la que el admin eligió arriba. */
  companyId: string;
  opcionesIniciales: OpcionCotizacionSelector[];
  valorInicial?: string;
  /** Para la creación mínima desde campo: el técnico solo elige, nunca escribe. */
  clientesActivos: OpcionCliente[];
}) {
  const t = useTranslations("quoteSelector");
  const [opciones, setOpciones] = useState(opcionesIniciales);
  const [seleccion, setSeleccion] = useState(valorInicial ?? "");
  const [creando, setCreando] = useState(false);

  const elegida = opciones.find((o) => o.id === seleccion);

  function alCambiar(id: string) {
    if (id === NO_ENCUENTRO) {
      setCreando(true);
      setSeleccion("");
      return;
    }
    setSeleccion(id);
  }

  return (
    <fieldset className="space-y-2 sm:col-span-2">
      <legend className="mb-2 block text-sm font-medium text-text">
        {t("label")}
      </legend>

      {opciones.length > 0 && !creando ? (
        <select
          value={seleccion}
          onChange={(e) => alCambiar(e.target.value)}
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-brand focus:outline-none"
        >
          <option value="" disabled>
            {t("elige")}
          </option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          <option value={NO_ENCUENTRO}>{t("noEncuentro")}</option>
        </select>
      ) : null}

      {opciones.length === 0 && !creando ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-muted">
          {t("sinActivas")}
        </p>
      ) : null}

      {elegida ? (
        <input type="hidden" name="quoteId" value={elegida.id} readOnly />
      ) : null}

      {elegida ? (
        <dl className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">
              {t("cliente")}
            </dt>
            <dd className="mt-0.5 truncate text-text">{elegida.clientName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">
              {t("ordenCompra")}
            </dt>
            <dd className="mt-0.5 truncate text-text">
              {elegida.purchaseOrderLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">
              {t("fechaComprometida")}
            </dt>
            <dd className="mt-0.5 truncate text-text">{elegida.dueDateLabel}</dd>
          </div>
        </dl>
      ) : null}

      {creando || opciones.length === 0 ? (
        <CrearCotizacionCampo
          companyId={companyId}
          clientesActivos={clientesActivos}
          onCreada={(opcion) => {
            setOpciones((prev) => [...prev, opcion]);
            setSeleccion(opcion.id);
            setCreando(false);
          }}
          onCancelar={() => setCreando(false)}
        />
      ) : null}
    </fieldset>
  );
}
