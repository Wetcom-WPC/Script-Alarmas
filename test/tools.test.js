/**
 * Verifica `Tools.esFinDeSemanaOFeriado`, en particular el comportamiento ante una falla de
 * la API pública de feriados (ver AUDITORIA.md, punto 8).
 *
 * Antes, cualquier falla de `api.argentinadatos.com` hacía que la guardia se diera por
 * omitida en silencio (se asumía día hábil). Ahora: se reintenta una vez, y si la API sigue
 * sin responder se asume que el día NO es hábil (se envía la guardia) y se avisa por Slack.
 */
const { crearSandboxServicios } = require('./harness');

/** Cualquier miércoles futuro, calculado en runtime para no depender de una fecha fija. */
function unMiercoles() {
  const d = new Date();
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7 || 7));
  d.setHours(10, 0, 0, 0);
  return d;
}

/** Cualquier sábado futuro, mismo criterio. */
function unSabado() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(10, 0, 0, 0);
  return d;
}

function comoYYYYMMDD(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * @param {Date} fecha
 * @param {Array} respuestasFeriados - una entrada por llamada esperada a la API; { code, body } o { throw }.
 */
function ejecutar(fecha, respuestasFeriados) {
  const llamadasFeriados = [];
  const llamadasSlack = [];

  const responder = (url, options) => {
    if (url.indexOf('argentinadatos.com') !== -1) {
      const i = llamadasFeriados.length;
      llamadasFeriados.push(url);
      const resp = respuestasFeriados[i] || respuestasFeriados[respuestasFeriados.length - 1];
      if (resp.throw) throw new Error(resp.throw);
      return { code: resp.code, body: resp.body };
    }
    if (url.indexOf('hooks.slack.com') !== -1) {
      llamadasSlack.push({ url, body: options.payload });
      return { code: 200, body: '{}' };
    }
    throw new Error(`El test no esperaba una llamada a ${url}`);
  };

  const propiedades = { SLACK_WEBHOOK_LOGS_TESTING: 'https://hooks.slack.com/TESTING' };
  const { obtener, logs } = crearSandboxServicios(responder, propiedades, ['utils/Http.js', 'services/SlackService.js', 'utils/Tools.js']);
  const Tools = obtener('Tools');
  if (!Tools) throw new Error('No se pudo cargar Tools en el sandbox.');

  const resultado = Tools.esFinDeSemanaOFeriado(fecha);
  return { resultado, llamadasFeriados, llamadasSlack, logs };
}

const CASOS = [
  {
    nombre: 'Sábado: no hábil, sin consultar la API de feriados',
    correr: () => {
      const { resultado, llamadasFeriados } = ejecutar(unSabado(), [{ code: 200, body: '[]' }]);
      if (!resultado) return 'un sábado debería dar no hábil';
      if (llamadasFeriados.length !== 0) return 'no debería haber consultado la API un fin de semana';
      return null;
    }
  },
  {
    nombre: 'Miércoles sin feriado: hábil, consulta la API una sola vez',
    correr: () => {
      const { resultado, llamadasFeriados, llamadasSlack } = ejecutar(unMiercoles(), [{ code: 200, body: '[]' }]);
      if (resultado) return 'debería dar hábil si no hay feriado';
      if (llamadasFeriados.length !== 1) return `esperaba 1 llamada, hubo ${llamadasFeriados.length}`;
      if (llamadasSlack.length !== 0) return 'no debería avisar nada si la API respondió bien';
      return null;
    }
  },
  {
    nombre: 'Miércoles feriado: no hábil',
    correr: () => {
      const fecha = unMiercoles();
      const feriados = [{ fecha: comoYYYYMMDD(fecha), motivo: 'Feriado de prueba' }];
      const { resultado } = ejecutar(fecha, [{ code: 200, body: JSON.stringify(feriados) }]);
      if (!resultado) return 'debería dar no hábil si la fecha está en el listado de feriados';
      return null;
    }
  },
  {
    nombre: 'La API falla una vez pero responde bien al reintentar: no asume feriado ni avisa',
    correr: () => {
      const { resultado, llamadasFeriados, llamadasSlack } = ejecutar(unMiercoles(), [
        { code: 500, body: 'boom' },
        { code: 200, body: '[]' }
      ]);
      if (resultado) return 'el reintento exitoso no debería terminar en "no hábil"';
      if (llamadasFeriados.length !== 2) return `esperaba 2 llamadas (falla + reintento), hubo ${llamadasFeriados.length}`;
      if (llamadasSlack.length !== 0) return 'un reintento exitoso no debería avisar nada por Slack';
      return null;
    }
  },
  {
    nombre: 'Si la API falla las DOS veces (HTTP), se asume no hábil y se avisa por Slack',
    correr: () => {
      const { resultado, llamadasFeriados, llamadasSlack, logs } = ejecutar(unMiercoles(), [
        { code: 500, body: 'boom' },
        { code: 503, body: 'boom otra vez' }
      ]);
      if (!resultado) return 'ante dos fallas debería asumir no hábil, no hábil';
      if (llamadasFeriados.length !== 2) return `esperaba 2 llamadas, hubo ${llamadasFeriados.length}`;
      if (llamadasSlack.length !== 1) return `esperaba avisar una vez por Slack, avisó ${llamadasSlack.length} veces`;
      if (!logs.some(l => l.indexOf('reintentar') !== -1 || l.indexOf('reintent') !== -1)) {
        return 'el log debería dejar constancia de que se reintentó';
      }
      return null;
    }
  },
  {
    nombre: 'Si la API tira excepción de red las DOS veces, mismo resultado defensivo',
    correr: () => {
      const { resultado, llamadasSlack } = ejecutar(unMiercoles(), [
        { throw: 'ECONNRESET' },
        { throw: 'ECONNRESET' }
      ]);
      if (!resultado) return 'ante dos errores de red debería asumir no hábil';
      if (llamadasSlack.length !== 1) return `esperaba avisar una vez por Slack, avisó ${llamadasSlack.length} veces`;
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
