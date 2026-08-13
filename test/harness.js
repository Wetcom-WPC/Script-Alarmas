/**
 * Harness de pruebas para correr el código de Google Apps Script bajo Node.
 *
 * Los archivos del proyecto no usan `module.exports` (Apps Script no soporta módulos),
 * así que los cargamos concatenándolos y evaluándolos dentro de un contexto de `vm`
 * con stubs de los globales que provee Apps Script.
 *
 * Regla de oro: acá SOLO se pueden cargar módulos puros (transformación de texto).
 * Si un módulo necesita SpreadsheetApp / UrlFetchApp / DriveApp para parsear, está mal diseñado.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

/**
 * Módulos que participan del pipeline de parseo. El orden acá es irrelevante a propósito:
 * si el código dependiera del orden de carga, rompería también en Apps Script.
 */
const MODULOS = [
  'config/Config.js',
  'utils/Fechas.js',
  'utils/Http.js',
  'core/AlarmParser.js',
  'core/AlarmFormatters.js',
  'core/parsers/AlarmEnvelope.js',
  'core/parsers/VropsCategorias.js',
  'core/parsers/VropsStandardParser.js',
  'core/parsers/LegacyVCenterParser.js',
  'core/parsers/AlarmParserRegistry.js',
  'core/AlarmProcessor.js',
  'utils/MessageFormatter.js',
  // Los métodos de éstos que se testean acá (armado de mapas, validación de payload) no
  // tocan SpreadsheetApp/DriveApp/etc. — sólo las funciones que sí lo hacen quedan afuera
  // de lo que los tests llaman (ver DataRepository.obtenerMapeos, WebApp._generarBorrador).
  'config/DataRepository.js',
  'WebApp.js'
];

function crearSandbox() {
  const logs = [];

  const sandbox = {
    // Stub de Logger de Apps Script
    Logger: { log: (msg) => logs.push(String(msg)) },
    console,
    // Los siguientes existen sólo para que una llamada accidental falle fuerte y claro
    SpreadsheetApp: new Proxy({}, { get() { throw new Error('SpreadsheetApp no debe usarse en la capa de parseo'); } }),
    UrlFetchApp: new Proxy({}, { get() { throw new Error('UrlFetchApp no debe usarse en la capa de parseo'); } }),
    DriveApp: new Proxy({}, { get() { throw new Error('DriveApp no debe usarse en la capa de parseo'); } }),
    PropertiesService: new Proxy({}, { get() { throw new Error('PropertiesService no debe usarse en la capa de parseo'); } })
  };
  sandbox.globalThis = sandbox;

  const contexto = vm.createContext(sandbox);

  MODULOS.forEach(rel => {
    const abs = path.join(RAIZ, rel);
    if (!fs.existsSync(abs)) return; // Permite correr el harness antes de que existan los archivos nuevos
    const codigo = fs.readFileSync(abs, 'utf8');
    try {
      vm.runInContext(codigo, contexto, { filename: rel });
    } catch (e) {
      throw new Error(`Error cargando ${rel}: ${e.message}`);
    }
  });

  /**
   * Las declaraciones `const` de nivel superior no se exponen como propiedades del sandbox
   * (viven en el ámbito léxico global del contexto), así que hay que resolverlas evaluando.
   */
  const obtener = (nombre) => vm.runInContext(`typeof ${nombre} !== 'undefined' ? ${nombre} : undefined`, contexto);

  return { contexto, logs, obtener };
}

/**
 * Sandbox aparte para la capa de servicios (los que sí salen a la red).
 *
 * No se mezcla con `crearSandbox()` a propósito: allá UrlFetchApp está prohibido y esa
 * regla es la que mantiene el parseo testeable. Acá, en cambio, la red es justamente lo
 * que queremos observar, así que se reemplaza por un doble que registra cada llamada y
 * devuelve las respuestas que le indique el test.
 *
 * @param {Function} responder     - recibe (url, options) y devuelve { code, body }.
 * @param {Object}   [propiedades] - Script Properties simuladas. Las claves no declaradas
 *                                   devuelven un valor ficticio; para simular una property
 *                                   ausente hay que declararla explícitamente en null.
 * @param {string[]} [modulosExtra] - Módulos de servicio a cargar además de Config.js.
 *                                    Por defecto JiraService, para no romper a quien ya
 *                                    llamaba a esta función antes de que existiera este parámetro.
 */
function crearSandboxServicios(responder, propiedades, modulosExtra) {
  const logs = [];
  const llamadas = [];
  const props = propiedades || {};

  const sandbox = {
    Logger: { log: (msg) => logs.push(String(msg)) },
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (clave) => (
          Object.prototype.hasOwnProperty.call(props, clave) ? props[clave] : `valor-falso-${clave}`
        )
      })
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        llamadas.push({ url, options });
        const { code, body } = responder(url, options) || {};
        return {
          getResponseCode: () => (code === undefined ? 200 : code),
          getContentText: () => (body === undefined ? '{}' : body)
        };
      }
    },
    SpreadsheetApp: new Proxy({}, { get() { throw new Error('SpreadsheetApp no debe usarse en la capa de servicios'); } }),
    DriveApp: new Proxy({}, { get() { throw new Error('DriveApp no debe usarse en la capa de servicios'); } })
  };
  sandbox.globalThis = sandbox;

  const contexto = vm.createContext(sandbox);

  ['config/Config.js'].concat(modulosExtra || ['utils/Http.js', 'services/JiraService.js']).forEach(rel => {
    const abs = path.join(RAIZ, rel);
    const codigo = fs.readFileSync(abs, 'utf8');
    try {
      vm.runInContext(codigo, contexto, { filename: rel });
    } catch (e) {
      throw new Error(`Error cargando ${rel}: ${e.message}`);
    }
  });

  const obtener = (nombre) => vm.runInContext(`typeof ${nombre} !== 'undefined' ? ${nombre} : undefined`, contexto);

  return { contexto, logs, llamadas, obtener };
}

/** Fabrica una hoja falsa mínima, mutable, al estilo Sheet de Apps Script. */
function hojaFalsa(nombre, filasIniciales) {
  let datos = filasIniciales.map(fila => fila.slice());

  return {
    getName: () => nombre,
    getLastRow: () => datos.length,
    getDataRange: () => ({ getValues: () => datos.map(fila => fila.slice()) }),
    // row/col son 1-based, como en la API real.
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < numRows; i++) {
          const fila = datos[row - 1 + i] || [];
          out.push(fila.slice(col - 1, col - 1 + numCols));
        }
        return out;
      }
    }),
    deleteRow: (row) => { datos.splice(row - 1, 1); },
    /** Sólo para que el test pueda inspeccionar el estado final. No existe en la API real. */
    _filasActuales: () => datos.map(fila => fila.slice())
  };
}

/**
 * Sandbox para código que lee/escribe la planilla (SpreadsheetApp), como
 * `Tools.limpiarExcepcionesVencidas` o `DataRepository.obtenerMapeos`.
 *
 * Tampoco se mezcla con los otros dos sandboxes: acá SpreadsheetApp es justamente lo que se
 * quiere ejercitar, así que UrlFetchApp/DriveApp/PropertiesService quedan prohibidos con el
 * mismo criterio que en `crearSandboxServicios`.
 *
 * @param {Array<{nombre: string, filas: Array<Array>}>} hojasDef - una entrada por hoja,
 *        `filas` incluye la fila de encabezado en el índice 0, como llega de la API real.
 * @param {string[]} [modulosExtra] - módulos a cargar además de Config.js.
 */
function crearSandboxHojas(hojasDef, modulosExtra) {
  const logs = [];
  const hojas = hojasDef.map(h => hojaFalsa(h.nombre, h.filas));

  const spreadsheetFalso = {
    getSheets: () => hojas,
    getSheetByName: (nombre) => hojas.find(h => h.getName() === nombre) || null
  };

  const sandbox = {
    Logger: { log: (msg) => logs.push(String(msg)) },
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheetFalso },
    UrlFetchApp: new Proxy({}, { get() { throw new Error('UrlFetchApp no debe usarse en este sandbox'); } }),
    DriveApp: new Proxy({}, { get() { throw new Error('DriveApp no debe usarse en este sandbox'); } }),
    PropertiesService: new Proxy({}, { get() { throw new Error('PropertiesService no debe usarse en este sandbox'); } })
  };
  sandbox.globalThis = sandbox;

  const contexto = vm.createContext(sandbox);

  ['config/Config.js'].concat(modulosExtra || ['utils/Fechas.js', 'utils/Http.js', 'config/DataRepository.js', 'utils/Tools.js']).forEach(rel => {
    const abs = path.join(RAIZ, rel);
    const codigo = fs.readFileSync(abs, 'utf8');
    try {
      vm.runInContext(codigo, contexto, { filename: rel });
    } catch (e) {
      throw new Error(`Error cargando ${rel}: ${e.message}`);
    }
  });

  const obtener = (nombre) => vm.runInContext(`typeof ${nombre} !== 'undefined' ? ${nombre} : undefined`, contexto);

  return { contexto, logs, hojas, obtener };
}

module.exports = { crearSandbox, crearSandboxServicios, crearSandboxHojas, MODULOS };
