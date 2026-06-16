/**
 * Módulo de herramientas y utilidades secundarias
 * para no ensuciar el Main ni los servicios principales.
 */
const Tools = {
  
  /**
   * Herramienta temporal para buscar el ID de los Custom Fields en Jira.
   * Descarga un ticket y vuelca todos sus campos ocultos en la planilla "Debug Jira".
   */
  debugCamposJira_Runner: function() {
    try {
      const campos = Tools._debugCamposJiraArray();
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = spreadsheet.getSheetByName("Debug Jira");
      if (!sheet) {
        sheet = spreadsheet.insertSheet("Debug Jira");
      } else {
        sheet.clear();
      }
      
      sheet.appendRow(["Campo Interno", "Valor del Ticket"]);
      campos.forEach(c => sheet.appendRow([c.key, c.value]));
      
      // Auto-resize
      sheet.autoResizeColumn(1);
      sheet.autoResizeColumn(2);
      
      SpreadsheetApp.getUi().alert("¡Listo! Ve a la pestaña 'Debug Jira' y busca qué Campo Interno tiene el valor que buscas.");
    } catch (e) {
      SpreadsheetApp.getUi().alert("Error: " + e.message);
    }
  },

  _debugCamposJiraArray: function() {
    const url = `https://${Config.JIRA_BASE_URL}/rest/api/3/search/jql`;
    const headers = {
      "Accept": "application/json",
      "Authorization": `Basic ${Config.getJiraAuthToken()}`,
      "Content-Type": "application/json"
    };

    // Extraemos 1 ticket con todos los campos
    const payload = {
      "jql": `filter = ${Config.JIRA_FILTER_ID}`,
      "fields": ["*all"],
      "maxResults": 1
    };

    const options = {
      "method": "post",
      "headers": headers,
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);
    const jsonResponse = JSON.parse(response.getContentText());

    if (!jsonResponse.issues || jsonResponse.issues.length === 0) {
      throw new Error("No hay tickets en el filtro para debugear.");
    }

    const issue = jsonResponse.issues[0];
    const campos = [];
    
    for (const field in issue.fields) {
      let value = issue.fields[field];
      // Aplanamos objetos para que sean legibles en la celda
      if (value && typeof value === 'object') {
        try {
          value = JSON.stringify(value);
        } catch (e) {
          value = "Objeto complejo";
        }
      }
      campos.push({ key: field, value: String(value) });
    }
    
    return campos;
  },

  /**
   * Genera programáticamente un trigger para ejecutar el script cada 5 minutos.
   * Ejecutar una única vez desde el editor de Apps Script.
   */
  generarTriggerCada5Minutos: function() {
    // Elimina triggers anteriores si existen
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'disparadorPrincipal_conAPI') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    
    // Crea el nuevo trigger
    ScriptApp.newTrigger('disparadorPrincipal_conAPI')
      .timeBased()
      .everyMinutes(5)
      .create();
      
    Logger.log("✅ Trigger creado exitosamente. El script se ejecutará automáticamente cada 5 minutos.");
  }
};
