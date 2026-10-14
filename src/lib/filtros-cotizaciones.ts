import { esEstadoCotizacion, type EstadoCotizacion } from "@/lib/cotizaciones";
import { inicioDeFechaISO, inicioDelDia, sumarDias } from "@/lib/fechas";

/**
 * Los filtros y el orden de la lista de cotizaciones, leídos de la dirección.
 *
 * Los leen dos sitios —la pantalla y la exportación— y tienen que entenderlos
 * igual: un archivo exportado que traiga otras filas que las que se ven en la
 * pantalla desde la que se pidió es peor que no tener exportación. Por eso los
 * dos pasan por `leerFiltrosCotizaciones` y ninguno lee la dirección por su
 * cuenta.
 *
 * Sin dependencias de servidor: el selector de orden del teléfono también usa
 * estas definiciones.
 *
 * **Fechas.** Todo en hora de Colombia (GMT-5, sin horario de verano), igual
 * que el resto del sistema:
 *  - "Últimos 15 días" es hoy y los 14 días anteriores, completos: desde la
 *    medianoche de Bogotá de hace 14 días hasta el final de hoy. "Últimos 30",
 *    lo mismo con 29. Son días de calendario, no 360 horas hacia atrás: así la
 *    lista no cambia a lo largo del día según la hora a la que se mire.
 *  - Un rango personalizado incluye sus dos días completos: del 1 al 15 es
 *    desde la medianoche del 1 hasta el final del 15.
 * Los tres miran la fecha de finalización, y dejan fuera las cotizaciones que
 * no están finalizadas y las finalizadas sin fecha registrada.
 */

export const CAMPOS_ORDEN = [
  "numero",
  "proyecto",
  "cliente",
  "empresa",
  "estado",
  "oc",
  "entrega",
  "valor",
  "creada",
  "finalizada",
] as const;
export type CampoOrden = (typeof CAMPOS_ORDEN)[number];
export type Direccion = "asc" | "desc";
export type Orden = { campo: CampoOrden; dir: Direccion };

/** Sin orden pedido: las más recientes primero, como hasta ahora. */
export const ORDEN_POR_DEFECTO: Orden = { campo: "creada", dir: "desc" };

export function esCampoOrden(valor: string): valor is CampoOrden {
  return (CAMPOS_ORDEN as readonly string[]).includes(valor);
}

/** Con qué dirección empieza cada columna al tocarla: lo que se suele buscar primero. */
export function direccionInicial(campo: CampoOrden): Direccion {
  return campo === "creada" || campo === "finalizada" || campo === "valor" || campo === "entrega"
    ? "desc"
    : "asc";
}

export const PERIODOS_RAPIDOS = [15, 30] as const;

/** Por cuál fecha de finalización se filtra, ya convertida a instantes. */
export type PeriodoFinalizacion = {
  tipo: "15" | "30" | "rango";
  /** Incluido. */
  desde: Date;
  /** Excluido: el primer instante que ya no entra. */
  hasta: Date;
};

/** Lo que llega en la dirección, tal cual. */
export type ParametrosCotizaciones = {
  q?: string;
  pagina?: string;
  empresa?: string;
  estado?: string;
  sinrevisar?: string;
  finalizadas?: string;
  desde?: string;
  hasta?: string;
  orden?: string;
  dir?: string;
};

export type FiltrosLeidos = {
  q?: string;
  empresa?: string;
  estado?: EstadoCotizacion;
  soloSinRevisar: boolean;
  /** Qué filtro de finalización se pidió, se haya podido aplicar o no. */
  finalizadas?: "15" | "30" | "rango";
  /** El periodo que de verdad se aplica; falta si el pedido no se pudo aplicar. */
  periodo?: PeriodoFinalizacion;
  /** Las fechas del rango, tal como las escribió quien filtró ("2026-10-01"). */
  rango: { desde: string; hasta: string };
  /** Se pidió un rango con la fecha inicial después de la final: no se aplica. */
  rangoInvalido: boolean;
  orden: Orden;
  pagina: number;
};

/** Hasta dónde se acepta un número de página: muy por encima de cualquier lista real. */
export const PAGINA_MAXIMA = 100_000;

/**
 * El número de página, si es un entero entre 1 y `PAGINA_MAXIMA`; si no, la
 * primera. La página se convierte en un desplazamiento de la consulta, y la
 * base solo acepta enteros: "?pagina=1.33" escrito a mano terminaba en un
 * error de la base en vez de en la lista (medido). Lo usan la lectura de la
 * dirección y la consulta misma, para que ningún otro camino lo salte.
 */
export function leerPagina(valor: string | number | undefined): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= PAGINA_MAXIMA ? n : 1;
}

/** Una fecha "AAAA-MM-DD" válida, o cadena vacía. */
function fechaOVacio(valor: string | undefined): string {
  return valor && inicioDeFechaISO(valor) ? valor : "";
}

/**
 * Convierte la dirección en filtros. `empresasPermitidas` son las del usuario:
 * una empresa que no esté ahí se ignora, no se consulta. `ahora` se recibe
 * para que "los últimos 15 días" se pueda probar en cualquier fecha.
 */
export function leerFiltrosCotizaciones(
  p: ParametrosCotizaciones,
  opciones: { empresasPermitidas: string[]; ahora: Date },
): FiltrosLeidos {
  const empresa = opciones.empresasPermitidas.find((id) => id === p.empresa);
  const estado = p.estado && esEstadoCotizacion(p.estado) ? p.estado : undefined;

  const hoy = inicioDelDia(opciones.ahora);
  const manana = sumarDias(hoy, 1);
  const rango = { desde: fechaOVacio(p.desde), hasta: fechaOVacio(p.hasta) };

  let periodo: PeriodoFinalizacion | undefined;
  let rangoInvalido = false;

  if (p.finalizadas === "15" || p.finalizadas === "30") {
    const dias = Number(p.finalizadas);
    periodo = { tipo: p.finalizadas, desde: sumarDias(hoy, -(dias - 1)), hasta: manana };
  } else if (p.finalizadas === "rango") {
    const desde = rango.desde ? inicioDeFechaISO(rango.desde) : null;
    const finDelHasta = rango.hasta ? sumarDias(inicioDeFechaISO(rango.hasta)!, 1) : null;
    // Sin ninguna fecha todavía no hay nada que aplicar: es el rango recién
    // abierto, esperando que se escriban. Con la inicial después de la final
    // no se aplica a medias: se dice, y la lista queda sin ese filtro.
    if (desde && finDelHasta && desde >= finDelHasta) {
      rangoInvalido = true;
    } else if (desde || finDelHasta) {
      periodo = {
        tipo: "rango",
        desde: desde ?? new Date(0),
        hasta: finDelHasta ?? manana,
      };
    }
  }

  const campo = p.orden && esCampoOrden(p.orden) ? p.orden : ORDEN_POR_DEFECTO.campo;
  const dir: Direccion =
    p.dir === "asc" || p.dir === "desc"
      ? p.dir
      : campo === ORDEN_POR_DEFECTO.campo
        ? ORDEN_POR_DEFECTO.dir
        : direccionInicial(campo);

  return {
    q: p.q?.trim() || undefined,
    empresa,
    estado,
    soloSinRevisar: p.sinrevisar === "1",
    finalizadas:
      p.finalizadas === "15" || p.finalizadas === "30" || p.finalizadas === "rango"
        ? p.finalizadas
        : undefined,
    periodo,
    rango,
    rangoInvalido,
    orden: { campo, dir },
    pagina: leerPagina(p.pagina),
  };
}

/**
 * Los filtros leídos, en la forma que pide la consulta
 * (`FiltrosCotizaciones` en `queries/quotes.ts`). Uno solo para la pantalla y
 * para la exportación.
 */
export function aFiltrosDeConsulta(f: FiltrosLeidos) {
  return {
    companyId: f.empresa,
    status: f.estado,
    soloSinRevisar: f.soloSinRevisar,
    buscar: f.q,
    finalizadas: f.periodo ? { desde: f.periodo.desde, hasta: f.periodo.hasta } : undefined,
    orden: f.orden,
    pagina: f.pagina,
  };
}

/**
 * La dirección que corresponde a unos filtros: lo inverso de
 * `leerFiltrosCotizaciones`. La usan los enlaces de la pantalla (páginas,
 * columnas, filtros rápidos) y el de exportar, para que el archivo salga con
 * exactamente lo que se está viendo.
 */
export function parametrosDe(
  f: Pick<
    FiltrosLeidos,
    "q" | "empresa" | "estado" | "soloSinRevisar" | "finalizadas" | "rango" | "orden" | "pagina"
  >,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.empresa) sp.set("empresa", f.empresa);
  if (f.estado) sp.set("estado", f.estado);
  if (f.soloSinRevisar) sp.set("sinrevisar", "1");
  if (f.finalizadas) sp.set("finalizadas", f.finalizadas);
  if (f.finalizadas === "rango") {
    if (f.rango.desde) sp.set("desde", f.rango.desde);
    if (f.rango.hasta) sp.set("hasta", f.rango.hasta);
  }
  if (f.orden.campo !== ORDEN_POR_DEFECTO.campo || f.orden.dir !== ORDEN_POR_DEFECTO.dir) {
    sp.set("orden", f.orden.campo);
    sp.set("dir", f.orden.dir);
  }
  if (f.pagina > 1) sp.set("pagina", String(f.pagina));
  return sp;
}
