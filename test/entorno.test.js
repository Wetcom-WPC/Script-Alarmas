/**
 * Verifica la resolución del entorno y el ruteo de webhooks que depende de ella.
 *
 * Es el interruptor más delicado del proyecto: decide a qué canal de Slack se publica,
 * qué carpeta de Drive se usa y si el correo de guardia lleva copia a wpc@. Un error acá
 * no rompe nada de forma visible, simplemente manda las cosas al lugar equivocado.
 *
 * La regla que se protege: ante una property ausente o ilegible, el entorno DEBE caer en
 * TESTING. Nunca al revés.
 */
const { crearSandboxServicios } = require('./harness');

/** Config aislada, con las Script Properties que indique el caso. */
function configCon(propiedades) {
  const { obtener, logs } = crearSandboxServicios(() => ({ code: 200, body: '{}' }), propiedades);
  const Config = obtener('Config');
  if (!Config) throw new Error('No se pudo cargar Config en el sandbox.');
  return { Config, logs };
}

const CASOS = [
  {
    nombre: 'Property ausente: se asume TESTING y queda avisado en el log',
    correr: () => {
      const { Config, logs } = configCon({ ENTORNO: null });
      if (Config.esProduccion()) return 'sin property se comportó como PRODUCCION';
      if (Config.ENTORNO !== 'TESTING') return `esperaba TESTING, obtuvo ${Config.ENTORNO}`;
      if (!logs.some(l => l.indexOf('ausente o no reconocida') !== -1)) return 'no avisó que faltaba la property';
      return null;
    }
  },
  {
    nombre: 'Valor mal tipeado ("PRDUCCION"): cae en TESTING, no en producción',
    correr: () => {
      const { Config, logs } = configCon({ ENTORNO: 'PRDUCCION' });
      if (Config.esProduccion()) return 'un typo activó el entorno productivo';
      if (!logs.some(l => l.indexOf('PRDUCCION') !== -1)) return 'el log debería mostrar el valor recibido';
      return null;
    }
  },
  {
    nombre: 'PropertiesService inaccesible: no lanza y cae en TESTING',
    correr: () => {
      const { Config } = configCon({});
      // El doble devuelve "valor-falso-ENTORNO", que no es un entorno válido.
      if (Config.esProduccion()) return 'un valor desconocido activó producción';
      return null;
    }
  },
  {
    nombre: 'PRODUCCION activa el entorno productivo',
    correr: () => {
      const { Config } = configCon({ ENTORNO: 'PRODUCCION' });
      if (!Config.esProduccion()) return 'no reconoció PRODUCCION';
      return null;
    }
  },
  {
    nombre: 'Se toleran minúsculas, espacios, acento y el "PROD" de memoria',
    correr: () => {
      const variantes = ['  produccion ', 'Producción', 'PROD', 'prod'];
      for (let i = 0; i < variantes.length; i++) {
        const { Config } = configCon({ ENTORNO: variantes[i] });
        if (!Config.esProduccion()) return `no reconoció "${variantes[i]}" como producción`;
      }
      return null;
    }
  },
  {
    nombre: 'TESTING explícito no genera ruido en el log',
    correr: () => {
      const { Config, logs } = configCon({ ENTORNO: 'TESTING' });
      if (Config.esProduccion()) return 'TESTING activó producción';
      if (logs.some(l => l.indexOf('ausente o no reconocida') !== -1)) return 'no debería avisar nada con un valor válido';
      return null;
    }
  },
  {
    nombre: 'En producción, los logs de excepciones NO van al webhook de testing',
    correr: () => {
      const { Config } = configCon({
        ENTORNO: 'PRODUCCION',
        SLACK_WEBHOOK_LOGS_PROD: 'https://hooks.slack.com/PROD',
        SLACK_WEBHOOK_LOGS_TESTING: 'https://hooks.slack.com/TESTING'
      });
      const url = Config.obtenerWebhookLogs();
      if (url !== 'https://hooks.slack.com/PROD') return `esperaba el webhook de producción, obtuvo ${url}`;
      return null;
    }
  },
  {
    nombre: 'En testing, los logs siguen yendo al webhook de testing',
    correr: () => {
      const { Config } = configCon({
        ENTORNO: 'TESTING',
        SLACK_WEBHOOK_LOGS_PROD: 'https://hooks.slack.com/PROD',
        SLACK_WEBHOOK_LOGS_TESTING: 'https://hooks.slack.com/TESTING'
      });
      const url = Config.obtenerWebhookLogs();
      if (url !== 'https://hooks.slack.com/TESTING') return `esperaba el webhook de testing, obtuvo ${url}`;
      return null;
    }
  },
  {
    nombre: 'El webhook del resumen principal también sigue al entorno',
    correr: () => {
      const props = { SLACK_WEBHOOK_PROD: 'PROD', SLACK_WEBHOOK_TESTING: 'TEST' };
      const prod = configCon(Object.assign({ ENTORNO: 'PRODUCCION' }, props)).Config;
      const test = configCon(Object.assign({ ENTORNO: 'TESTING' }, props)).Config;
      if (prod.obtenerWebhookSlack() !== 'PROD') return 'en producción no usó el webhook productivo';
      if (test.obtenerWebhookSlack() !== 'TEST') return 'en testing no usó el webhook de testing';
      return null;
    }
  },
  {
    nombre: 'La carpeta de borradores también sigue al entorno',
    correr: () => {
      const props = { CARPETA_BORRADORES_PROD: 'carpeta-prod', CARPETA_BORRADORES_TESTING: 'carpeta-test' };
      const prod = configCon(Object.assign({ ENTORNO: 'PRODUCCION' }, props)).Config;
      const test = configCon(Object.assign({ ENTORNO: 'TESTING' }, props)).Config;
      if (prod.ID_CARPETA_BORRADORES !== 'carpeta-prod') return 'en producción no usó la carpeta productiva';
      if (test.ID_CARPETA_BORRADORES !== 'carpeta-test') return 'en testing no usó la carpeta de testing';
      return null;
    }
  },
  {
    nombre: 'Una property obligatoria ausente falla fuerte y nombra la clave',
    correr: () => {
      const { Config } = configCon({ ENTORNO: 'PRODUCCION', SLACK_WEBHOOK_LOGS_PROD: null });
      try {
        Config.obtenerWebhookLogs();
        return 'debería haber lanzado por la property faltante';
      } catch (e) {
        if (e.message.indexOf('SLACK_WEBHOOK_LOGS_PROD') === -1) return `el error no nombra la clave: ${e.message}`;
        return null;
      }
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
