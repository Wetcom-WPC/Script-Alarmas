/**
 * Repositorio de datos para interactuar con las hojas de cálculo de Google Sheets
 */
const DataRepository = {
  
  obtenerMapeos: function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const sheetClientes = ss.getSheetByName(Config.SHEET_CLIENTES);
    const sheetTiposAlarmas = ss.getSheetByName(Config.SHEET_TIPOS_ALARMAS);
    const sheetCorreosClientes = ss.getSheetByName(Config.SHEET_CORREOS_CLIENTES);
    const sheetCorreosPods = ss.getSheetByName(Config.SHEET_CORREOS_PODS);
    const sheetExcepciones = ss.getSheetByName(Config.SHEET_EXCEPCIONES);

    if (!sheetClientes) throw new Error(`La hoja "${Config.SHEET_CLIENTES}" no está disponible.`);
    if (!sheetTiposAlarmas) throw new Error(`La hoja "${Config.SHEET_TIPOS_ALARMAS}" no está disponible.`);
    
    // Si la hoja no existe, no rompemos el script (puede que estén en plena migración), solo pasamos un array vacío
    const correosData = sheetCorreosClientes ? sheetCorreosClientes.getDataRange().getValues() : [];
    const correosPodsData = sheetCorreosPods ? sheetCorreosPods.getDataRange().getValues() : [];
    const excepcionesData = sheetExcepciones ? sheetExcepciones.getDataRange().getValues() : [];

    return {
      mapaClientes: this._createMap(sheetClientes.getDataRange().getValues()),
      mapaAlarmas: this._createMap(sheetTiposAlarmas.getDataRange().getValues()),
      mapaCorreos: this._parseCorreosEntorno(correosData),
      mapaCorreosPods: this._parseCorreosEntorno(correosPodsData),
      reglasExcepcion: this._parseExcepciones(excepcionesData)
    };
  },

  _createMap: function(dataArray) {
    // Omite la primera fila (encabezados) y mapea Col 1 -> Col 2
    return dataArray.slice(1).reduce((map, row) => {
      if (row[0] && row[1]) {
        map[row[0].toString().trim()] = row[1].toString().trim();
      }
      return map;
    }, {});
  },

  _parseCorreosEntorno: function(dataArray) {
    const isTesting = (Config.ENTORNO === 'TESTING');
    return dataArray.slice(1).reduce((map, row) => {
      const keyName = row[0] ? row[0].toString().trim() : null;
      if (keyName) {
        // En TESTING usa columna C (índice 2), en PROD usa columna B (índice 1)
        const emailValue = isTesting ? (row[2] || row[1]) : row[1];
        if (emailValue) {
          map[keyName] = emailValue.toString().trim();
        }
      }
      return map;
    }, {});
  },

  _parseExcepciones: function(dataArray) {
    if (dataArray.length === 0) return [];
    const reglas = [];
    const ahora = new Date();
    dataArray.slice(1).forEach(row => {
      const podRaw = row[0] ? row[0].toString().trim().toUpperCase() : "GENERAL";
      const clienteRaw = row[1] ? row[1].toString().trim().toUpperCase() : "GENERAL";
      const palabraClave = row[2] ? row[2].toString().trim() : "";
      const caducidad = row[3];

      if (!palabraClave) return;

      let vencido = false;
      if (caducidad && caducidad.toString().toUpperCase() !== "PERMANENTE") {
        const fechaCaducidad = new Date(caducidad);
        if (!isNaN(fechaCaducidad.getTime()) && fechaCaducidad < ahora) {
          vencido = true;
        }
      }

      if (!vencido) {
        reglas.push({
          pod: podRaw,
          cliente: clienteRaw,
          palabraClave: palabraClave.toLowerCase()
        });
      }
    });
    return reglas;
  }
};
