/**
 * Módulo de herramientas y utilidades secundarias
 * para no ensuciar el Main ni los servicios principales.
 */
const Tools = {
  
  /**
   * Elimina borradores (.json) en Drive que tengan más de 7 días de antigüedad.
   */
  limpiarBorradoresViejos: function() {
    if (!Config.ID_CARPETA_BORRADORES || Config.ID_CARPETA_BORRADORES.trim() === "") {
      Logger.log("No hay carpeta de borradores configurada en Config.js.");
      return;
    }
    
    try {
      const folder = DriveApp.getFolderById(Config.ID_CARPETA_BORRADORES);
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - 7); // Archivos más antiguos a 7 días
      
      const files = folder.getFiles();
      let eliminados = 0;
      
      while (files.hasNext()) {
        const file = files.next();
        if (file.getDateCreated() < limitDate) {
          file.setTrashed(true);
          eliminados++;
        }
      }
      
      Logger.log(`Limpieza completada. Se enviaron ${eliminados} borradores antiguos a la papelera.`);
    } catch(e) {
      Logger.log("Error al limpiar borradores viejos: " + e.message);
    }
  },

  /**
   * Elimina las filas de la hoja de Excepciones cuya fecha/hora de expiración haya pasado.
   */
  limpiarExcepcionesVencidas: function() {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheets = ss.getSheets();
      let eliminadasTotal = 0;
      
      const ahora = new Date();

      sheets.forEach(sheet => {
        const sheetName = sheet.getName();
        if (sheetName.startsWith("Excepciones ") && sheetName !== "Excepciones") {
          const lastRow = sheet.getLastRow();
          if (lastRow < 2) return; // Continuar con la siguiente hoja
          
          // Data desde fila 2, col 1 hasta col 8 (A hasta H)
          const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
          
          // Recorremos de abajo hacia arriba para que eliminar filas no modifique los índices restantes
          for (let i = data.length - 1; i >= 0; i--) {
            const row = data[i];
            const fechaVal = row[6]; // Índice corregido (Antes 7)
            const horaVal = row[7];  // Índice corregido (Antes 8)
            const validaHasta = this._interpretarVencimiento(fechaVal, horaVal);

            // Si tiene fecha de expiración y ya pasó
            if (validaHasta && validaHasta < ahora) {
              sheet.deleteRow(i + 2);
              eliminadasTotal++;
            }
          }
        }
      });
      
      Logger.log(`Mantenimiento completado. Se eliminaron ${eliminadasTotal} excepciones caducadas en total.`);
    } catch(e) {
      Logger.log("Error al limpiar excepciones vencidas: " + e.message);
    }
  },

  /**
   * Interpreta las columnas "Fecha hasta"/"Hora hasta" de una fila de Excepciones. Devuelve
   * el instante en que la regla deja de tener efecto, o null si no vence nunca. Sin hora
   * explícita, vence al final del día (23:59:59.999).
   *
   * HOTFIX 2026-08-18: si la celda de fecha llega como texto que no se puede parsear (por
   * ejemplo "14/08/2026" guardado como texto plano en vez de fecha real -new Date() lo lee
   * como MM/DD/YYYY inválido-), antes se caía silenciosamente a `new Date()` (hoy) como base,
   * y la regla quedaba vigente para siempre sin importar la fecha real de la planilla
   * (incidente Tempora_Macro / Banco Macro). Ahora se acepta también texto "DD/MM/YYYY" y,
   * si ninguna interpretación resulta en una fecha válida, se trata como YA VENCIDA
   * (fail-closed) en vez de "no vence nunca".
   */
  _interpretarVencimiento: function(fechaVal, horaVal) {
    if (!fechaVal || fechaVal === "") return null;

    const fechaBase = this._parsearFecha(fechaVal);
    if (!fechaBase) return new Date(0);

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

    return fechaBase;
  },

  _parsearFecha: function(fechaVal) {
    if (fechaVal instanceof Date) return new Date(fechaVal.getTime());

    if (typeof fechaVal === 'string') {
      const match = fechaVal.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (match) {
        const dia = parseInt(match[1], 10);
        const mes = parseInt(match[2], 10);
        const anio = parseInt(match[3], 10);
        const candidato = new Date(anio, mes - 1, dia);
        const esValida = candidato.getFullYear() === anio && candidato.getMonth() === mes - 1 && candidato.getDate() === dia;
        return esValida ? candidato : null;
      }
    }

    const generico = new Date(fechaVal);
    return isNaN(generico.getTime()) ? null : generico;
  },

  /**
   * Verifica si la fecha proporcionada (por defecto hoy) es fin de semana o feriado en Argentina.
   */
  esFinDeSemanaOFeriado: function(fecha = new Date()) {
    // 1. Validar Fin de Semana (Sábado = 6, Domingo = 0)
    const dia = fecha.getDay();
    if (dia === 0 || dia === 6) {
      Logger.log("Hoy es fin de semana.");
      return true;
    }

    // 2. Validar Feriados usando la API pública
    const año = fecha.getFullYear();
    let feriadosData = null;
    
    try {
      const url = `https://api.argentinadatos.com/v1/feriados/${año}`;
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      
      if (response.getResponseCode() === 200) {
        feriadosData = response.getContentText();
        Logger.log(`API de feriados consultada para el año ${año}.`);
      } else {
        Logger.log(`Error API feriados HTTP ${response.getResponseCode()}`);
        return false; // Fallback: asumir día hábil si la API falla
      }
    } catch (e) {
      Logger.log(`Error de red consultando feriados: ${e.message}`);
      return false;
    }
    
    try {
      const feriados = JSON.parse(feriadosData);
      
      // Formatear la fecha a YYYY-MM-DD para buscarla en el JSON
      const mes = String(fecha.getMonth() + 1).padStart(2, '0');
      const diaMes = String(fecha.getDate()).padStart(2, '0');
      const fechaBuscada = `${año}-${mes}-${diaMes}`;
      
      const esFeriado = feriados.some(feriado => feriado.fecha === fechaBuscada);
      if (esFeriado) {
        Logger.log(`Hoy (${fechaBuscada}) es Feriado en Argentina.`);
      }
      return esFeriado;
    } catch (e) {
      Logger.log(`Error parseando JSON de feriados: ${e.message}`);
      return false;
    }
  }
};
