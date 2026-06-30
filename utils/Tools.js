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
  }
};
