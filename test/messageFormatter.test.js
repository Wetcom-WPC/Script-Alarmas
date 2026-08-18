/**
 * Verifica `MessageFormatter`: el módulo con más lógica condicional del proyecto y, hasta
 * ahora, el único cuyo output efectivo (el string que se publica en Slack / el HTML del
 * correo de guardia) no verificaba nadie. Los golden tests sólo congelan la estructura
 * intermedia (`mensajesProcesados`), no el texto final.
 *
 * Cubre indentación, ocultamiento de "Desconocido", bloques por cobertura, rangos de fecha
 * y el escapado de HTML (ver AUDITORIA.md, punto 15).
 */
const { crearSandbox } = require('./harness');

function conFormatter() {
  const { obtener, logs } = crearSandbox();
  const MessageFormatter = obtener('MessageFormatter');
  if (!MessageFormatter) throw new Error('No se pudo cargar MessageFormatter en el sandbox.');
  return { MessageFormatter, logs };
}

const fecha = (iso) => new Date(iso);

/** Arma (o extiende) la estructura `mensajesProcesados[pod][cliente][alarma][origenJSON]`. */
function agregar(m, pod, cliente, alarma, origen, entradas) {
  const key = JSON.stringify(origen);
  if (!m[pod]) m[pod] = {};
  if (!m[pod][cliente]) m[pod][cliente] = {};
  if (!m[pod][cliente][alarma]) m[pod][cliente][alarma] = {};
  if (!m[pod][cliente][alarma][key]) m[pod][cliente][alarma][key] = [];
  m[pod][cliente][alarma][key].push(...entradas);
  return m;
}

const entrada = (created, summaryResto) => ({ created, summaryResto: summaryResto === undefined ? null : summaryResto, warnings: null });

const IND = (n) => ' '.repeat(n);

const CASOS = [
  {
    nombre: 'WPC se menciona con @wpc, otro POD con @pod<N>',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma X', { vCenter: 'Desconocido', cluster: 'Desconocido', target: 'Desconocido' }, [entrada(fecha('2026-08-01T10:00:00Z'))]);
      agregar(m, '5', 'Cliente B', 'Alarma Y', { vCenter: 'Desconocido', cluster: 'Desconocido', target: 'Desconocido' }, [entrada(fecha('2026-08-01T10:00:00Z'))]);
      const msg = MessageFormatter.generarMensaje(m, []);
      if (msg.indexOf('@wpc Buenas POD!') === -1) return 'no encontró el saludo de WPC';
      if (msg.indexOf('@pod5 Buenas POD!') === -1) return 'no encontró el saludo de POD 5';
      return null;
    }
  },
  {
    nombre: 'El párrafo de cierre es idéntico para WPC y para otro POD',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma X', { vCenter: 'Desconocido', cluster: 'Desconocido', target: 'Desconocido' }, [entrada(fecha('2026-08-01T10:00:00Z'))]);
      agregar(m, '5', 'Cliente B', 'Alarma Y', { vCenter: 'Desconocido', cluster: 'Desconocido', target: 'Desconocido' }, [entrada(fecha('2026-08-01T10:00:00Z'))]);
      const msg = MessageFormatter.generarMensaje(m, []);
      const cierre = 'Ante esto, les consulto, ¿están al tanto de la/s anomalía/s? ¿desean que le informemos al cliente?';
      const apariciones = msg.split(cierre).length - 1;
      if (apariciones !== 2) return `esperaba el cierre 2 veces (uno por POD), apareció ${apariciones}`;
      return null;
    }
  },
  {
    nombre: 'generarMensaje no revienta si no hay CacheService/DriveApp (Config.URL_WEB_APP configurado)',
    correr: () => {
      const { MessageFormatter, logs } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma X', { vCenter: 'Desconocido', cluster: 'Desconocido', target: 'Desconocido' }, [entrada(fecha('2026-08-01T10:00:00Z'))]);
      const msg = MessageFormatter.generarMensaje(m, []);
      if (msg.indexOf('📩') !== -1) return 'no debería haber generado un enlace de borrador sin Cache/Drive';
      if (!logs.some(l => l.indexOf('Error al generar borrador') !== -1)) return 'debería quedar logueado el intento fallido';
      return null;
    }
  },
  {
    nombre: '_formatearErrores: vacío da string vacío, sin encabezado',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      if (MessageFormatter._formatearErrores([]) !== '') return 'debería devolver string vacío sin errores';
      return null;
    }
  },
  {
    nombre: '_formatearErrores: lista cada error con su propio bullet',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      const texto = MessageFormatter._formatearErrores(['Ticket X: fecha inválida', 'Ticket Y: sin clave']);
      if (texto.indexOf('*Errores encontrados:*') === -1) return 'falta el encabezado';
      if (texto.indexOf('• Ticket X: fecha inválida') === -1) return 'falta el primer error';
      if (texto.indexOf('• Ticket Y: sin clave') === -1) return 'falta el segundo error';
      return null;
    }
  },
  {
    nombre: 'Indentación completa: vCenter (4) → Cluster (8) → Target (12) → detalle (16)',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma X',
        { vCenter: 'vcsa1.cliente.com', cluster: 'CL-01', target: 'esx01', etiquetaTarget: 'Host' },
        [entrada(fecha('2026-08-01T10:00:00Z'), 'Detalle de la alarma')]);
      const msg = MessageFormatter.generarMensaje(m, []);
      if (msg.indexOf(`${IND(4)}• *vCenter:* vcsa1.cliente.com\n`) === -1) return 'falta la línea de vCenter con 4 espacios';
      if (msg.indexOf(`${IND(8)}• *Cluster:* CL-01\n`) === -1) return 'falta la línea de Cluster con 8 espacios';
      if (msg.indexOf(`${IND(12)}• *Host:* esx01\n`) === -1) return 'falta la línea de Host con 12 espacios (hay Cluster)';
      if (msg.indexOf(`${IND(16)}• _Detalle de la alarma_\n`) === -1) return 'falta el detalle con 16 espacios (hay Cluster)';
      return null;
    }
  },
  {
    nombre: 'Sin Cluster: el target baja un nivel (8 en vez de 12) y el detalle también (12 en vez de 16)',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma X',
        { vCenter: 'vcsa1.cliente.com', cluster: 'Desconocido', target: 'esx01', etiquetaTarget: 'Host' },
        [entrada(fecha('2026-08-01T10:00:00Z'), 'Detalle sin cluster')]);
      const msg = MessageFormatter.generarMensaje(m, []);
      if (msg.indexOf('*Cluster:*') !== -1) return 'no debería mostrar el Cluster "Desconocido"';
      if (msg.indexOf(`${IND(8)}• *Host:* esx01\n`) === -1) return 'el target debería quedar a 8 espacios sin cluster';
      if (msg.indexOf(`${IND(12)}• _Detalle sin cluster_\n`) === -1) return 'el detalle debería quedar a 12 espacios sin cluster';
      return null;
    }
  },
  {
    nombre: 'Los valores "Desconocido" y "No encontrado" no se imprimen',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma X',
        { vCenter: 'Desconocido', cluster: 'Desconocido', target: 'Target no encontrado', etiquetaTarget: 'Host' },
        [entrada(fecha('2026-08-01T10:00:00Z'))]);
      const msg = MessageFormatter.generarMensaje(m, []);
      if (msg.indexOf('*vCenter:*') !== -1) return 'no debería mostrar vCenter "Desconocido"';
      if (msg.indexOf('*Host:*') !== -1) return 'no debería mostrar un target "no encontrado"';
      return null;
    }
  },
  {
    nombre: 'Coberturas distintas (9x5 / 24x7): la alarma se emite en DOS bloques separados',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma X',
        { vCenter: 'vc1', cluster: 'Desconocido', target: 'host-9x5', etiquetaTarget: 'Host', cobertura: '9x5' },
        [entrada(fecha('2026-08-01T10:00:00Z'))]);
      agregar(m, 'WPC', 'Cliente A', 'Alarma X',
        { vCenter: 'vc1', cluster: 'Desconocido', target: 'host-24x7', etiquetaTarget: 'Host', cobertura: '24x7' },
        [entrada(fecha('2026-08-01T11:00:00Z'))]);
      const msg = MessageFormatter.generarMensaje(m, []);
      const apariciones = msg.split('• *Alarma X*').length - 1;
      if (apariciones !== 2) return `esperaba el título de la alarma 2 veces (una por cobertura), apareció ${apariciones}`;
      if (msg.indexOf('host-9x5') === -1 || msg.indexOf('host-24x7') === -1) return 'faltan targets de alguna cobertura';
      return null;
    }
  },
  {
    nombre: 'Misma cobertura, distinto vCenter: UN solo título, dos líneas de vCenter',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma Y',
        { vCenter: 'vc1', cluster: 'Desconocido', target: 'host-a', etiquetaTarget: 'Host', cobertura: '9x5' },
        [entrada(fecha('2026-08-01T10:00:00Z'))]);
      agregar(m, 'WPC', 'Cliente A', 'Alarma Y',
        { vCenter: 'vc2', cluster: 'Desconocido', target: 'host-b', etiquetaTarget: 'Host', cobertura: '9x5' },
        [entrada(fecha('2026-08-01T10:05:00Z'))]);
      const msg = MessageFormatter.generarMensaje(m, []);
      const apariciones = msg.split('• *Alarma Y*').length - 1;
      if (apariciones !== 1) return `esperaba el título 1 sola vez, apareció ${apariciones}`;
      if ((msg.match(/\*vCenter:\*/g) || []).length !== 2) return 'esperaba dos líneas de vCenter distintas bajo el mismo título';
      return null;
    }
  },
  {
    nombre: 'Un summary con saltos de línea se parte en un bullet por línea, mismo indent',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      let m = {};
      agregar(m, 'WPC', 'Cliente A', 'Alarma X',
        { vCenter: 'Desconocido', cluster: 'Desconocido', target: 'esx01', etiquetaTarget: 'Host' },
        [entrada(fecha('2026-08-01T10:00:00Z'), 'Línea uno\nLínea dos')]);
      const msg = MessageFormatter.generarMensaje(m, []);
      if (msg.indexOf(`${IND(8)}• _Línea uno_\n`) === -1) return 'falta el primer bullet';
      if (msg.indexOf(`${IND(8)}• _Línea dos_\n`) === -1) return 'falta el segundo bullet';
      return null;
    }
  },
  {
    nombre: '_crearMensajeFecha: una sola entrada → "El día X a las Y"',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      const r = MessageFormatter._crearMensajeFecha([{ created: fecha('2026-08-01T13:07:00Z') }]);
      if (r.indexOf('El día') !== 0) return `formato inesperado: ${r}`;
      if (r.indexOf(' desde ') !== -1 || r.indexOf('Desde el día') !== -1) return `no debería ser un rango: ${r}`;
      return null;
    }
  },
  {
    nombre: '_crearMensajeFecha: mismo minuto (difieren en segundos) → sigue siendo una fecha única',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      const r = MessageFormatter._crearMensajeFecha([
        { created: fecha('2026-08-01T13:07:05Z') },
        { created: fecha('2026-08-01T13:07:58Z') }
      ]);
      if (r.indexOf('desde') !== -1) return `los segundos truncados deberían igualar las fechas, obtuvo: ${r}`;
      return null;
    }
  },
  {
    nombre: '_crearMensajeFecha: mismo día, distinta hora → rango "desde ... hasta ..."',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      const r = MessageFormatter._crearMensajeFecha([
        { created: fecha('2026-08-01T10:00:00Z') },
        { created: fecha('2026-08-01T15:30:00Z') }
      ]);
      if (r.indexOf('desde las') === -1 || r.indexOf('hasta las') === -1) return `esperaba un rango dentro del mismo día, obtuvo: ${r}`;
      if (r.indexOf('Desde el día') !== -1) return `no debería cruzar de día: ${r}`;
      return null;
    }
  },
  {
    nombre: '_crearMensajeFecha: días distintos → "Desde el día X ... hasta el día Y ..."',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      const r = MessageFormatter._crearMensajeFecha([
        { created: fecha('2026-08-01T10:00:00Z') },
        { created: fecha('2026-08-03T15:30:00Z') }
      ]);
      if (r.indexOf('Desde el día') !== 0) return `esperaba un rango entre días, obtuvo: ${r}`;
      if (r.indexOf('hasta el día') === -1) return `falta el "hasta el día": ${r}`;
      return null;
    }
  },
  {
    nombre: '_crearMensajeFecha: sin entradas válidas → "Fecha no disponible"',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      if (MessageFormatter._crearMensajeFecha([]) !== 'Fecha no disponible') return 'esperaba el mensaje de fallback con array vacío';
      if (MessageFormatter._crearMensajeFecha([{ created: null }]) !== 'Fecha no disponible') return 'esperaba el mensaje de fallback sin created';
      return null;
    }
  },
  {
    nombre: '_escapeHTML: escapa los cinco caracteres especiales',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      const r = MessageFormatter._escapeHTML(`<script>alert("x & 'y'")</script>`);
      if (r.indexOf('<') !== -1 || r.indexOf('>') !== -1) return `quedaron < o > sin escapar: ${r}`;
      if (r.indexOf('&lt;script&gt;') === -1) return `no escapó las etiquetas: ${r}`;
      if (r.indexOf('&quot;') === -1 || r.indexOf('&#39;') === -1) return `no escapó comillas: ${r}`;
      return null;
    }
  },
  {
    nombre: '_escapeHTML: null/undefined dan string vacío, no "null"/"undefined"',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      if (MessageFormatter._escapeHTML(null) !== '') return 'null debería dar string vacío';
      if (MessageFormatter._escapeHTML(undefined) !== '') return 'undefined debería dar string vacío';
      return null;
    }
  },
  {
    nombre: 'generarCorreoGuardiaHTML: escapa el nombre del cliente (sin inyección HTML)',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      const alarmasPorCliente = {
        '<b>Cliente Malicioso</b>': {
          'Alarma X': {
            [JSON.stringify({ vCenter: 'Desconocido', cluster: 'Desconocido', target: 'esx01', etiquetaTarget: 'Host' })]:
              [entrada(fecha('2026-08-01T10:00:00Z'))]
          }
        }
      };
      const html = MessageFormatter.generarCorreoGuardiaHTML('POD 5', alarmasPorCliente);
      if (html.indexOf('<b>Cliente Malicioso</b>') !== -1) return 'el nombre del cliente no se escapó (riesgo de inyección HTML)';
      if (html.indexOf('&lt;b&gt;Cliente Malicioso&lt;/b&gt;') === -1) return 'no se encontró la versión escapada del cliente';
      return null;
    }
  },
  {
    nombre: 'generarCorreoGuardiaHTML: arma la tabla con ALARMA/FECHA/etiqueta y oculta "Desconocido"',
    correr: () => {
      const { MessageFormatter } = conFormatter();
      const alarmasPorCliente = {
        'Cliente A': {
          'Alarma X': {
            [JSON.stringify({ vCenter: 'Desconocido', cluster: 'Desconocido', target: 'esx01', etiquetaTarget: 'Host' })]:
              [entrada(fecha('2026-08-01T10:00:00Z'))]
          }
        }
      };
      const html = MessageFormatter.generarCorreoGuardiaHTML('POD 5', alarmasPorCliente);
      if (html.indexOf('>ALARMA<') === -1) return 'falta la fila ALARMA';
      if (html.indexOf('Alarma X') === -1) return 'falta el nombre de la alarma';
      if (html.indexOf('>HOST<') === -1) return 'falta la fila de etiqueta HOST';
      if (html.indexOf('esx01') === -1) return 'falta el target';
      if (html.indexOf('>VCENTER<') !== -1) return 'no debería mostrar la fila de vCenter "Desconocido"';
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
