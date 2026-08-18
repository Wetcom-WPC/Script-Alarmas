/**
 * Verifica las funciones de `DataRepository` que arman los diccionarios desde las hojas de
 * cálculo (`_createMap`, `_crearMapaPods`, `_parseCorreosEntorno`, `_parseExcepciones`).
 * Son puras respecto a Sheets: reciben el array de valores ya leído, así que se testean sin
 * `SpreadsheetApp` (ver AUDITORIA.md, punto 16). `obtenerMapeos` en sí —la que sí llama a
 * `SpreadsheetApp`— queda fuera de este archivo.
 */
const { crearSandbox } = require('./harness');

function conRepo() {
  const { obtener } = crearSandbox();
  const DataRepository = obtener('DataRepository');
  if (!DataRepository) throw new Error('No se pudo cargar DataRepository en el sandbox.');
  return DataRepository;
}

const CASOS = [
  {
    nombre: '_createMap: mapea Col A → Col B, ignora encabezado y filas incompletas',
    correr: () => {
      const repo = conRepo();
      const mapa = repo._createMap([
        ['Código', 'Cliente'],
        ['SBM', 'Banco Macro'],
        ['', 'Fila sin código, se ignora'],
        ['SWAO', '']
      ]);
      if (mapa.SBM !== 'Banco Macro') return `esperaba "Banco Macro", obtuvo ${mapa.SBM}`;
      if ('SWAO' in mapa) return 'una fila con la columna B vacía no debería entrar al mapa';
      if (Object.keys(mapa).length !== 1) return `esperaba 1 sola clave, hubo ${Object.keys(mapa).length}`;
      return null;
    }
  },
  {
    nombre: '_createMap: el mapa no hereda de Object.prototype (hasOwnProperty seguro)',
    correr: () => {
      const repo = conRepo();
      const mapa = repo._createMap([['H', 'H'], ['constructor', 'valor rarísimo']]);
      if (Object.getPrototypeOf(mapa) !== null) return 'debería construirse con Object.create(null)';
      if (mapa.constructor !== 'valor rarísimo') return 'la clave "constructor" debería guardarse como un valor normal';
      return null;
    }
  },
  {
    nombre: '_crearMapaPods: mapea Col A → Col C (código de proyecto → POD)',
    correr: () => {
      const repo = conRepo();
      const mapa = repo._crearMapaPods([
        ['Código', 'Cliente', 'POD'],
        ['WST', 'Cliente X', 'WPC'],
        ['ABC', 'Cliente Y', '']
      ]);
      if (mapa.WST !== 'WPC') return `esperaba WPC, obtuvo ${mapa.WST}`;
      if ('ABC' in mapa) return 'una fila sin POD (columna C vacía) no debería entrar al mapa';
      return null;
    }
  },
  {
    nombre: '_parseCorreosEntorno en TESTING: prioriza la columna C, cae a la B si falta',
    correr: () => {
      const repo = conRepo();
      // Config.esProduccion() da false en este sandbox (PropertiesService no disponible → TESTING).
      const mapa = repo._parseCorreosEntorno([
        ['POD', 'Correo prod', 'Correo testing'],
        ['WPC', 'wpc-prod@wetcom.com', 'wpc-test@wetcom.com'],
        ['5', 'pod5-prod@wetcom.com', '']
      ]);
      if (mapa.WPC !== 'wpc-test@wetcom.com') return `esperaba el correo de testing (columna C), obtuvo ${mapa.WPC}`;
      if (mapa['5'] !== 'pod5-prod@wetcom.com') return `sin columna C debería caer a la B, obtuvo ${mapa['5']}`;
      return null;
    }
  },
  {
    nombre: '_parseExcepciones: aplica los defaults (TODOS/TODAS/CUALQUIERA/Contiene) en columnas vacías',
    correr: () => {
      const repo = conRepo();
      const filas = [
        ['ID', 'Cliente', 'Tipo', 'Campo', 'Condición', 'Valor', 'Fecha hasta', 'Hora hasta'],
        ['EXC-1', '', '', '', '', '', '', '']
      ];
      const reglas = repo._parseExcepciones(filas, 'WPC');
      if (reglas.length !== 1) return `esperaba 1 regla, hubo ${reglas.length}`;
      const r = reglas[0];
      if (r.id !== 'EXC-1') return `id inesperado: ${r.id}`;
      if (r.pod !== 'WPC') return `pod inesperado: ${r.pod}`;
      if (r.cliente !== 'TODOS') return `default de cliente incorrecto: ${r.cliente}`;
      if (r.tipoAlarma !== 'TODAS') return `default de tipoAlarma incorrecto: ${r.tipoAlarma}`;
      if (r.campo !== 'CUALQUIERA') return `default de campo incorrecto: ${r.campo}`;
      if (r.condicion !== 'Contiene') return `default de condición incorrecto: ${r.condicion}`;
      if (r.validaHasta !== null) return 'sin fecha, validaHasta debería ser null';
      return null;
    }
  },
  {
    nombre: '_parseExcepciones: calcula validaHasta delegando en Fechas.interpretarVencimiento',
    correr: () => {
      const repo = conRepo();
      const filas = [
        ['ID', 'Cliente', 'Tipo', 'Campo', 'Condición', 'Valor', 'Fecha hasta', 'Hora hasta'],
        ['EXC-2', 'Banco Macro', 'TODAS', 'CUALQUIERA', 'Contiene', '', new Date('2099-01-01T00:00:00'), '14:30']
      ];
      const r = repo._parseExcepciones(filas, 'WPC')[0];
      if (!r.validaHasta) return 'debería haber calculado una fecha de vencimiento';
      if (r.validaHasta.getHours() !== 14 || r.validaHasta.getMinutes() !== 30) {
        return `esperaba 14:30, obtuvo ${r.validaHasta.getHours()}:${r.validaHasta.getMinutes()}`;
      }
      return null;
    }
  },
  {
    nombre: '_parseExcepciones: descarta filas sin ID y no explota con la planilla vacía',
    correr: () => {
      const repo = conRepo();
      const filas = [
        ['ID', 'Cliente'],
        ['', 'fila fantasma, sin id'],
        ['EXC-3', 'Cliente real']
      ];
      const reglas = repo._parseExcepciones(filas, 'WPC');
      if (reglas.length !== 1) return `esperaba 1 regla (la fila sin id se descarta), hubo ${reglas.length}`;
      if (repo._parseExcepciones([], 'WPC').length !== 0) return 'con array vacío debería devolver []';
      if (repo._parseExcepciones([['ID']], 'WPC').length !== 0) return 'sólo con encabezado debería devolver []';
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
