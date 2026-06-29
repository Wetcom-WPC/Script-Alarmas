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
  }
};
