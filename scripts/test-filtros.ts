/**
 * Prueba de los filtros de reportes.
 *
 *   npm run test:filtros
 *
 * Va contra la base real, sin pasar por la interfaz. Comprueba que filtrar por
 * etiqueta, por tipo de servicio y por empresa devuelve exactamente lo que
 * debe: un filtro que devuelve de más es una fuga, y uno que devuelve de menos
 * esconde trabajo hecho.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

async function main() {
  const { listarReportes } = await import("../src/lib/queries/reports");
  const { ETIQUETAS_TRABAJO, TIPOS_SERVICIO } = await import(
    "../src/lib/etiquetas"
  );

  console.log("\nFiltro por etiqueta\n");

  for (const marca of ETIQUETAS_TRABAJO) {
    const { items, total } = await listarReportes({
      companyId: "corp",
      etiqueta: marca.id,
      porPagina: 100,
    });

    const todosLaTienen = items.every((r) => r.etiquetas.includes(marca.id));
    comprobar(
      `"${marca.label}": los ${items.length} resultados tienen la etiqueta`,
      todosLaTienen,
      `total ${total}`,
    );
  }

  console.log("\nFiltro por tipo de servicio\n");

  for (const tipo of TIPOS_SERVICIO) {
    const { items } = await listarReportes({
      companyId: "corp",
      serviceType: tipo.id,
      porPagina: 100,
    });

    comprobar(
      `"${tipo.label}": los ${items.length} resultados son de ese tipo`,
      items.every((r) => r.serviceType === tipo.id),
    );
  }

  console.log("\nLos filtros no rompen el aislamiento por empresa\n");

  // porPagina lo bastante grande para cubrir el conjunto de prueba completo,
  // sea que tenga la docena original de reportes o los 2.000 sembrados para
  // medir rendimiento (fase 9): estas comprobaciones comparan por conjunto de
  // ids, y con una página que no alcanza a traer todo, compararían solo un
  // recorte y no el conjunto real.
  const PORPAGINA_TODO = 5000;

  const corp = await listarReportes({ companyId: "corp", porPagina: PORPAGINA_TODO });
  const saas = await listarReportes({ companyId: "saas", porPagina: PORPAGINA_TODO });

  comprobar("hay reportes en Corp", corp.total > 0, `${corp.total}`);
  comprobar("hay reportes en SaaS", saas.total > 0, `${saas.total}`);

  const idsCorp = new Set(corp.items.map((r) => r.id));
  comprobar(
    "ningún reporte aparece en las dos empresas",
    saas.items.every((r) => !idsCorp.has(r.id)),
  );

  // Un filtro combinado tampoco debe traer nada de la otra empresa.
  const combinado = await listarReportes({
    companyId: "corp",
    etiqueta: ETIQUETAS_TRABAJO[0]!.id,
    serviceType: TIPOS_SERVICIO[0]!.id,
    porPagina: 100,
  });
  comprobar(
    "etiqueta + tipo de servicio: todo sigue siendo de Corp",
    combinado.items.every((r) => idsCorp.has(r.id)),
    `${combinado.total} resultados`,
  );

  console.log("\nVista del admin: sin companyId trae las dos empresas\n");

  // Este es el caso nuevo del rediseño: el admin no elige empresa, así que
  // `listarReportes` sin `companyId` es su consulta por defecto.
  const todas = await listarReportes({ porPagina: PORPAGINA_TODO });
  const idsTodas = new Set(todas.items.map((r) => r.id));
  const idsEsperados = new Set([
    ...corp.items.map((r) => r.id),
    ...saas.items.map((r) => r.id),
  ]);

  comprobar(
    "el total sin filtro es la suma exacta de Corp + SaaS",
    todas.total === corp.total + saas.total,
    `${todas.total} vs ${corp.total} + ${saas.total}`,
  );
  comprobar(
    "la vista sin filtro trae exactamente esos mismos reportes, ni uno de más ni de menos",
    idsTodas.size === idsEsperados.size &&
      [...idsEsperados].every((id) => idsTodas.has(id)),
  );
  comprobar(
    "cada fila sin filtro trae su propia empresa (companyId/companyName)",
    todas.items.every(
      (r) =>
        (r.companyId === "corp" || r.companyId === "saas") &&
        r.companyName.length > 0,
    ),
  );
  comprobar(
    "la vista sin filtro mezcla filas de las dos empresas, no solo una",
    new Set(todas.items.map((r) => r.companyId)).size === 2,
  );

  console.log("\nCombinación con búsqueda\n");

  const conBusqueda = await listarReportes({
    companyId: "corp",
    buscar: "Mantenimiento",
    porPagina: 100,
  });
  comprobar(
    "la búsqueda solo mira dentro de la empresa activa",
    conBusqueda.items.every((r) => idsCorp.has(r.id)),
    `${conBusqueda.total} resultados`,
  );

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
