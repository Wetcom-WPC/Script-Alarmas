/**
 * Verifica el mensaje de error que arma `AlarmProcessor.procesarAlarmas` cuando un ticket
 * individual falla (ver AUDITORIA.md, punto 19). Antes citaba una "fila equivalente de
 * Excel" (`Equiv. Fila N`) que ya no tiene sentido: las alarmas vienen de la API de Jira,
 * no de una planilla con filas reales.
 */
const { crearSandbox } = require('./harness');
const { legacy, mappings, aTicket } = require('./fixtures');

function procesar(tickets) {
  const { obtener } = crearSandbox();
  const AlarmProcessor = obtener('AlarmProcessor');
  if (!AlarmProcessor) throw new Error('No se pudo cargar AlarmProcessor en el sandbox.');
  return AlarmProcessor.procesarAlarmas(tickets, mappings);
}

const CASOS = [
  {
    nombre: 'Ticket sin key: el error identifica la posición en el lote, no una fila de Excel',
    correr: () => {
      const { errores } = procesar([{ key: null, created: new Date(), summary: '', description: '' }]);
      if (errores.length !== 1) return `esperaba 1 error, hubo ${errores.length}`;
      if (errores[0].indexOf('Equiv. Fila') !== -1) return `no debería mencionar filas de Excel: ${errores[0]}`;
      if (errores[0].indexOf('elemento #1 del lote') === -1) return `esperaba identificar por posición: ${errores[0]}`;
      if (errores[0].indexOf('Clave faltante') === -1) return `debería incluir el motivo del error: ${errores[0]}`;
      return null;
    }
  },
  {
    nombre: 'Ticket con key pero fecha inválida: el error identifica por la key real, no por posición',
    correr: () => {
      const { errores } = procesar([{ key: 'SBM-99999', created: null, summary: '', description: '' }]);
      if (errores.length !== 1) return `esperaba 1 error, hubo ${errores.length}`;
      if (errores[0].indexOf('SBM-99999') === -1) return `debería identificar por la key: ${errores[0]}`;
      if (errores[0].indexOf('Equiv. Fila') !== -1) return `no debería mencionar filas de Excel: ${errores[0]}`;
      if (errores[0].indexOf('elemento #') !== -1) return `con key disponible no debería caer a la posición: ${errores[0]}`;
      return null;
    }
  },
  {
    nombre: 'La posición reportada es el índice real dentro del lote, no siempre "#1"',
    correr: () => {
      const ticketOk = aTicket(legacy[0]); // ticket sano, ya cubierto por el golden test
      const ticketRoto = { key: null, created: new Date(), summary: '', description: '' };
      const { errores } = procesar([ticketOk, ticketRoto]);
      if (errores.length !== 1) return `esperaba 1 solo error (el roto), hubo ${errores.length}: ${JSON.stringify(errores)}`;
      if (errores[0].indexOf('elemento #2 del lote') === -1) return `esperaba la posición #2 (índice 1), obtuvo: ${errores[0]}`;
      return null;
    }
  }
];

function correr() {
  let fallos = 0;

  CASOS.forEach(caso => {
    let error;
    try {
      error = caso.correr();
    } catch (e) {
      error = `excepción inesperada: ${e.message}`;
    }

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
