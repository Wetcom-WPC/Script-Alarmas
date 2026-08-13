/**
 * Verifica `_esPayloadBorradorValido` (WebApp.js), la validación agregada en el punto 12 de
 * AUDITORIA.md: `doPost` lee un archivo de Drive por ID sin garantía de que sea un borrador
 * generado por esta app, así que antes de usarlo se chequea que tenga la forma esperada.
 *
 * `doGet`/`doPost`/`_generarBorrador` en sí NO se testean acá: dependen de GmailApp,
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

const CASOS = [
  {
    nombre: 'Payload válido (cliente y html como string) pasa',
    correr: () => {
      if (!validar({ cliente: 'Banco Macro', html: '<div>...</div>', pod: 'WPC', alarmaPricipal: 'Alarma X' })) {
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
