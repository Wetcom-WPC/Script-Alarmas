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
  'core/AlarmParser.js',
  'core/AlarmFormatters.js',
  'core/parsers/AlarmEnvelope.js',
  'core/parsers/VropsCategorias.js',
  'core/parsers/VropsStandardParser.js',
  'core/parsers/LegacyVCenterParser.js',
  'core/parsers/AlarmParserRegistry.js',
  'core/AlarmProcessor.js',
  'utils/MessageFormatter.js'
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

module.exports = { crearSandbox, MODULOS };
