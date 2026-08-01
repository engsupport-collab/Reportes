/**
 * Fechas y horas del sistema.
 *
 * Todo se muestra en la zona horaria de la empresa (GMT-5), nunca en UTC ni en
 * la zona del navegador. Un reporte tiene que decir la misma hora para todos:
 * si dependiera del equipo de cada quien, el admin en otra ciudad vería horas
 * distintas a las del empleado que lo escribió, y las dos serían "correctas".
 *
 * Se usa "America/Bogota" en vez de un desfase fijo de -5 porque el nombre de
 * zona es lo que entiende Intl. Colombia no aplica horario de verano, así que
 * es GMT-5 todo el año.
 */
export const ZONA_HORARIA = "America/Bogota";

/**
 * La fecha del trabajo se guarda al MEDIODÍA UTC, no a medianoche.
 *
 * Es una fecha de calendario, no un instante: no tiene hora. Guardada a
 * medianoche UTC y mostrada en GMT-5, se convertiría en las 7 de la tarde del
 * día anterior — un reporte del día 1 aparecería como del 31. Con el mediodía
 * como referencia, la fecha cae igual en cualquier zona entre UTC-11 y UTC+12,
 * así que se muestra correcta se mire desde donde se mire.
 */
const HORA_ANCLA = 12;

/** "2026-08-01" -> Date. Devuelve null si no es una fecha válida. */
export function parseFechaISO(valor: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!match) return null;

  const [, anio, mes, dia] = match;
  const fecha = new Date(
    Date.UTC(Number(anio), Number(mes) - 1, Number(dia), HORA_ANCLA),
  );

  // Rechaza fechas imposibles como 2026-02-31, que Date "corrige" en silencio.
  if (
    fecha.getUTCFullYear() !== Number(anio) ||
    fecha.getUTCMonth() !== Number(mes) - 1 ||
    fecha.getUTCDate() !== Number(dia)
  ) {
    return null;
  }

  return fecha;
}

/** Date -> "2026-08-01", para rellenar un <input type="date">. */
export function aValorInput(fecha: Date): string {
  // en-CA produce el formato ISO que espera el input.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/** Date -> "1 de agosto de 2026". */
export function formatFechaLarga(fecha: Date): string {
  return fecha.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONA_HORARIA,
  });
}

/** Date -> "01/08/2026", para listas. */
export function formatFechaCorta(fecha: Date): string {
  return fecha.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_HORARIA,
  });
}

/** Date -> "01/08/2026, 10:45 a. m." — creado, editado, firmado. */
export function formatInstante(fecha: Date): string {
  return fecha.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_HORARIA,
  });
}

/**
 * Hora del día en la zona de la empresa.
 *
 * `new Date().getHours()` devuelve la hora del servidor, que en Vercel es UTC:
 * el saludo diría "buenas noches" a las tres de la tarde en Colombia.
 */
export function horaLocal(fecha = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_HORARIA,
      hour: "numeric",
      hour12: false,
    }).format(fecha),
  );
}

/**
 * Desfase fijo de la zona horaria de la empresa.
 *
 * Se puede tratar como una constante porque Colombia no aplica horario de
 * verano: es GMT-5 los 365 días. Para mostrar fechas se sigue usando Intl con
 * el nombre de zona; esta constante solo sirve para calcular los límites de un
 * mes o una semana, donde hace falta aritmética y no formato.
 */
const OFFSET_HORAS = 5;

/**
 * Instante en que empezó el mes local, `mesesAtras` meses atrás.
 *
 * Restar el desfase antes de leer las partes de la fecha es lo que hace que el
 * mes se corte a la medianoche de Bogotá y no a la de Londres. Sin eso, los
 * reportes creados entre las 7 y las 12 de la noche del último día del mes
 * contarían en el mes siguiente.
 */
export function inicioDeMes(mesesAtras = 0): Date {
  const local = new Date(Date.now() - OFFSET_HORAS * 3_600_000);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth() - mesesAtras,
      1,
      OFFSET_HORAS,
    ),
  );
}

/** "agosto de 2026" — para nombrar el periodo de una comparación. */
export function nombreDeMes(fecha: Date): string {
  return fecha.toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: ZONA_HORARIA,
  });
}

/** "sábado, 1 de agosto de 2026" — encabezado de las vistas. */
export function formatFechaEncabezado(fecha = new Date()): string {
  return fecha.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONA_HORARIA,
  });
}
