/**
 * Verifica la deduplicación por cobertura: cuando la misma alarma sobre el mismo objeto
 * entra por 9x5 y por 24x7 (las dos reglas de automatización disparan sobre el mismo
 * evento), se informa una sola vez.
 *
 * Estos casos NO pueden cubrirse con los golden tests, porque aquéllos procesan cada
 * ticket por separado y la deduplicación necesita ver el lote completo.
 */
const { legacy, reales, reales2, mappings, aTicket } = require('./fixtures');

const porId = {};
[...legacy, ...reales, ...reales2].forEach(f => { porId[f.id] = f; });

/** Mismo par de tickets reales: SBM-26380 (9x5) y SBM-26382 (24x7), mismo host. */
const ticket9x5 = porId['real-SBM-26380-operations-host'];
const ticket24x7 = porId['real-SBM-26382-wetcom-mal-formada'];

function procesar(AlarmProcessor, fixtures) {
  const { mensajesProcesados, duplicadasDescartadas } = AlarmProcessor.procesarAlarmas(fixtures.map(aTicket), mappings);
  const salida = [];

  for (const pod in mensajesProcesados) {
    for (const cliente in mensajesProcesados[pod]) {
      for (const alarma in mensajesProcesados[pod][cliente]) {
        for (const origenStr in mensajesProcesados[pod][cliente][alarma]) {
          const origen = JSON.parse(origenStr);
          salida.push({ alarma: alarma, target: origen.target, cobertura: origen.cobertura || null });
        }
      }
    }
  }
  return { emitidas: salida, descartadas: duplicadasDescartadas || [] };
}

const unaSola = (coberturaEsperada) => ({ emitidas }) => {
  if (emitidas.length !== 1) return `esperaba 1 alarma, obtuvo ${emitidas.length}`;
  if (emitidas[0].cobertura !== coberturaEsperada) return `esperaba cobertura ${coberturaEsperada}, obtuvo ${emitidas[0].cobertura}`;
  return null;
};

const sinDeduplicar = (cantidad) => ({ emitidas, descartadas }) => {
  if (descartadas.length !== 0) return `no debería descartar nada, descartó ${descartadas.length}`;
  if (emitidas.length !== cantidad) return `esperaba ${cantidad} alarmas, obtuvo ${emitidas.length}`;
  return null;
};

const CASOS = [
  {
    nombre: 'La misma alarma por 9x5 y 24x7 se informa una sola vez, y gana la 9x5',
    fixtures: [ticket9x5, ticket24x7],
    verificar: unaSola('9x5')
  },
  {
    nombre: 'El orden de llegada no cambia el resultado (24x7 primero)',
    fixtures: [ticket24x7, ticket9x5],
    verificar: unaSola('9x5')
  },
  {
    nombre: 'Si sólo llega la 24x7, se informa igual (no se pierde la alarma)',
    fixtures: [ticket24x7],
    verificar: unaSola('24x7')
  },
  {
    nombre: 'Alarmas distintas bajo distinta cobertura NO se deduplican',
    fixtures: [ticket9x5, porId['real-SBM-26397-prosa-sin-cluster']],
    verificar: sinDeduplicar(2)
  },
  {
    nombre: 'Alarmas distintas bajo la misma cobertura NO se deduplican',
    fixtures: [porId['real-SBM-26392-vcenter-storage'], porId['real-SBM-26394-vcenter-vsan']],
    verificar: sinDeduplicar(2)
  },
  {
    nombre: 'El formato histórico (sin cobertura) nunca entra a la deduplicación',
    fixtures: [porId['legacy-host-not-responding'], porId['legacy-vsan-health-test'], porId['legacy-ha-failover']],
    verificar: sinDeduplicar(3)
  }
];

function correr(AlarmProcessor) {
  let fallos = 0;

  CASOS.forEach(caso => {
    const fixtures = caso.fixtures.filter(Boolean);
    if (fixtures.length !== caso.fixtures.length) throw new Error(`Fixture inexistente en el caso "${caso.nombre}"`);

    const error = caso.verificar(procesar(AlarmProcessor, fixtures));

    if (!error) {
      console.log(`  ok    ${caso.nombre}`);
    } else {
      fallos++;
      console.log(`  FALLA ${caso.nombre}`);
      console.log(`        ${error}`);
    }
  });

  return { total: CASOS.length, fallos };
}

module.exports = { correr };
