/**
 * Verifica `_esPayloadBorradorValido` (WebApp.js), la validación agregada en el punto 12 de
 * AUDITORIA.md: `doPost` lee un archivo de Drive por ID sin garantía de que sea un borrador
 * generado por esta app, así que antes de usarlo se chequea que tenga la forma esperada.
 *
 * De `doGet` se testea el HTML que arma (stubeando HtmlService y ScriptApp). `doPost` y
 * DriveApp, CacheService y HtmlService reales, y mockear las cuatro para un test de
 * integración de bajo valor no vale la complejidad. Queda anotado como pendiente en
 * AUDITORIA.md (punto 16).
 */
const { crearSandbox } = require('./harness');

function validar(payload) {
  const { obtener } = crearSandbox();
  const fn = obtener('_esPayloadBorradorValido');
  if (!fn) throw new Error('No se pudo cargar _esPayloadBorradorValido en el sandbox.');
  return fn(payload);
}

/**
 * Renderiza `doGet` con HtmlService y ScriptApp stubeados.
 *
 * Es el unico pedazo de doGet/doPost que se puede testear barato: arma HTML y no toca
 * Gmail ni Drive. La creacion del borrador (doPost -> _generarBorrador) sigue afuera.
 */
function renderDoGet(borradorId) {
  const { contexto, obtener } = crearSandbox();
  contexto.HtmlService = { createHtmlOutput: (html) => ({ getContent: () => html }) };
  contexto.ScriptApp = {
    getService: () => ({ getUrl: () => 'https://script.google.com/a/macros/wetcom.com/s/DEPLOY/exec' })
  };

  const doGet = obtener('doGet');
  if (!doGet) throw new Error('No se pudo cargar doGet en el sandbox.');
  return doGet({ parameter: { id: borradorId } }).getContent();
}

function alarmaPrincipal(payload) {
  const { obtener } = crearSandbox();
  const fn = obtener('_alarmaPrincipalDe');
  if (!fn) throw new Error('No se pudo cargar _alarmaPrincipalDe en el sandbox.');
  return fn(payload);
}

const CASOS = [
  {
    nombre: 'Payload válido (cliente y html como string) pasa',
    correr: () => {
      if (!validar({ cliente: 'Banco Macro', html: '<div>...</div>', pod: 'WPC', alarmaPrincipal: 'Alarma X' })) {
        return 'un payload con la forma esperada debería ser válido';
      }
      return null;
    }
  },
  {
    nombre: 'null y undefined no son válidos',
    correr: () => {
      if (validar(null)) return 'null no debería ser válido';
      if (validar(undefined)) return 'undefined no debería ser válido';
      return null;
    }
  },
  {
    nombre: 'Un array o un string sueltos no son válidos (no son el objeto esperado)',
    correr: () => {
      if (validar(['no', 'es', 'un', 'payload'])) return 'un array no debería ser válido';
      if (validar('texto suelto')) return 'un string no debería ser válido';
      if (validar(42)) return 'un número no debería ser válido';
      return null;
    }
  },
  {
    nombre: 'Sin "cliente", o con "cliente" vacío/no-string, no es válido',
    correr: () => {
      if (validar({ html: '<div></div>' })) return 'sin cliente no debería ser válido';
      if (validar({ cliente: '', html: '<div></div>' })) return 'cliente vacío no debería ser válido';
      if (validar({ cliente: 123, html: '<div></div>' })) return 'cliente numérico no debería ser válido';
      return null;
    }
  },
  {
    nombre: 'Sin "html", o con "html" no-string, no es válido',
    correr: () => {
      if (validar({ cliente: 'Banco Macro' })) return 'sin html no debería ser válido';
      if (validar({ cliente: 'Banco Macro', html: null })) return 'html null no debería ser válido';
      if (validar({ cliente: 'Banco Macro', html: 42 })) return 'html numérico no debería ser válido';
      return null;
    }
  },
  {
    nombre: 'Un archivo de Drive ajeno (otra forma de JSON) no pasa la validación',
    correr: () => {
      // Simula el escenario del punto 12: el id apunta a CUALQUIER archivo legible del
      // usuario, no necesariamente un borrador generado por esta app.
      if (validar({ algunOtroCampo: 'esto no es un borrador de alarmas' })) {
        return 'un JSON con otra forma no debería colarse como si fuera un borrador válido';
      }
      return null;
    }
  },
  {
    nombre: 'El asunto usa "alarmaPrincipal" cuando el borrador lo trae',
    correr: () => {
      const alarma = alarmaPrincipal({ cliente: 'Petersen', html: '<div></div>', alarmaPrincipal: 'Desconexión de Host' });
      if (alarma !== 'Desconexión de Host') return `se esperaba el nombre de la alarma, llegó "${alarma}"`;
      return null;
    }
  },
  {
    nombre: 'Un borrador viejo (con el typo "alarmaPricipal") sigue dando el nombre real, no "undefined"',
    correr: () => {
      // El enlace de Slack vive 6 horas y lo atiende el deployment publicado del WebApp,
      // que puede ser anterior o posterior al código que escribió el borrador. Cuando el
      // nombre del campo no coincide entre ambos lados, el asunto salía
      // "undefined - WETCOM - Petersen - dd/MM/yyyy".
      const alarma = alarmaPrincipal({ cliente: 'Petersen', html: '<div></div>', alarmaPricipal: 'Desconexión de Host' });
      if (alarma !== 'Desconexión de Host') return `se esperaba el nombre de la alarma, llegó "${alarma}"`;
      return null;
    }
  },
  {
    nombre: 'Sin el campo, o con un valor inservible, cae al texto genérico en vez de "undefined"',
    correr: () => {
      const casos = [
        { cliente: 'Petersen', html: '<div></div>' },
        { cliente: 'Petersen', html: '<div></div>', alarmaPrincipal: '' },
        { cliente: 'Petersen', html: '<div></div>', alarmaPrincipal: '   ' },
        { cliente: 'Petersen', html: '<div></div>', alarmaPrincipal: null },
        { cliente: 'Petersen', html: '<div></div>', alarmaPrincipal: 42 }
      ];

      for (let i = 0; i < casos.length; i++) {
        const alarma = alarmaPrincipal(casos[i]);
        if (alarma !== 'Incidentes Varios') {
          return `el caso #${i + 1} debería caer al texto genérico, llegó "${alarma}"`;
        }
      }
      return null;
    }
  },
  {
    nombre: '"alarmaPrincipal" le gana al alias viejo cuando están los dos',
    correr: () => {
      const alarma = alarmaPrincipal({
        cliente: 'Petersen',
        html: '<div></div>',
        alarmaPrincipal: 'Nombre nuevo',
        alarmaPricipal: 'Nombre viejo'
      });
      if (alarma !== 'Nombre nuevo') return `se esperaba "Nombre nuevo", llegó "${alarma}"`;
      return null;
    }
  },
  {
    nombre: 'doGet: el form que se autoenvia apunta a _top (si no, la respuesta no se puede mostrar)',
    correr: () => {
      // Apps Script sirve este HTML dentro de un iframe anidado embebido en la pagina
      // /exec. Sin target, el form navega ESE iframe hacia /exec, que se niega a ser
      // embebida: el borrador se crea igual, pero el usuario ve "refused to connect".
      const html = renderDoGet('1Ru2A8ACFkvE8hiHSQnMuisFTcWh30Io_');
      if (html.indexOf('<form') === -1) return 'doGet deberia devolver el form que reenvia el id';
      if (html.indexOf('target="_top"') === -1) {
        return 'el form no apunta a _top: la confirmacion va a fallar con "refused to connect"';
      }
      return null;
    }
  },
  {
    nombre: 'doGet: reenvia el id como POST y no genera nada por si mismo',
    correr: () => {
      // Un GET tiene que ser seguro de repetir: un prefetch del navegador o una recarga no
      // deberian generar un borrador de mas. La creacion vive en doPost.
      const html = renderDoGet('ABC123');
      if (html.indexOf('method="post"') === -1) return 'el form deberia reenviarse como POST';
      if (html.indexOf('name="id"') === -1) return 'el form deberia llevar el id';
      if (html.indexOf('ABC123') === -1) return 'el form deberia llevar el id recibido';
      return null;
    }
  },
  {
    nombre: 'doGet: sin id devuelve el aviso de enlace invalido, sin form',
    correr: () => {
      const html = renderDoGet(undefined);
      if (html.indexOf('Enlace Inv') === -1) return 'deberia avisar que el enlace es invalido';
      if (html.indexOf('<form') !== -1) return 'no deberia intentar reenviar nada sin id';
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
