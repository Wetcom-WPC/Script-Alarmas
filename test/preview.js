/**
 * Imprime por consola el mensaje de Slack que generaría el script con los fixtures.
 * No es un test: es para revisar a ojo cómo queda la salida real.
 *
 *   node test/preview.js
 */
const { crearSandbox } = require('./harness');
const { legacy, vrops, reales, reales2, mappings, aTicket } = require('./fixtures');

const { obtener } = crearSandbox();
const AlarmProcessor = obtener('AlarmProcessor');
const MessageFormatter = obtener('MessageFormatter');

const tickets = [...legacy, ...vrops, ...reales, ...reales2].map(aTicket);
const { mensajesProcesados, errores } = AlarmProcessor.procesarAlarmas(tickets, mappings);

console.log(MessageFormatter.generarMensaje(mensajesProcesados, errores));
