"use client";

import { IDIOMAS_DOCUMENTO, type IdiomaDocumento } from "@/lib/idioma-documento";
import { NOMBRES_IDIOMA } from "@/lib/idiomas";

/**
 * Elegir en qué idioma sale un documento: español o inglés.
 *
 * Se usa en dos sitios con el mismo aspecto: en el catálogo de clientes (el
 * idioma en que un cliente recibe sus reportes) y junto al correo de quien
 * firma (el idioma en que sale ese reporte). El rótulo y la ayuda los pone
 * quien lo usa.
 *
 * Dos formas de usarlo:
 *  - dentro de un formulario, con `porDefecto`: viaja como `documentLanguage`
 *    al enviar;
 *  - con `valor` y `onCambiar`: avisa en cuanto se elige, para guardar al
 *    momento sin un botón aparte.
 *
 * Cada idioma va nombrado en sí mismo, igual que en el selector de idioma de
 * la interfaz.
 */
export function SelectorIdiomaDocumento({
  titulo,
  ayuda,
  disabled = false,
  ...modo
}: {
  titulo: string;
  ayuda?: string;
  disabled?: boolean;
} & (
  | { porDefecto: IdiomaDocumento }
  | { valor: IdiomaDocumento; onCambiar: (idioma: IdiomaDocumento) => void }
)) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-text">{titulo}</legend>
      <div className="flex gap-2">
        {IDIOMAS_DOCUMENTO.map((idioma) => (
          <label
            key={idioma}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand has-disabled:cursor-not-allowed has-disabled:opacity-60"
          >
            <input
              type="radio"
              name="documentLanguage"
              value={idioma}
              disabled={disabled}
              className="accent-brand"
              {...("valor" in modo
                ? {
                    checked: modo.valor === idioma,
                    onChange: () => modo.onCambiar(idioma),
                  }
                : { defaultChecked: modo.porDefecto === idioma })}
            />
            {NOMBRES_IDIOMA[idioma]}
          </label>
        ))}
      </div>
      {ayuda ? <p className="text-xs text-muted">{ayuda}</p> : null}
    </fieldset>
  );
}
