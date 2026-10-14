/**
 * Prueba de las cotizaciones: su fecha de finalización, los filtros por esa
 * fecha, la exportación, la gráfica mensual de finalizadas y a qué cotización
 * se le puede colgar un reporte.
 *
 *   npm run test:cotizaciones
 *
 * Va contra la base de desarrollo (o la efímera de CI), con las mismas
 * funciones que usa la aplicación. Crea sus propios clientes y cotizaciones,
 * marcados con un texto que nadie escribiría, y los borra al terminar —
 * incluso si algo falla a mitad. Las dos cotizaciones que pasan por la
 * numeración automática gastan su número: el contador no retrocede, y eso es
 * lo correcto (ver test-numeracion).
 *
 * Se niega a correr contra producción: crea y borra cotizaciones.
 *
 * Las fechas de finalización de las cotizaciones de prueba se escriben a mano
 * a propósito: es la única forma de probar los bordes (justo a la medianoche
 * de Bogotá, un segundo antes) y meses que ya pasaron.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

if (process.argv.includes("--prod") || process.env.DB_NAME === "reportes_prod") {
  console.error("\nEsta prueba crea y borra cotizaciones. No se ejecuta contra producción.\n");
  process.exit(1);
}

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

const iguales = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
const mismoConjunto = (a: readonly string[], b: readonly string[]) =>
  iguales([...a].sort(), [...b].sort());

const RUN = crypto.randomUUID().slice(0, 8);
const MARCA = `[prueba cotizaciones ${RUN}]`;
const SEG = 1000;

/**
 * El mes de Bogotá de un instante, calculado por otro camino que la
 * aplicación (Intl en vez de restar horas), para no darle la razón al código
 * con el mismo código.
 */
function mesDeBogota(fecha: Date): string {
  return fecha.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }).slice(0, 7);
}

async function main() {
  const { db } = await import("../src/db");
  const { clients, companies, quotes, users } = await import("../src/db/schema");
  const { eq, inArray, like, ne } = await import("drizzle-orm");
  const q = await import("../src/lib/queries/quotes");
  const { serieCotizacionesFinalizadas } = await import("../src/lib/queries/analytics");
  const { aFiltrosDeConsulta, leerFiltrosCotizaciones } = await import(
    "../src/lib/filtros-cotizaciones"
  );
  const { aValorInput, inicioDelDia, sumarDias, ultimosMeses } = await import("../src/lib/fechas");
  const { aCsv } = await import("../src/lib/csv");
  const { csvDeCotizaciones, filasDeExportacion } = await import("../src/lib/exportar-cotizaciones");

  const empresasEnBase = (await db.select({ id: companies.id }).from(companies)).map((e) => e.id);
  const [autor] = await db.select({ id: users.id }).from(users).limit(1);
  if (!empresasEnBase.includes("saas") || !empresasEnBase.includes("corp") || !autor) {
    console.error("\nFaltan las dos empresas o un usuario en la base de desarrollo.\n");
    process.exit(1);
  }

  const ahora = new Date();
  const hoy = inicioDelDia(ahora);
  const desde15 = sumarDias(hoy, -14);
  const desde30 = sumarDias(hoy, -29);

  // Lo que la gráfica ya contaba antes de crear nada: la prueba compara la
  // diferencia, así que no le estorban las cotizaciones que ya hubiera.
  const serieAntes = await serieCotizacionesFinalizadas("saas", ahora);

  const clientePor: Record<string, string> = {};
  for (const empresa of ["saas", "corp"]) {
    const id = crypto.randomUUID();
    await db.insert(clients).values({
      id,
      companyId: empresa,
      name: `${MARCA} cliente ${empresa}`,
      createdBy: autor.id,
    });
    clientePor[empresa] = id;
  }

  let n = 0;
  /** Lo que se creó, para calcular aparte qué debería traer cada filtro. */
  const creadas = new Map<string, { empresa: string; estado: string; fin: Date | null }>();
  /** Una cotización de prueba, escrita directo en la base. Devuelve su id. */
  async function crear(datos: {
    nombre: string;
    empresa?: "saas" | "corp";
    estado?: (typeof quotes.$inferInsert)["status"];
    finalizadaEl?: Date | null;
    creadaEl?: Date;
    monto?: number | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    n++;
    await db.insert(quotes).values({
      id,
      companyId: datos.empresa ?? "saas",
      quoteNumber: `PRUEBA-${RUN}-${String(n).padStart(3, "0")}`,
      projectName: `${MARCA} ${datos.nombre}`,
      clientId: clientePor[datos.empresa ?? "saas"]!,
      status: datos.estado ?? "finalizada",
      finalizedAt: datos.finalizadaEl ?? null,
      amount: datos.monto ?? null,
      revisada: true,
      createdBy: autor.id,
      createdAt: datos.creadaEl ?? new Date(ahora.getTime() - n * SEG),
    });
    creadas.set(id, {
      empresa: datos.empresa ?? "saas",
      estado: datos.estado ?? "finalizada",
      fin: datos.finalizadaEl ?? null,
    });
    return id;
  }

  /** Las de prueba de una empresa finalizadas en [desde, hasta), calculado sin la base. */
  const esperadas = (empresa: string, desde: Date, hasta: Date) =>
    [...creadas]
      .filter(([, c]) => c.empresa === empresa && c.estado === "finalizada" && c.fin && c.fin >= desde && c.fin < hasta)
      .map(([id]) => id);

  try {
    // --- Las cotizaciones de prueba ----------------------------------------
    const ids = {
      hoy: await crear({ nombre: "finalizada hoy", finalizadaEl: new Date(ahora.getTime() - 60 * SEG), monto: 500 }),
      borde15: await crear({ nombre: "justo al empezar los 15 días", finalizadaEl: desde15, monto: 300 }),
      antes15: await crear({ nombre: "un segundo antes de los 15 días", finalizadaEl: new Date(desde15.getTime() - SEG), monto: 900 }),
      borde30: await crear({ nombre: "justo al empezar los 30 días", finalizadaEl: desde30 }),
      antes30: await crear({ nombre: "un segundo antes de los 30 días", finalizadaEl: new Date(desde30.getTime() - SEG), monto: 100 }),
      facturarConFecha: await crear({
        nombre: "en facturar con una fecha que no le corresponde",
        estado: "facturar",
        finalizadaEl: new Date(ahora.getTime() - 60 * SEG),
      }),
      historica: await crear({ nombre: "finalizada sin fecha registrada", finalizadaEl: null }),
      historica2: await crear({ nombre: "otra finalizada sin fecha", finalizadaEl: null }),
      deLlc: await crear({ nombre: "de la LLC", empresa: "corp", finalizadaEl: new Date(ahora.getTime() - 60 * SEG) }),
      // Rango personalizado en un mes que ya pasó, con los bordes de Bogotá:
      // 05:00 UTC es la medianoche de allá.
      rangoInicio: await crear({ nombre: "1 de marzo a la medianoche", finalizadaEl: new Date("2025-03-01T05:00:00Z") }),
      rangoAntes: await crear({ nombre: "28 de febrero a las 23:59:59", finalizadaEl: new Date("2025-03-01T04:59:59Z") }),
      rangoFin: await crear({ nombre: "31 de marzo a las 23:59:59", finalizadaEl: new Date("2025-04-01T04:59:59Z") }),
      rangoDespues: await crear({ nombre: "1 de abril a la medianoche", finalizadaEl: new Date("2025-04-01T05:00:00Z") }),
      // Para la gráfica: creada un mes y finalizada otro.
      creadaUnMesFinalizadaOtro: await crear({
        nombre: "creada hace tres meses, finalizada hace dos",
        creadaEl: sumarDias(hoy, -95),
        finalizadaEl: sumarDias(hoy, -62),
      }),
      // A las 10 de la noche del último día del mes anterior en Bogotá, que
      // en UTC ya es el primero del mes actual.
      finDeMesBogota: await crear({
        nombre: "último día del mes anterior a las 22:00 de Bogotá",
        finalizadaEl: new Date(ultimosMeses(ahora, 1).desde.getTime() - 2 * 3_600_000),
      }),
      canceladaConFecha: await crear({
        nombre: "cancelada con una fecha que no le corresponde",
        estado: "cancelada",
        finalizadaEl: new Date(ahora.getTime() - 60 * SEG),
      }),
    };
    // Relleno sin finalizar, para que la lista ocupe más de una página.
    const relleno: string[] = [];
    for (let i = 0; i < q.POR_PAGINA + 3; i++) {
      relleno.push(await crear({ nombre: `en curso ${i + 1}`, estado: "en_curso" }));
    }

    const leer = (p: Record<string, string>, empresas = ["saas", "corp"]) =>
      leerFiltrosCotizaciones({ q: MARCA, ...p }, { empresasPermitidas: empresas, ahora });
    const idsDe = async (p: Record<string, string>) => {
      const filtros = aFiltrosDeConsulta(leer(p));
      const todas: string[] = [];
      for (let pagina = 1; ; pagina++) {
        const r = await q.listarCotizaciones({ ...filtros, pagina });
        todas.push(...r.items.map((c) => c.id));
        if (pagina >= r.totalPaginas) break;
      }
      return todas;
    };

    console.log("\nLímites de los filtros rápidos, en hora de Bogotá\n");

    // 22:00 del 13 de octubre en Bogotá ya es 14 de octubre en UTC: el día que
    // vale es el 13.
    const tarde = leerFiltrosCotizaciones(
      { finalizadas: "15" },
      { empresasPermitidas: ["saas"], ahora: new Date("2026-10-14T03:00:00Z") },
    ).periodo;
    comprobar(
      "últimos 15 días a las 10 de la noche: desde la medianoche del 29 de septiembre hasta el final del 13 de octubre",
      tarde?.desde.toISOString() === "2026-09-29T05:00:00.000Z" &&
        tarde?.hasta.toISOString() === "2026-10-14T05:00:00.000Z",
      `${tarde?.desde.toISOString()} a ${tarde?.hasta.toISOString()}`,
    );
    const treinta = leerFiltrosCotizaciones(
      { finalizadas: "30" },
      { empresasPermitidas: ["saas"], ahora: new Date("2026-10-14T03:00:00Z") },
    ).periodo;
    comprobar(
      "últimos 30 días: hoy y los 29 anteriores",
      treinta?.desde.toISOString() === "2026-09-14T05:00:00.000Z" &&
        treinta?.hasta.toISOString() === "2026-10-14T05:00:00.000Z",
    );
    const rango = leerFiltrosCotizaciones(
      { finalizadas: "rango", desde: "2025-03-01", hasta: "2025-03-31" },
      { empresasPermitidas: ["saas"], ahora },
    ).periodo;
    comprobar(
      "un rango incluye sus dos días completos",
      rango?.desde.toISOString() === "2025-03-01T05:00:00.000Z" &&
        rango?.hasta.toISOString() === "2025-04-01T05:00:00.000Z",
    );
    const alReves = leerFiltrosCotizaciones(
      { finalizadas: "rango", desde: "2025-03-31", hasta: "2025-03-01" },
      { empresasPermitidas: ["saas"], ahora },
    );
    comprobar(
      "un rango al revés no se aplica, y se dice",
      alReves.rangoInvalido && !alReves.periodo,
    );
    const vacio = leerFiltrosCotizaciones(
      { finalizadas: "rango" },
      { empresasPermitidas: ["saas"], ahora },
    );
    comprobar(
      "un rango recién abierto, sin fechas, no filtra todavía ni es un error",
      !vacio.periodo && !vacio.rangoInvalido && vacio.finalizadas === "rango",
    );
    comprobar(
      "una empresa que no es del usuario se ignora, no se consulta",
      leerFiltrosCotizaciones({ empresa: "otra" }, { empresasPermitidas: ["saas"], ahora })
        .empresa === undefined,
    );

    console.log("\nFiltros por fecha de finalización, contra la base\n");

    const saas = (p: Record<string, string>) => idsDe({ ...p, empresa: "saas" });
    const manana = sumarDias(hoy, 1);
    const en15 = await saas({ finalizadas: "15" });
    const en30 = await saas({ finalizadas: "30" });
    comprobar(
      "últimos 15 días: exactamente las finalizadas desde la medianoche de hace 14 días",
      mismoConjunto(en15, esperadas("saas", desde15, manana)),
      `${en15.length} filas`,
    );
    comprobar(
      "el borde exacto entra y un segundo antes no",
      en15.includes(ids.borde15) && !en15.includes(ids.antes15) && en15.includes(ids.hoy),
    );
    comprobar(
      "últimos 30 días: exactamente las finalizadas desde la medianoche de hace 29 días",
      mismoConjunto(en30, esperadas("saas", desde30, manana)),
      `${en30.length} filas`,
    );
    comprobar(
      "y aquí entra la de antes de los 15, el borde de los 30 sí y un segundo antes no",
      en30.includes(ids.antes15) && en30.includes(ids.borde30) && !en30.includes(ids.antes30),
    );
    const de15 = await saas({ finalizadas: "15" });
    comprobar(
      "ninguna no finalizada entra, aunque tenga una fecha guardada",
      !de15.includes(ids.facturarConFecha) && !de15.includes(ids.canceladaConFecha),
    );
    comprobar(
      "las finalizadas sin fecha registrada no entran en ningún periodo",
      ![...(await saas({ finalizadas: "15" })), ...(await saas({ finalizadas: "30" }))].some(
        (id) => id === ids.historica || id === ids.historica2,
      ),
    );
    comprobar(
      "contraste: sin filtro de periodo, las finalizadas sin fecha sí están en la lista",
      (await saas({})).includes(ids.historica),
    );
    comprobar(
      "rango: entra lo del 1 a la medianoche y lo del 31 a las 23:59:59; no lo del 28 ni lo del 1 de abril",
      mismoConjunto(await saas({ finalizadas: "rango", desde: "2025-03-01", hasta: "2025-03-31" }), [
        ids.rangoInicio,
        ids.rangoFin,
      ]),
    );
    const soloHasta = await saas({ finalizadas: "rango", hasta: "2025-03-31" });
    comprobar(
      "rango solo con fecha final: todo lo finalizado hasta el final de ese día",
      mismoConjunto(soloHasta, [ids.rangoAntes, ids.rangoInicio, ids.rangoFin]),
    );
    const soloDesde = await saas({ finalizadas: "rango", desde: "2025-03-31" });
    comprobar(
      "rango solo con fecha inicial: desde ese día hasta hoy",
      soloDesde.includes(ids.rangoFin) &&
        soloDesde.includes(ids.rangoDespues) &&
        soloDesde.includes(ids.hoy) &&
        !soloDesde.includes(ids.rangoInicio),
    );
    comprobar(
      "un periodo no trae cotizaciones de otra empresa",
      !(await saas({ finalizadas: "15" })).includes(ids.deLlc),
    );
    comprobar(
      "contraste: sin elegir empresa, la de la LLC sí aparece",
      (await idsDe({ finalizadas: "15" })).includes(ids.deLlc),
    );

    console.log("\nOrden\n");

    const porFinalizacion = await saas({ orden: "finalizada", dir: "desc" });
    const conFecha = [ids.hoy, ids.borde15, ids.antes15, ids.borde30, ids.antes30];
    const posiciones = conFecha.map((id) => porFinalizacion.indexOf(id));
    comprobar(
      "por fecha de finalización, de la más reciente a la más antigua",
      posiciones.every((p, i) => p >= 0 && (i === 0 || p > posiciones[i - 1]!)),
    );
    const ultimaConFecha = porFinalizacion.indexOf(ids.rangoAntes);
    comprobar(
      "las que no tienen fecha de finalización van al final, también la de un estado que no es finalizada",
      [ids.historica, ids.facturarConFecha, ...relleno].every(
        (id) => porFinalizacion.indexOf(id) > ultimaConFecha,
      ),
    );
    const ascendente = await saas({ orden: "finalizada", dir: "asc" });
    comprobar(
      "y siguen al final en orden ascendente: un vacío no es \"el más antiguo\"",
      ascendente.indexOf(ids.historica) > ascendente.indexOf(ids.hoy),
    );
    const porValor = await saas({ orden: "valor", dir: "asc" });
    comprobar(
      "por valor, de menor a mayor",
      porValor.indexOf(ids.antes30) < porValor.indexOf(ids.borde15) &&
        porValor.indexOf(ids.borde15) < porValor.indexOf(ids.hoy) &&
        porValor.indexOf(ids.hoy) < porValor.indexOf(ids.antes15),
    );

    console.log("\nNúmero de página escrito a mano\n");

    comprobar(
      "solo un entero positivo es una página; cualquier otra cosa es la primera",
      ["1.33", "-2", "0", "abc", "", "99999999999999999999"].every((v) => leer({ pagina: v }).pagina === 1) &&
        leer({ pagina: "2" }).pagina === 2,
    );
    const desdeLaDireccion = await q
      .listarCotizaciones(aFiltrosDeConsulta(leer({ pagina: "1.33" })))
      .then((r) => r.pagina, () => null);
    const directoALaConsulta = await q
      .listarCotizaciones({ buscar: MARCA, pagina: 1.33 })
      .then((r) => r.pagina, () => null);
    comprobar(
      "\"?pagina=1.33\" muestra la primera página en vez de un error de la base, también si llega directo a la consulta",
      desdeLaDireccion === 1 && directoALaConsulta === 1,
      `${desdeLaDireccion} / ${directoALaConsulta}`,
    );
    const pagina1 = (await q.listarCotizaciones({ buscar: MARCA, pagina: 1 })).items.map((c) => c.id);
    const pagina2 = (await q.listarCotizaciones({ buscar: MARCA, pagina: 2 })).items.map((c) => c.id);
    comprobar(
      "contraste: la página 2 sigue siendo otra página",
      pagina2.length > 0 && !pagina2.some((id) => pagina1.includes(id)),
      `${pagina1.length} y ${pagina2.length} filas`,
    );

    console.log("\nLa exportación trae lo mismo que la pantalla\n");

    for (const [nombre, p] of [
      ["sin filtros", {}],
      ["últimos 15 días", { finalizadas: "15" }],
      ["últimos 30 días, por valor", { finalizadas: "30", orden: "valor", dir: "asc" }],
      ["rango", { finalizadas: "rango", desde: "2025-03-01", hasta: "2025-03-31" }],
      ["una empresa", { empresa: "saas" }],
      ["un estado", { estado: "en_curso" }],
    ] as [string, Record<string, string>][]) {
      const enPantalla = await idsDe(p);
      const exportadas = (
        await q.listarCotizacionesParaExportar(aFiltrosDeConsulta(leer(p)))
      ).items.map((c) => c.id);
      comprobar(
        `${nombre}: las mismas filas, en el mismo orden, todas las páginas juntas`,
        iguales(enPantalla, exportadas) && exportadas.length > 0,
        `${exportadas.length} filas`,
      );
    }
    comprobar(
      "contraste: la lista sin filtros ocupa más de una página",
      (await q.listarCotizaciones({ buscar: MARCA })).totalPaginas > 1,
    );

    const [hoyEnLista] = (
      await q.listarCotizacionesParaExportar(aFiltrosDeConsulta(leer({ finalizadas: "15", empresa: "saas" })))
    ).items.filter((c) => c.id === ids.hoy);
    const [historicaEnLista] = (
      await q.listarCotizacionesParaExportar(aFiltrosDeConsulta(leer({ empresa: "saas" })))
    ).items.filter((c) => c.id === ids.historica || c.id === ids.facturarConFecha);
    const textos = {
      encabezados: Array.from({ length: 14 }, (_, i) => `col${i}`),
      estado: (e: string) => `estado:${e}`,
      sinFechaRegistrada: "Sin fecha registrada",
      si: "Sí",
      no: "No",
    };
    const filas = filasDeExportacion(
      [hoyEnLista!, ...(await q.listarCotizacionesParaExportar(aFiltrosDeConsulta(leer({ empresa: "saas" })))).items.filter(
        (c) => c.id === ids.historica || c.id === ids.facturarConFecha,
      )],
      textos,
    );
    comprobar(
      "el archivo lleva la fecha de finalización, en hora de Bogotá",
      filas[0]![10] ===
        new Date(hoyEnLista!.finalizedAt!.getTime() - 5 * 3_600_000).toISOString().slice(0, 16).replace("T", " "),
      String(filas[0]![10]),
    );
    comprobar(
      "una finalizada sin fecha lo dice; una que no está finalizada no lleva ninguna fecha",
      filas.slice(1).every((f) =>
        f[4] === "estado:finalizada" ? f[10] === "Sin fecha registrada" : f[10] === null,
      ) && Boolean(historicaEnLista),
    );

    const csv = aCsv(["Número", "Proyecto"], [["Q1", "=HYPERLINK(\"x\")"], ["Q2", "Línea; 2\n\"bis\""]]);
    comprobar(
      "el CSV empieza con la marca de UTF-8 y va separado por punto y coma",
      csv.charCodeAt(0) === 0xfeff && csv.slice(1).startsWith("Número;Proyecto\r\n"),
    );
    comprobar(
      "un texto que Excel tomaría por fórmula queda como texto",
      csv.includes(`Q1;"'=HYPERLINK(""x"")"`),
    );
    comprobar(
      "un texto con punto y coma, saltos o comillas va entre comillas, sin romper la fila",
      csv.includes('Q2;"Línea; 2\n""bis"""'),
    );

    // La protección contra fórmulas, en todas las columnas que escribe una
    // persona y con cada carácter que Excel interpreta, leyendo el archivo de
    // vuelta como lo leería Excel —no buscando un pedazo de texto—.
    const leerCsv = (texto: string) => {
      const filasLeidas: string[][] = [];
      let fila: string[] = [];
      let celda = "";
      let entreComillas = false;
      for (let i = 0; i < texto.length; i++) {
        const ch = texto[i]!;
        if (entreComillas) {
          if (ch === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
          else if (ch === '"') entreComillas = false;
          else celda += ch;
        } else if (ch === '"') entreComillas = true;
        else if (ch === ";") { fila.push(celda); celda = ""; }
        else if (ch === "\r" && texto[i + 1] === "\n") { fila.push(celda); filasLeidas.push(fila); fila = []; celda = ""; i++; }
        else celda += ch;
      }
      return filasLeidas;
    };
    const PELIGROSOS = ["=", "+", "-", "@", "\t", "\r"];
    const LIBRES = [0, 1, 2, 5] as const; // número, proyecto, cliente, orden de compra
    const trampa = (c: string) => `${c}cmd|' /C calc'!A0;"x"`;
    const conTrampas = PELIGROSOS.map((c) => ({
      ...hoyEnLista!,
      quoteNumber: trampa(c),
      projectName: trampa(c),
      clientName: trampa(c),
      purchaseOrderNo: trampa(c),
      amount: -5,
    }));
    const normal = { ...hoyEnLista!, quoteNumber: "Q-9", projectName: "Línea 2 (bis)", clientName: "ACME", purchaseOrderNo: "4500" };
    const leidas = leerCsv(csvDeCotizaciones([...conTrampas, normal], textos).slice(1));
    comprobar(
      "el archivo se lee de vuelta con 14 columnas en cada fila",
      leidas.length === 1 + PELIGROSOS.length + 1 && leidas.every((f) => f.length === 14),
      leidas.map((f) => f.length).join(","),
    );
    comprobar(
      "cada texto libre que empieza por = + - @ tabulador o retorno queda como texto, con su contenido intacto",
      PELIGROSOS.every((c, i) => LIBRES.every((col) => leidas[1 + i]![col] === `'${trampa(c)}`)),
      JSON.stringify(leidas[1]?.filter((_, col) => (LIBRES as readonly number[]).includes(col))),
    );
    comprobar(
      "un texto normal no se toca, y el valor sigue siendo un número aunque sea negativo",
      LIBRES.every((col) => !leidas.at(-1)![col]!.startsWith("'")) &&
        leidas.at(-1)![1] === "Línea 2 (bis)" &&
        leidas.slice(1, -1).every((f) => f[7] === "-5"),
    );

    console.log("\nCambios de estado y fecha de finalización\n");

    const fecha = async (id: string) => (await q.obtenerCotizacion(id))?.finalizedAt ?? null;
    const cerca = (d: Date | null, de: number, a: number) =>
      d !== null && d.getTime() >= de - 60 * SEG && d.getTime() <= a + 60 * SEG;

    const t1 = await crear({ nombre: "recorrido de estados", estado: "en_curso" });
    comprobar("una cotización en curso no tiene fecha de finalización", (await fecha(t1)) === null);

    let antes = Date.now();
    await q.cambiarEstadoDeCotizacion({ id: t1, estado: "finalizada", userId: autor.id });
    const primera = await fecha(t1);
    comprobar("al pasar a finalizada guarda el momento del cambio", cerca(primera, antes, Date.now()));

    await new Promise((r) => setTimeout(r, 1100));
    await q.cambiarEstadoDeCotizacion({ id: t1, estado: "finalizada", userId: autor.id });
    comprobar(
      "volver a elegir finalizada no la mueve: la transición fue la primera vez",
      (await fecha(t1))?.getTime() === primera?.getTime(),
    );

    await q.cambiarEstadoDeCotizacion({ id: t1, estado: "facturar", userId: autor.id });
    comprobar("al salir de finalizada la fecha se borra", (await fecha(t1)) === null);

    antes = Date.now();
    await q.cambiarEstadoDeCotizacion({ id: t1, estado: "finalizada", userId: autor.id });
    const segunda = await fecha(t1);
    comprobar(
      "al volver a finalizarla, la fecha es la de esta nueva vez",
      cerca(segunda, antes, Date.now()) && segunda!.getTime() > primera!.getTime(),
    );

    await q.cambiarEstadoDeCotizacion({ id: ids.historica, estado: "finalizada", userId: autor.id });
    comprobar(
      "una finalizada sin fecha registrada sigue sin fecha si se vuelve a elegir finalizada: no se inventa",
      (await fecha(ids.historica)) === null,
    );
    comprobar(
      "y su fecha de modificación sí cambió: por eso no sirve como fecha de finalización",
      ((await q.obtenerCotizacion(ids.historica))?.updatedAt.getTime() ?? 0) > ahora.getTime() - 60 * SEG,
    );

    await q.cambiarEstadoDeCotizacion({ id: ids.historica2, estado: "en_curso", userId: autor.id });
    antes = Date.now();
    await q.cambiarEstadoDeCotizacion({ id: ids.historica2, estado: "finalizada", userId: autor.id });
    comprobar(
      "una histórica que se reabre y se vuelve a finalizar sí estrena fecha: esa transición es real",
      cerca(await fecha(ids.historica2), antes, Date.now()),
    );

    comprobar(
      "al crear: nace finalizada, con fecha; en otro estado, sin ella",
      q.fechaDeFinalizacionAlCrear("finalizada") !== null &&
        q.fechaDeFinalizacionAlCrear("en_curso") === null &&
        q.fechaDeFinalizacionAlCrear("cancelada") === null,
    );
    const nacidaFinalizada = crypto.randomUUID();
    const nacidaEnCurso = crypto.randomUUID();
    antes = Date.now();
    for (const [id, status] of [
      [nacidaFinalizada, "finalizada"],
      [nacidaEnCurso, "en_curso"],
    ] as const) {
      await q.insertarCotizacionConNumeroAutomatico({
        id,
        companyId: "saas",
        createdBy: autor.id,
        status,
        projectName: `${MARCA} creada ${status}`,
        clientId: clientePor.saas!,
        purchaseOrderNo: null,
        dueDate: null,
        description: null,
        amount: null,
        revisada: true,
      });
    }
    comprobar(
      "la numeración automática también guarda la fecha si nace finalizada",
      cerca(await fecha(nacidaFinalizada), antes, Date.now()) && (await fecha(nacidaEnCurso)) === null,
    );

    console.log("\nFecha de finalización registrada a mano\n");

    const registro = async (id: string) => {
      const c = await q.obtenerCotizacion(id);
      return {
        fin: c?.finalizedAt ?? null,
        por: c?.finalizacionRegistradaPor ?? null,
        el: c?.finalizacionRegistradaEl ?? null,
      };
    };
    const [{ nombre: nombreAutor }] = await db
      .select({ nombre: users.fullName })
      .from(users)
      .where(eq(users.id, autor.id));
    const iso = (d: Date | null) => d?.toISOString() ?? null;

    const declarada = await crear({ nombre: "histórica a la que se le registra la fecha", finalizadaEl: null });
    const sinFechaAntes = await q.contarFinalizadasSinFecha("saas");
    antes = Date.now();
    const r1 = await q.registrarFechaDeFinalizacion({ id: declarada, fecha: "2025-08-20", userId: autor.id });
    const reg1 = await registro(declarada);
    comprobar(
      "registrarla guarda el día declarado, quién lo escribió y cuándo",
      "ok" in r1 &&
        iso(reg1.fin) === "2025-08-20T12:00:00.000Z" &&
        reg1.por === nombreAutor &&
        cerca(reg1.el, antes, Date.now()),
      `${iso(reg1.fin)} por ${reg1.por}`,
    );
    comprobar(
      "la fecha declarada y el momento del registro se guardan por separado",
      reg1.fin !== null && reg1.el !== null && reg1.fin.getTime() !== reg1.el.getTime(),
    );
    comprobar(
      "deja de contarse entre las finalizadas sin fecha",
      (await q.contarFinalizadasSinFecha("saas")) === sinFechaAntes - 1,
    );
    comprobar(
      "entra en un rango que incluye ese día, y no en uno que no",
      (await saas({ finalizadas: "rango", desde: "2025-08-20", hasta: "2025-08-20" })).includes(declarada) &&
        !(await saas({ finalizadas: "rango", desde: "2025-08-21", hasta: "2025-08-31" })).includes(declarada),
    );

    await new Promise((r) => setTimeout(r, 1100));
    const r2 = await q.registrarFechaDeFinalizacion({ id: declarada, fecha: "2025-08-25", userId: autor.id });
    const reg2 = await registro(declarada);
    comprobar(
      "corregirla cambia el día y renueva el momento del registro",
      "ok" in r2 && iso(reg2.fin) === "2025-08-25T12:00:00.000Z" && reg2.el!.getTime() > reg1.el!.getTime(),
    );

    // Registrar o corregir no toca el estado ni nada más de la cotización:
    // solo la fecha, quién y cuándo, y la marca de última edición.
    const filaCruda = async (id: string) => {
      const [f] = await db.select().from(quotes).where(eq(quotes.id, id));
      const resto: Record<string, unknown> = { ...f! };
      for (const k of ["finalizedAt", "finalizedAtSetBy", "finalizedAtSetAt", "updatedAt", "updatedBy"]) delete resto[k];
      return JSON.stringify(resto);
    };
    const intacta = await crear({ nombre: "histórica: lo demás no se toca", finalizadaEl: null, monto: 777 });
    const antesDeRegistrar = await filaCruda(intacta);
    await q.registrarFechaDeFinalizacion({ id: intacta, fecha: "2025-07-10", userId: autor.id });
    const despuesDeRegistrar = await filaCruda(intacta);
    await q.registrarFechaDeFinalizacion({ id: intacta, fecha: "2025-07-11", userId: autor.id });
    const despuesDeCorregir = await filaCruda(intacta);
    comprobar(
      "registrar y corregir no cambian el estado ni ninguna otra columna de la cotización",
      antesDeRegistrar === despuesDeRegistrar && despuesDeRegistrar === despuesDeCorregir &&
        JSON.parse(despuesDeCorregir).status === "finalizada",
    );

    // Corregida por otra persona: el registro pasa a ser de ella, y la fecha
    // declarada sigue separada del momento en que se escribió.
    const [otraPersona] = await db
      .select({ id: users.id, nombre: users.fullName })
      .from(users)
      .where(ne(users.id, autor.id))
      .limit(1);
    if (otraPersona) {
      const regAntes = await registro(intacta);
      await new Promise((r) => setTimeout(r, 1100));
      await q.registrarFechaDeFinalizacion({ id: intacta, fecha: "2025-07-12", userId: otraPersona.id });
      const regOtra = await registro(intacta);
      comprobar(
        "si otra persona la corrige, el registro pasa a su nombre y a ese momento",
        regAntes.por === nombreAutor &&
          regOtra.por === otraPersona.nombre &&
          regOtra.el!.getTime() > regAntes.el!.getTime() &&
          iso(regOtra.fin) === "2025-07-12T12:00:00.000Z",
        `${regAntes.por} -> ${regOtra.por}`,
      );
      comprobar(
        "tras la corrección, la fecha declarada y el momento del registro siguen siendo distintos",
        regOtra.fin!.getTime() !== regOtra.el!.getTime() && regOtra.fin!.getTime() < regOtra.el!.getTime(),
      );
    } else {
      comprobar("hace falta un segundo usuario en la base para probar la corrección por otra persona", false);
    }

    const r3 = await q.registrarFechaDeFinalizacion({ id: t1, fecha: "2025-09-01", userId: autor.id });
    const reg3 = await registro(t1);
    comprobar(
      "también se corrige una fecha que puso el sistema, y queda marcada como escrita a mano",
      "ok" in r3 && iso(reg3.fin) === "2025-09-01T12:00:00.000Z" && reg3.el !== null && reg3.por === nombreAutor,
    );

    const ahoraMismo = new Date();
    const mananaTexto = aValorInput(sumarDias(ahoraMismo, 1));
    const hoyTexto = aValorInput(ahoraMismo);
    const futura = await q.registrarFechaDeFinalizacion({ id: declarada, fecha: mananaTexto, userId: autor.id });
    const malas = await Promise.all(
      ["2025-02-30", "abc", "1999-12-31", "", "2025-8-1"].map((f) =>
        q.registrarFechaDeFinalizacion({ id: declarada, fecha: f, userId: autor.id }),
      ),
    );
    const enCursoSinFecha = await crear({ nombre: "en curso: no admite fecha de finalización", estado: "en_curso" });
    const noFinalizada = await q.registrarFechaDeFinalizacion({ id: enCursoSinFecha, fecha: "2025-08-20", userId: autor.id });
    const reg4 = await registro(declarada);
    comprobar("una fecha futura se rechaza", "error" in futura && futura.error === "fechaFutura", mananaTexto);
    comprobar(
      "fechas imposibles, mal escritas, vacías o anteriores al 2000 se rechazan",
      malas.every((r) => "error" in r && r.error === "fechaInvalida"),
    );
    comprobar(
      "una cotización que no está finalizada no recibe fecha",
      "error" in noFinalizada && noFinalizada.error === "noFinalizada" && (await registro(enCursoSinFecha)).fin === null,
    );
    comprobar(
      "los intentos rechazados no tocaron la fecha guardada ni su registro",
      iso(reg4.fin) === iso(reg2.fin) && iso(reg4.el) === iso(reg2.el),
    );
    const deHoy = await crear({ nombre: "histórica a la que se le registra hoy", finalizadaEl: null });
    comprobar(
      "contraste: el día de hoy sí se acepta",
      "ok" in (await q.registrarFechaDeFinalizacion({ id: deHoy, fecha: hoyTexto, userId: autor.id })),
      hoyTexto,
    );

    await q.cambiarEstadoDeCotizacion({ id: declarada, estado: "finalizada", userId: autor.id });
    const reg5 = await registro(declarada);
    comprobar(
      "volver a elegir finalizada conserva la fecha escrita a mano y su registro",
      iso(reg5.fin) === iso(reg4.fin) && iso(reg5.el) === iso(reg4.el) && reg5.por === reg4.por,
    );
    await q.cambiarEstadoDeCotizacion({ id: declarada, estado: "facturar", userId: autor.id });
    const reg6 = await registro(declarada);
    comprobar(
      "al salir de finalizada se borran la fecha y su registro",
      reg6.fin === null && reg6.el === null && reg6.por === null,
    );
    antes = Date.now();
    await q.cambiarEstadoDeCotizacion({ id: declarada, estado: "finalizada", userId: autor.id });
    const reg7 = await registro(declarada);
    comprobar(
      "al finalizarla otra vez, la fecha es la del sistema y ya no figura como escrita a mano",
      cerca(reg7.fin, antes, Date.now()) && reg7.el === null && reg7.por === null,
    );

    const [t1EnLista] = (
      await q.listarCotizacionesParaExportar(aFiltrosDeConsulta(leer({ empresa: "saas" })))
    ).items.filter((c) => c.id === t1);
    const filaManual = filasDeExportacion([t1EnLista!], textos)[0]!;
    comprobar(
      "en el archivo, una fecha escrita a mano va solo con el día, y al final quién y cuándo",
      filaManual.length === 14 &&
        filaManual[10] === "2025-09-01" &&
        filaManual[12] === nombreAutor &&
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(filaManual[13])),
      `${filaManual[10]} | ${filaManual[12]} | ${filaManual[13]}`,
    );
    comprobar(
      "contraste: una fecha del sistema lleva la hora, y las dos columnas del registro van vacías",
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(filas[0]![10])) && filas[0]![12] === null && filas[0]![13] === null,
    );

    console.log("\nGráfica de finalizadas por mes\n");

    const serieDespues = await serieCotizacionesFinalizadas("saas", ahora);
    const delta = new Map(
      serieDespues.map((p, i) => [p.mes, p.total - (serieAntes[i]?.total ?? 0)]),
    );

    // Lo esperado, calculado aparte y desde las filas tal como quedaron.
    const { claves, desde } = ultimosMeses(ahora, 12);
    const filasPrueba = await db
      .select({ id: quotes.id, empresa: quotes.companyId, estado: quotes.status, fin: quotes.finalizedAt })
      .from(quotes)
      .where(like(quotes.projectName, `${MARCA}%`));
    const esperado = new Map(claves.map((k) => [k, 0]));
    for (const f of filasPrueba) {
      if (f.empresa !== "saas" || f.estado !== "finalizada" || !f.fin || f.fin < desde) continue;
      const mes = mesDeBogota(f.fin);
      esperado.set(mes, (esperado.get(mes) ?? 0) + 1);
    }
    comprobar(
      "son doce meses, terminando en el actual",
      serieDespues.length === 12 && serieDespues.at(-1)!.mes === mesDeBogota(ahora),
      `${serieDespues[0]!.mes} a ${serieDespues.at(-1)!.mes}`,
    );
    comprobar(
      "cada mes suma exactamente las finalizadas de prueba de ese mes: una vez cada una",
      claves.every((k) => delta.get(k) === esperado.get(k)),
      claves.map((k) => `${k}:${delta.get(k)}/${esperado.get(k)}`).join(" "),
    );
    const creada = mesDeBogota(sumarDias(hoy, -95));
    const finalizada = mesDeBogota(sumarDias(hoy, -62));
    comprobar(
      "la creada en un mes y finalizada en otro cuenta en el de su finalización",
      creada !== finalizada && (esperado.get(finalizada) ?? 0) >= 1,
      `creada ${creada}, finalizada ${finalizada}`,
    );
    const mesAnterior = claves.at(-2)!;
    comprobar(
      "lo finalizado a las 22:00 de Bogotá del último día del mes cuenta en ese mes, no en el siguiente",
      (delta.get(mesAnterior) ?? 0) >= 1 &&
        mesDeBogota(new Date(ultimosMeses(ahora, 1).desde.getTime() - 2 * 3_600_000)) === mesAnterior,
    );
    comprobar(
      "contraste: las que no cuentan —otra empresa, sin fecha, otro estado— no movieron la gráfica",
      [...delta.values()].reduce((a, b) => a + b, 0) ===
        [...esperado.values()].reduce((a, b) => a + b, 0),
    );
    const sinFecha = await q.contarFinalizadasSinFecha("saas");
    comprobar(
      "se pueden contar las finalizadas sin fecha, para decirlo junto a la gráfica",
      sinFecha >= 0 && Number.isInteger(sinFecha),
      `${sinFecha} en la base de desarrollo`,
    );

    console.log("\nA qué cotización se le puede colgar un reporte (viáticos)\n");

    const activaSaas = await crear({ nombre: "activa SAS", estado: "en_curso" });
    const activaLlc = await crear({ nombre: "activa LLC", empresa: "corp", estado: "en_curso" });
    const empleadoSas = { role: "empleado", empresas: [{ id: "saas" }], empresaActiva: { id: "saas" } };
    const empleadoSinEmpresa = { role: "empleado", empresas: [{ id: "saas" }], empresaActiva: null };
    const admin = { role: "admin", empresas: [{ id: "saas" }, { id: "corp" }], empresaActiva: null };
    const permitida = async (u: typeof empleadoSas | typeof admin | typeof empleadoSinEmpresa, id: string) =>
      (await q.cotizacionParaReporte(u, id))?.id ?? null;

    comprobar(
      "un empleado puede usar una cotización activa de su empresa",
      (await permitida(empleadoSas, activaSaas)) === activaSaas,
    );
    comprobar(
      "no la de otra empresa, aunque mande su id",
      (await permitida(empleadoSas, activaLlc)) === null,
    );
    comprobar(
      "ni una finalizada de su propia empresa",
      (await permitida(empleadoSas, ids.hoy)) === null,
    );
    comprobar(
      "ni un id que no existe, o que ni siquiera tiene forma de id",
      (await permitida(empleadoSas, crypto.randomUUID())) === null &&
        (await permitida(empleadoSas, "'; drop table quotes; --")) === null,
    );
    comprobar(
      "un empleado sin empresa activa no puede usar ninguna",
      (await permitida(empleadoSinEmpresa, activaSaas)) === null,
    );
    comprobar(
      "el admin puede usar la activa de cualquiera de sus empresas",
      (await permitida(admin, activaLlc)) === activaLlc && (await permitida(admin, activaSaas)) === activaSaas,
    );
    comprobar(
      "pero tampoco una que no está activa",
      (await permitida(admin, ids.deLlc)) === null,
    );
  } finally {
    const prueba = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(like(quotes.projectName, `${MARCA}%`));
    if (prueba.length > 0) {
      await db.delete(quotes).where(inArray(quotes.id, prueba.map((p) => p.id)));
    }
    await db.delete(clients).where(like(clients.name, `${MARCA}%`));
    const quedan = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(like(quotes.projectName, `${MARCA}%`));
    comprobar(
      "al terminar no queda ninguna cotización de prueba",
      quedan.length === 0,
      `${prueba.length} borradas`,
    );
  }

  console.log(
    fallos === 0
      ? "\nTodas las comprobaciones pasaron.\n"
      : `\n${fallos} comprobación(es) fallaron.\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
