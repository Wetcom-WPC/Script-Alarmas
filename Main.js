/**
 * Punto de entrada principal (Entrypoint)
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Ejecutar Automatización')
    .addItem('Ejecutar y Enviar a Slack', 'disparadorPrincipal_conAPI')
    .addItem('Ejecutar e Imprimir Local', 'disparadorPrincipal_Local')
    .addToUi();
}

/**
 * Función interna compartida que procesa todo pero no envía a ningún lado
 */
function _obtenerPayloadsFinales() {
  // 1. Busca las alarmas directamente en Jira (Retorna JSON)
  const issues = JiraService.buscarAlarmas();

  if (issues.length === 0) {
    return { exito: false, mensaje: "No se encontraron alarmas a través de la API de Jira." };
  }
  
  // 2. Obtiene diccionarios de mapeo desde las hojas de Google Sheets
  const mappings = DataRepository.getMappings();
  
  // 3. Procesa las alarmas cruzando la información con los mappings
  const { mensajesProcesados, errores } = AlarmProcessor.procesarAlarmas(issues, mappings);
  
  // 4. Formatea el mensaje de Slack usando Block Kit agrupando por PODs, Clientes, etc.
  const payloads = MessageFormatter.generarMensaje(mensajesProcesados, errores);
  
  if (!payloads || payloads.length === 0) {
    return { exito: false, mensaje: "Las alarmas obtenidas fueron filtradas/excluidas (ej: Falsos Positivos). No hay nada nuevo para enviar." };
  }
  
  return { exito: true, payloads: payloads };
}

function disparadorPrincipal_conAPI() {
  try {
    const resultado = _obtenerPayloadsFinales();
    
    if (!resultado.exito) {
      Logger.log(resultado.mensaje);
      return;
    }
    
    // 5. Envía cada payload a Slack
    resultado.payloads.forEach(payload => {
      SlackService.sendNotification(payload);
    });
    Logger.log(`Ejecución finalizada con éxito. Se enviaron ${resultado.payloads.length} mensajes a Slack.`);

  } catch (e) {
    const errorMsg = "Error crítico en el script: " + e.message;
    Logger.log(errorMsg);
  }
}

function disparadorPrincipal_Local() {
  try {
    const resultado = _obtenerPayloadsFinales();
    const ui = SpreadsheetApp.getUi();
    
    if (!resultado.exito) {
      ui.alert("Aviso", resultado.mensaje, ui.ButtonSet.OK);
      return;
    }
    
    // Genera un modal HTML con el JSON para evitar los límites de caracteres del alert nativo
    const jsonStr = JSON.stringify(resultado.payloads, null, 2);
    const htmlContent = `
      <html>
        <body style="font-family: monospace; background-color: #f4f4f4; padding: 10px;">
          <pre style="white-space: pre-wrap; word-wrap: break-word;">${jsonStr}</pre>
        </body>
      </html>
    `;
    const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(800)
      .setHeight(600);
      
    ui.showModalDialog(htmlOutput, `Simulación Local - ${resultado.payloads.length} mensajes Block Kit generados`);
    Logger.log("Ejecución local finalizada. Revisa el log o la pantalla para el JSON resultante.");

  } catch (e) {
    SpreadsheetApp.getUi().alert("Error crítico en el script", e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
