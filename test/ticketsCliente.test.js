/**
 * Verifica los enlaces a Jira que acompañan al nombre del cliente en el mensaje de Slack.
 *
 * Cubre las dos mitades de la funcionalidad, porque el dato cruza dos capas:
 *  - `AlarmProcessor` guarda la `ticketKey` de cada alarma en la entrada agrupada, y
 *  - `MessageFormatter._enlacesTickets` las junta, deduplica y las enlaza.
 */
const { crearSandbox } = require('./harness');

function conSandbox() {
  const { obtener } = crearSandbox();
  const AlarmProcessor = obtener('AlarmProcessor');
  const MessageFormatter = obtener('MessageFormatter');
  if (!AlarmProcessor || !MessageFormatter) throw new Error('No se pudo cargar el sandbox.');
  return { AlarmProcessor, MessageFormatter };
}

const MAPPINGS = {
  mapaClientes: { 'SOPFALABEL': 'Falabella' },
  mapaPodsClientes: { 'SOPFALABEL': '3' },
  mapaAlarmas: {
    'CertificateStatusAlarm': 'Alarma de estado de Certificado',
    'HostConnectivityAlarm': 'Desconexion de Host'
  },
  mapaCorreos: {},
  reglasExcepcion: []
};

const ticket = (key, target, idAlarma, texto) => ({
  key: key,
  pod: '3',
  created: new Date('2026-09-09T14:58:00Z'),
  summary: `${target} - [alarm.${idAlarma}] ${texto}`,
  description: `vCenter: vc01.falabella.com \nTarget: ${target} \nPrevious Status: Normal \nNew Status: Critical`
});

/** Arma la estructura agrupada a mano, para probar el formateo aislado del parseo. */
function conEntradas(entradas) {
  const origen = JSON.stringify({ vCenter: 'Desconocido', cluster: 'Desconocido', target: 'esx01', etiquetaTarget: 'Host' });
  return { 'Alarma X': { [origen]: entradas } };
}

const entrada = (ticketKey) => ({ created: new Date('2026-09-09T14:58:00Z'), warnings: null, summaryResto: null, ticketKey });

const CASOS = [
  {
    nombre: 'AlarmProcessor guarda la ticketKey en la entrada agrupada',
    correr: () => {
      const { AlarmProcessor } = conSandbox();
      const { mensajesProcesados } = AlarmProcessor.procesarAlarmas(
        [ticket('SOPFALABEL-26796', 'Datacenters', 'CertificateStatusAlarm', 'Certificate expires')],
        MAPPINGS
      );

      const alarmas = mensajesProcesados['3']['Falabella'];
      const primerOrigen = Object.keys(alarmas['Alarma de estado de Certificado'])[0];
      const entradaGuardada = alarmas['Alarma de estado de Certificado'][primerOrigen][0];

      if (entradaGuardada.ticketKey !== 'SOPFALABEL-26796') {
        return `esperaba la key del ticket en la entrada, obtuvo: ${JSON.stringify(entradaGuardada.ticketKey)}`;
      }
      return null;
    }
  },
  {
    nombre: 'El nombre del cliente arrastra el enlace a Jira de su ticket',
    correr: () => {
      const { MessageFormatter } = conSandbox();
      const enlaces = MessageFormatter._enlacesTickets(conEntradas([entrada('SOPFALABEL-26796')]));
      const esperado = ' | <https://wetcom.atlassian.net/browse/SOPFALABEL-26796|SOPFALABEL-26796>';
      if (enlaces !== esperado) return `esperaba "${esperado}", obtuvo "${enlaces}"`;
      return null;
    }
  },
  {
    nombre: 'Varias alarmas del mismo cliente listan un enlace por ticket, en orden',
    correr: () => {
      const { MessageFormatter } = conSandbox();
      const enlaces = MessageFormatter._enlacesTickets(
        conEntradas([entrada('SOPFALABEL-26796'), entrada('SOPFALABEL-26801')])
      );
      if (enlaces.indexOf('SOPFALABEL-26796') > enlaces.indexOf('SOPFALABEL-26801')) {
        return 'los tickets no conservan el orden de aparición';
      }
      if ((enlaces.match(/\| </g) || []).length !== 2) return `esperaba 2 enlaces, obtuvo: "${enlaces}"`;
      return null;
    }
  },
  {
    nombre: 'Un ticket que aparece en varias entradas se enlaza una sola vez',
    correr: () => {
      const { MessageFormatter } = conSandbox();
      // Pasa de verdad: la misma alarma sobre varios hosts se agrupa en un bloque, así que
      // el mismo ticket puede quedar repartido en más de una entrada.
      const enlaces = MessageFormatter._enlacesTickets(
        conEntradas([entrada('SOPFALABEL-26796'), entrada('SOPFALABEL-26796')])
      );
      if ((enlaces.match(/\| </g) || []).length !== 1) {
        return `el ticket se enlazó más de una vez: "${enlaces}"`;
      }
      return null;
    }
  },
  {
    nombre: 'Sin ticketKey no se agrega nada (no rompe ni deja separadores sueltos)',
    correr: () => {
      const { MessageFormatter } = conSandbox();
      const sinKey = { created: new Date('2026-09-09T14:58:00Z'), warnings: null, summaryResto: null };
      const enlaces = MessageFormatter._enlacesTickets(conEntradas([sinKey]));
      if (enlaces !== '') return `esperaba string vacío, obtuvo "${enlaces}"`;
      return null;
    }
  },
  {
    nombre: 'De punta a punta: el mensaje de Slack muestra el cliente con sus dos tickets',
    correr: () => {
      const { AlarmProcessor, MessageFormatter } = conSandbox();
      const { mensajesProcesados, errores } = AlarmProcessor.procesarAlarmas([
        ticket('SOPFALABEL-26796', 'Datacenters', 'CertificateStatusAlarm', 'Certificate expires'),
        ticket('SOPFALABEL-26801', 'esxi07.falabella.com', 'HostConnectivityAlarm', 'Host has lost connection')
      ], MAPPINGS);

      const mensaje = MessageFormatter.generarMensaje(mensajesProcesados, errores);
      const linea = mensaje.split('\n').find(l => l.indexOf('*Falabella*') === 0);

      if (!linea) return 'no se encontró la línea del cliente en el mensaje';
      if (linea.indexOf('SOPFALABEL-26796') === -1) return `falta el primer ticket: "${linea}"`;
      if (linea.indexOf('SOPFALABEL-26801') === -1) return `falta el segundo ticket: "${linea}"`;
      if (linea.indexOf('*Falabella* | <https://') !== 0) return `formato inesperado: "${linea}"`;
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
