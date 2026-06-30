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
    if (!dataArray || dataArray.length < 2) return [];
    
    return dataArray.slice(1).map(row => {
      const id = row[0];
      if (!id) return null; // Saltar filas vacías
      
      let validaHasta = null;
      const fechaVal = row[7];
      const horaVal = row[8];
      
      if (fechaVal && fechaVal !== "") {
        let fechaBase = new Date();
        if (fechaVal instanceof Date) {
          fechaBase = new Date(fechaVal.getTime());
        } else {
          const f = new Date(fechaVal);
          if (!isNaN(f.getTime())) fechaBase = f;
        }
        
        if (horaVal && horaVal !== "") {
          if (horaVal instanceof Date) {
            fechaBase.setHours(horaVal.getHours(), horaVal.getMinutes(), 0, 0);
          } else if (typeof horaVal === 'string') {
            const partes = horaVal.split(':');
            if (partes.length >= 2) {
              fechaBase.setHours(parseInt(partes[0], 10), parseInt(partes[1], 10), 0, 0);
            }
          }
        } else {
          fechaBase.setHours(23, 59, 59, 999);
        }
        validaHasta = fechaBase;
      }

      return {
        id: id.toString().trim(),
        pod: row[1] && row[1] !== "" ? row[1].toString().trim() : 'TODOS',
        cliente: row[2] && row[2] !== "" ? row[2].toString().trim() : 'TODOS',
        tipoAlarma: row[3] && row[3] !== "" ? row[3].toString().trim() : 'TODAS',
        campo: row[4] && row[4] !== "" ? row[4].toString().trim() : 'CUALQUIERA',
        condicion: row[5] && row[5] !== "" ? row[5].toString().trim() : 'Contiene',
        valor: row[6] ? row[6].toString().trim() : '',
        validaHasta: validaHasta
      };
    }).filter(r => r !== null);
  }
};
