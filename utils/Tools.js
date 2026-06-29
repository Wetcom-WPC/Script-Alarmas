/**
 * Módulo de herramientas y utilidades secundarias
 * para no ensuciar el Main ni los servicios principales.
 */
const Tools = {
  
  /**
   * Crea automáticamente la pestaña de Excepciones si no existe, 
   * configurando las columnas, colores y filas inmovilizadas.
   */
  crearHojaExcepciones: function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Excepciones');
    
    if (!sheet) {
      sheet = ss.insertSheet('Excepciones');
      // Configurar Cabeceras
      const headers = ["POD", "Cliente", "Palabra Clave a Silenciar", "Caducidad (DD/MM/YYYY HH:MM o PERMANENTE)"];
      sheet.getRange("A1:D1").setValues([headers]);
      
      // Estilos
      sheet.getRange("A1:D1").setFontWeight("bold").setBackground("#f0ad4e").setFontColor("white");
      sheet.setFrozenRows(1);
      
      // Ajustar anchos
      sheet.setColumnWidth(1, 100);
      sheet.setColumnWidth(2, 200);
      sheet.setColumnWidth(3, 300);
      sheet.setColumnWidth(4, 300);
      
      Logger.log("Pestaña 'Excepciones' creada con éxito.");
    } else {
      Logger.log("La pestaña 'Excepciones' ya existe.");
    }
  },

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
  }
};

/**
 * Función global requerida por la interfaz de Google Apps Script 
 * para poder ser ejecutada directamente desde el botón "Ejecutar".
 */
function runnerCrearHojaExcepciones() {
  Tools.crearHojaExcepciones();
}
