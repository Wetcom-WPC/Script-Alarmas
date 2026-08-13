/**
 * Runner de tests de regresión (golden tests).
 *
 *   node test/run.js            → compara contra test/golden.json y falla si hay diferencias
 *   node test/run.js --update   → regenera test/golden.json (usar SOLO cuando el cambio es intencional)
 *
 * Los casos `legacy` congelan el comportamiento del formato viejo. Si alguno de esos
 * falla después de un refactor, es una regresión, no un golden desactualizado.
 */
const fs = require('fs');
const path = require('path');
const { crearSandbox } = require('./harness');
const { legacy, vrops, reales, reales2, mappings, aTicket } = require('./fixtures');

const RUTA_GOLDEN = path.join(__dirname, 'golden.json');
const actualizar = process.argv.includes('--update');

/** Ordena las claves de un objeto de forma recursiva para que el JSON sea estable. */
function estabilizar(valor) {
  if (Array.isArray(valor)) return valor.map(estabilizar);
  if (valor instanceof Date) return valor.toISOString();
  if (valor && typeof valor === 'object') {
    return Object.keys(valor).sort().reduce((acc, k) => {
      acc[k] = estabilizar(valor[k]);
      return acc;
    }, {});
  }
  return valor;
}

/**
 * Procesa un ticket aislado y devuelve una vista aplanada y legible del resultado,
 * para que un diff apunte directo al campo que cambió.
 */
function procesarAislado(AlarmProcessor, fixture) {
  const { mensajesProcesados, errores, alarmasSilenciadas } =
    AlarmProcessor.procesarAlarmas([aTicket(fixture)], mappings);

  const salida = { errores, alarmasSilenciadas: alarmasSilenciadas.map(a => a.log), entradas: [] };

  for (const pod of Object.keys(mensajesProcesados).sort()) {
    for (const cliente of Object.keys(mensajesProcesados[pod]).sort()) {
      for (const alarma of Object.keys(mensajesProcesados[pod][cliente]).sort()) {
        for (const origenStr of Object.keys(mensajesProcesados[pod][cliente][alarma]).sort()) {
          mensajesProcesados[pod][cliente][alarma][origenStr].forEach(entrada => {
            salida.entradas.push({
              pod,
              cliente,
              alarma,
              origen: JSON.parse(origenStr),
              summaryResto: entrada.summaryResto,
              warnings: entrada.warnings
            });
          });
        }
      }
    }
  }

  if (salida.entradas.length === 0) salida.excluida = true;
  return estabilizar(salida);
}

function main() {
  const { obtener } = crearSandbox();
  const AlarmProcessor = obtener('AlarmProcessor');
  if (!AlarmProcessor) throw new Error('No se pudo cargar AlarmProcessor en el sandbox.');

  const resultado = {};
  [...legacy, ...vrops, ...reales, ...reales2].forEach(fixture => {
    try {
      resultado[fixture.id] = procesarAislado(AlarmProcessor, fixture);
    } catch (e) {
      resultado[fixture.id] = { errorInesperado: e.message };
    }
  });

  if (actualizar) {
    fs.writeFileSync(RUTA_GOLDEN, JSON.stringify(resultado, null, 2) + '\n', 'utf8');
    console.log(`Golden actualizado con ${Object.keys(resultado).length} casos → test/golden.json`);
    return;
  }

  if (!fs.existsSync(RUTA_GOLDEN)) {
    console.error('No existe test/golden.json. Generalo con: node test/run.js --update');
    process.exit(1);
  }

  const esperado = JSON.parse(fs.readFileSync(RUTA_GOLDEN, 'utf8'));
  const ids = [...new Set([...Object.keys(esperado), ...Object.keys(resultado)])].sort();

  console.log('── Golden tests (parseo) ──');
  let fallos = 0;
  ids.forEach(id => {
    const a = JSON.stringify(esperado[id], null, 2);
    const b = JSON.stringify(resultado[id], null, 2);
    if (a === b) {
      console.log(`  ok    ${id}`);
    } else {
      fallos++;
      console.log(`  FALLA ${id}`);
      console.log('    esperado: ' + (a || '(ausente)').replace(/\n/g, '\n    '));
      console.log('    obtenido: ' + (b || '(ausente)').replace(/\n/g, '\n    '));
    }
  });

  console.log(`${ids.length - fallos}/${ids.length} casos ok`);

  console.log('\n── Reglas de Excepciones ──');
  const exc = require('./excepciones.test').correr(AlarmProcessor);
  console.log(`${exc.total - exc.fallos}/${exc.total} casos ok`);

  console.log('\n── Deduplicación por cobertura ──');
  const dedup = require('./deduplicacion.test').correr(AlarmProcessor);
  console.log(`${dedup.total - dedup.fallos}/${dedup.total} casos ok`);

  console.log('\n── Entorno y ruteo de webhooks ──');
  const entorno = require('./entorno.test').correr();
  console.log(`${entorno.total - entorno.fallos}/${entorno.total} casos ok`);

  console.log('\n── Cierre automático en Jira ──');
  const cierre = require('./cierreJira.test').correr();
  console.log(`${cierre.total - cierre.fallos}/${cierre.total} casos ok`);

  console.log('\n── Interpretación de vencimiento (Fechas) ──');
  const fechas = require('./fechas.test').correr();
  console.log(`${fechas.total - fechas.fallos}/${fechas.total} casos ok`);

  console.log('\n── Guardia: fin de semana / feriados ──');
  const tools = require('./tools.test').correr();
  console.log(`${tools.total - tools.fallos}/${tools.total} casos ok`);

  console.log('\n── Reintento HTTP ──');
  const http = require('./http.test').correr();
  console.log(`${http.total - http.fallos}/${http.total} casos ok`);

  console.log('\n── MessageFormatter (Slack / HTML) ──');
  const formatter = require('./messageFormatter.test').correr();
  console.log(`${formatter.total - formatter.fallos}/${formatter.total} casos ok`);

  console.log('\n── DataRepository (armado de mapas) ──');
  const repo = require('./dataRepository.test').correr();
  console.log(`${repo.total - repo.fallos}/${repo.total} casos ok`);

  console.log('\n── WebApp (validación de borrador) ──');
  const webapp = require('./webapp.test').correr();
  console.log(`${webapp.total - webapp.fallos}/${webapp.total} casos ok`);

  console.log('\n── Limpieza de excepciones vencidas ──');
  const limpieza = require('./limpieza.test').correr();
  console.log(`${limpieza.total - limpieza.fallos}/${limpieza.total} casos ok`);

  const totalFallos = fallos + exc.fallos + dedup.fallos + entorno.fallos + cierre.fallos + fechas.fallos + tools.fallos + http.fallos
    + formatter.fallos + repo.fallos + webapp.fallos + limpieza.fallos;
  if (totalFallos > 0) {
    console.error(`\n${totalFallos} caso(s) con diferencias.`);
    process.exit(1);
  }
  console.log('\nTodo ok.');
}

main();
