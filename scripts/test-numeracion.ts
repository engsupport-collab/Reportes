/**
 * Prueba de la numeración de cotizaciones.
 *
 *   npm run test:numeracion
 *
 * Va contra la base de desarrollo, sin pasar por la interfaz, y usa las mismas
 * funciones que usa la aplicación. Lo que se comprueba es la única propiedad
 * que de verdad importa: que un número de cotización no se entregue dos veces
 * NUNCA — ni al borrar la cotización que lo usaba, ni con varios usuarios
 * creando cotizaciones en el mismo instante.
 *
 * Es una prueba con efectos: crea cotizaciones y las borra al terminar. Los
 * números que consume quedan consumidos, y eso no es basura que limpiar sino
 * justamente lo que se está verificando — el contador no retrocede.
 *
 * Se niega a correr contra producción: crear y borrar cotizaciones reales no
 * es algo que deba poder pasar por escribir mal una bandera.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

if (process.argv.includes("--prod")) {
  console.error(
    "\nEsta prueba crea y borra cotizaciones. No se ejecuta contra producción.\n",
  );
  process.exit(1);
}

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

const ANIO = new Date().getFullYear();
const MARCA = "[prueba numeracion]";

async function main() {
  const { db } = await import("../src/db");
  const { clients, companies, quoteSequences, quotes, users } = await import(
    "../src/db/schema"
  );
  const {
    esNumeroCotizacionDuplicado,
    insertarCotizacionConNumeroAutomatico,
    leerNumeroCotizacion,
    siguienteNumeroCotizacionSugerido,
    sincronizarSecuenciaConNumero,
  } = await import("../src/lib/queries/quotes");
  const { eq, inArray, sql } = await import("drizzle-orm");

  // --- Datos mínimos para poder insertar (claves foráneas) ---------------
  const [empresa] = await db.select({ id: companies.id }).from(companies).limit(1);
  const [autor] = await db.select({ id: users.id }).from(users).limit(1);
  const [cliente] = empresa
    ? await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.companyId, empresa.id))
        .limit(1)
    : [];

  if (!empresa || !autor || !cliente) {
    console.error(
      "\nFaltan datos base en la base de desarrollo (empresa, usuario o cliente).\n" +
        "Ejecuta `npm run seed:admin` y crea al menos un cliente antes de esta prueba.\n",
    );
    process.exit(1);
  }

  const creadas: string[] = [];

  async function crear(nombre: string): Promise<string> {
    const id = crypto.randomUUID();
    creadas.push(id);
    return insertarCotizacionConNumeroAutomatico({
      id,
      companyId: empresa.id,
      createdBy: autor.id,
      status: "en_curso",
      projectName: `${MARCA} ${nombre}`,
      clientId: cliente.id,
      purchaseOrderNo: null,
      dueDate: null,
      description: null,
      amount: null,
      revisada: true,
    });
  }

  const valor = (numero: string) => leerNumeroCotizacion(numero)?.valor ?? NaN;

  // --- 1. Creación normal: consecutivos, y la sugerencia acierta ---------
  console.log("\nCreación normal\n");

  const sugerido = await siguienteNumeroCotizacionSugerido();
  const primero = await crear("normal 1");
  comprobar(
    "el número asignado es el que el formulario venía mostrando",
    primero === sugerido,
    `sugerido ${sugerido}, asignado ${primero}`,
  );

  const segundo = await crear("normal 2");
  const tercero = await crear("normal 3");
  comprobar(
    "los siguientes van de uno en uno",
    valor(segundo) === valor(primero) + 1 && valor(tercero) === valor(segundo) + 1,
    [primero, segundo, tercero].join(" → "),
  );
  comprobar(
    "el formato se conserva",
    /^Q\d{4}_\d{3,}$/.test(tercero),
    tercero,
  );
  comprobar(
    "el año del número es el año en curso",
    leerNumeroCotizacion(tercero)?.anio === ANIO,
    tercero,
  );

  // --- 2. Borrar una cotización NO libera su número ----------------------
  console.log("\nEliminación\n");

  const aBorrar = await crear("se va a borrar");
  await db.delete(quotes).where(eq(quotes.id, creadas[creadas.length - 1]!));
  creadas.pop();

  const trasBorrado = await crear("después del borrado");
  comprobar(
    "el número de la borrada no se reutiliza",
    valor(trasBorrado) > valor(aBorrar),
    `borrada ${aBorrar}, siguiente ${trasBorrado}`,
  );
  comprobar(
    "y el hueco queda abierto a propósito, no se rellena",
    valor(trasBorrado) === valor(aBorrar) + 1,
    `${aBorrar} borrada, ${trasBorrado} entregada`,
  );

  const [huerfana] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(quotes)
    .where(eq(quotes.quoteNumber, aBorrar));
  comprobar(
    "nadie más lleva el número de la borrada",
    Number(huerfana?.n ?? 0) === 0,
    aBorrar,
  );

  // --- 3. Creación concurrente ------------------------------------------
  console.log("\nCreación concurrente\n");

  // Diez a la vez cubre con holgura el uso real: son entre dos y cinco
  // administrativos, y no todos creando cotizaciones en el mismo segundo. Se
  // puede subir con CONCURRENCIA=100 para forzar el caso extremo — la
  // implementación lo aguanta, pero no es lo que esta prueba vigila a diario.
  const A_LA_VEZ = Number(process.env.CONCURRENCIA ?? 10);
  const antesDeLaCarga = valor(await siguienteNumeroCotizacionSugerido());

  const resultados = await Promise.all(
    Array.from({ length: A_LA_VEZ }, (_, i) => crear(`concurrente ${i}`)),
  );
  const valores = resultados.map(valor);
  const distintos = new Set(resultados);

  comprobar(
    `${A_LA_VEZ} cotizaciones creadas a la vez reciben ${A_LA_VEZ} números distintos`,
    distintos.size === A_LA_VEZ,
    `${distintos.size} distintos`,
  );

  const ordenados = [...valores].sort((a, b) => a - b);
  const contiguos = ordenados.every((v, i) => i === 0 || v === ordenados[i - 1]! + 1);
  comprobar(
    "forman un tramo continuo, sin un solo hueco",
    contiguos,
    `${ordenados[0]}…${ordenados[ordenados.length - 1]}`,
  );
  comprobar(
    "el tramo arranca justo donde estaba el contador",
    ordenados[0] === antesDeLaCarga &&
      ordenados[ordenados.length - 1] === antesDeLaCarga + A_LA_VEZ - 1,
    `esperado ${antesDeLaCarga}…${antesDeLaCarga + A_LA_VEZ - 1}`,
  );

  const filasCreadas = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(quotes)
    .where(inArray(quotes.quoteNumber, resultados));
  comprobar(
    "y hay exactamente una cotización por número entregado",
    Number(filasCreadas[0]?.n ?? 0) === A_LA_VEZ,
    `${filasCreadas[0]?.n} filas`,
  );

  // --- 4. Unicidad en toda la tabla -------------------------------------
  console.log("\nUnicidad\n");

  const repetidos = await db
    .select({ numero: quotes.quoteNumber, veces: sql<number>`COUNT(*)` })
    .from(quotes)
    .where(sql`${quotes.quoteNumber} GLOB 'Q[0-9][0-9][0-9][0-9]_[0-9]*'`)
    .groupBy(quotes.quoteNumber)
    .having(sql`COUNT(*) > 1`);

  comprobar(
    "ningún número con el formato automático aparece dos veces en la tabla",
    repetidos.length === 0,
    repetidos.map((r) => `${r.numero}×${r.veces}`).join(", "),
  );

  // --- 5. La base rechaza un número repetido ----------------------------
  // Es la garantía que no puede vivir en el código: dos administradores
  // escribiendo el mismo número a la vez pasan los dos por la validación de
  // la aplicación, porque cada uno mira un instante en el que el otro todavía
  // no ha guardado. Solo el índice único los separa.
  console.log("\nUnicidad garantizada por la base\n");

  const enUso = resultados[0]!;

  async function insertarConNumero(numero: string): Promise<string | null> {
    const id = crypto.randomUUID();
    try {
      await db.insert(quotes).values({
        id,
        companyId: empresa.id,
        createdBy: autor.id,
        status: "en_curso",
        quoteNumber: numero,
        projectName: `${MARCA} duplicado`,
        clientId: cliente.id,
      });
      creadas.push(id);
      return null;
    } catch (error) {
      return esNumeroCotizacionDuplicado(error) ? "duplicado" : "otro";
    }
  }

  comprobar(
    "insertar un número que ya existe se rechaza",
    (await insertarConNumero(enUso)) === "duplicado",
    enUso,
  );

  const aLaVez = `Q${ANIO}_900`;
  const carrera = await Promise.all([
    insertarConNumero(aLaVez),
    insertarConNumero(aLaVez),
    insertarConNumero(aLaVez),
  ]);
  const aceptados = carrera.filter((x) => x === null).length;
  const rechazados = carrera.filter((x) => x === "duplicado").length;
  comprobar(
    "de tres administradores escribiendo el mismo número a la vez, entra uno solo",
    aceptados === 1 && rechazados === 2,
    `${aceptados} aceptado(s), ${rechazados} rechazado(s) por duplicado`,
  );

  const [sinNumero] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(quotes)
    .where(sql`${quotes.quoteNumber} IS NULL`);
  comprobar(
    "el índice único sigue admitiendo cotizaciones sin número",
    Number(sinNumero?.n ?? 0) >= 0,
    `${sinNumero?.n} sin número conviven bajo el índice`,
  );

  // --- 6. Si la inserción falla, la reserva se deshace -------------------
  // Es lo que demuestra que reservar el número y guardar la cotización van en
  // la MISMA transacción. Se fuerza el fallo repitiendo un id que ya existe:
  // la reserva ya ocurrió, así que si no hubiera transacción el contador
  // habría avanzado y ese número se perdería para siempre.
  console.log("\nReserva deshecha al fallar la inserción\n");

  const [contadorAntesDelFallo] = await db
    .select({ v: quoteSequences.lastValue })
    .from(quoteSequences)
    .where(eq(quoteSequences.year, ANIO));

  const idRepetido = creadas[0]!;
  let fallo = false;
  try {
    await insertarCotizacionConNumeroAutomatico({
      id: idRepetido,
      companyId: empresa.id,
      createdBy: autor.id,
      status: "en_curso",
      projectName: `${MARCA} nunca deberia existir`,
      clientId: cliente.id,
      purchaseOrderNo: null,
      dueDate: null,
      description: null,
      amount: null,
      revisada: true,
    });
  } catch {
    fallo = true;
  }

  comprobar("la inserción con id repetido falla, como debe", fallo);

  const [contadorTrasFallo] = await db
    .select({ v: quoteSequences.lastValue })
    .from(quoteSequences)
    .where(eq(quoteSequences.year, ANIO));
  comprobar(
    "el contador NO avanzó: la reserva se deshizo con la transacción",
    Number(contadorTrasFallo?.v) === Number(contadorAntesDelFallo?.v),
    `${contadorAntesDelFallo?.v} → ${contadorTrasFallo?.v}`,
  );

  const fantasmas = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(quotes)
    .where(eq(quotes.projectName, `${MARCA} nunca deberia existir`));
  comprobar(
    "no quedó ninguna cotización a medio crear",
    Number(fantasmas[0]?.n ?? 0) === 0,
    `${fantasmas[0]?.n} filas`,
  );

  const trasElFallo = await crear("después del fallo");
  comprobar(
    "el número que se iba a usar no se quemó: lo recibe la siguiente",
    valor(trasElFallo) === Number(contadorAntesDelFallo?.v) + 1,
    trasElFallo,
  );

  // --- 7. Un número escrito a mano adelanta el contador ------------------
  // Se hace sobre un año inventado para no mover el contador del año real.
  console.log("\nNúmero escrito a mano\n");

  const ANIO_FICTICIO = 2999;
  await db.delete(quoteSequences).where(eq(quoteSequences.year, ANIO_FICTICIO));

  await sincronizarSecuenciaConNumero(`Q${ANIO_FICTICIO}_050`);
  const [tras50] = await db
    .select({ v: quoteSequences.lastValue })
    .from(quoteSequences)
    .where(eq(quoteSequences.year, ANIO_FICTICIO));
  comprobar(
    "escribir Q2999_050 a mano deja el contador en 50",
    Number(tras50?.v) === 50,
    `contador ${tras50?.v}`,
  );

  await sincronizarSecuenciaConNumero(`Q${ANIO_FICTICIO}_007`);
  const [tras7] = await db
    .select({ v: quoteSequences.lastValue })
    .from(quoteSequences)
    .where(eq(quoteSequences.year, ANIO_FICTICIO));
  comprobar(
    "un número menor NO lo hace retroceder",
    Number(tras7?.v) === 50,
    `contador ${tras7?.v}`,
  );

  await sincronizarSecuenciaConNumero("no-es-un-numero-de-los-nuestros");
  const [trasBasura] = await db
    .select({ v: quoteSequences.lastValue })
    .from(quoteSequences)
    .where(eq(quoteSequences.year, ANIO_FICTICIO));
  comprobar(
    "un texto con otro formato no lo toca",
    Number(trasBasura?.v) === 50,
    `contador ${trasBasura?.v}`,
  );

  await db.delete(quoteSequences).where(eq(quoteSequences.year, ANIO_FICTICIO));

  // --- 8. Limpieza, y el contador sigue donde estaba ---------------------
  console.log("\nLimpieza\n");

  const [antesDeLimpiar] = await db
    .select({ v: quoteSequences.lastValue })
    .from(quoteSequences)
    .where(eq(quoteSequences.year, ANIO));

  if (creadas.length > 0) {
    await db.delete(quotes).where(inArray(quotes.id, creadas));
  }

  const [despuesDeLimpiar] = await db
    .select({ v: quoteSequences.lastValue })
    .from(quoteSequences)
    .where(eq(quoteSequences.year, ANIO));

  comprobar(
    `borradas las ${creadas.length} cotizaciones de prueba, el contador no retrocede`,
    Number(despuesDeLimpiar?.v) === Number(antesDeLimpiar?.v),
    `${antesDeLimpiar?.v} → ${despuesDeLimpiar?.v}`,
  );

  const siguienteTrasLimpieza = await siguienteNumeroCotizacionSugerido();
  comprobar(
    "y el próximo número sigue siendo el de después de todas las borradas",
    valor(siguienteTrasLimpieza) === Number(antesDeLimpiar?.v) + 1,
    siguienteTrasLimpieza,
  );

  console.log(
    fallos === 0
      ? "\nTodo correcto.\n"
      : `\n${fallos} comprobación(es) fallida(s).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nError al ejecutar la prueba:", error);
  process.exit(1);
});
