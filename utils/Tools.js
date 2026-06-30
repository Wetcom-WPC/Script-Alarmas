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
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(Config.SHEET_EXCEPCIONES);
      if (!sheet) {
        Logger.log("Hoja de excepciones no encontrada.");
        return;
      }
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;
      
      const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
      const ahora = new Date();
      let eliminadas = 0;
      
      // Recorremos de abajo hacia arriba para que eliminar filas no modifique los índices restantes
      for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        const fechaVal = row[7];
        const horaVal = row[8];
        
        let validaHasta = null;
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
        
        // Si tiene fecha de expiración y ya pasó
        if (validaHasta && validaHasta < ahora) {
          // El índice `i` es 0-based.
          // La data empieza en la fila 2 de Sheets (es decir, i=0 es la fila 2).
          // Por tanto, la fila a borrar es i + 2.
          sheet.deleteRow(i + 2);
          eliminadas++;
        }
      }
      
      Logger.log(`Mantenimiento completado. Se eliminaron ${eliminadas} excepciones caducadas.`);
    } catch(e) {
      Logger.log("Error al limpiar excepciones vencidas: " + e.message);
    }
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

    // 2. Validar Feriados usando la API pública y Cache
    const año = fecha.getFullYear();
    const cache = CacheService.getScriptCache();
    const cacheKey = `feriados_arg_${año}`;
    
    let feriadosData = cache.get(cacheKey);
    
    if (!feriadosData) {
      try {
        const url = `https://api.argentinadatos.com/v1/feriados/${año}`;
        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        
        if (response.getResponseCode() === 200) {
          feriadosData = response.getContentText();
          // Guardar en caché por 6 horas (21600 segundos), máximo de CacheService
          cache.put(cacheKey, feriadosData, 21600);
          Logger.log(`API de feriados consultada y cacheada para el año ${año}.`);
        } else {
          Logger.log(`Error API feriados HTTP ${response.getResponseCode()}`);
          return false; // Fallback: asumir día hábil si la API falla
        }
      } catch (e) {
        Logger.log(`Error de red consultando feriados: ${e.message}`);
        return false;
      }
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
