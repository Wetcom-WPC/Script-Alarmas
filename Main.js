/**
 * Punto de entrada principal (Entrypoint)
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Automatización de Alarmas')
    .addItem('Ejecutar y Enviar a Slack', 'disparadorPrincipal_conAPI')
    .addItem('Ejecutar e Imprimir Local', 'disparadorPrincipal_Local')
    .addSeparator()
    .addItem('▶️ Activar Ejecución Automática (Cada 5 min)', 'instalarTriggerAutomatico')
    .addItem('⏹️ Desactivar Ejecución Automática', 'desinstalarTriggerAutomatico')
    .addToUi();
}

/**
 * Función interna compartida que procesa todo pero no envía a ningún lado
 */
function _obtenerMensajeFinal() {
  // 1. Busca las alarmas directamente en Jira (Retorna JSON)
  const issues = JiraService.buscarAlarmas();

  if (issues.length === 0) {
    return { exito: false, mensaje: "No se encontraron alarmas a través de la API de Jira." };
  }
  
  // 2. Obtiene diccionarios de mapeo desde las hojas de Google Sheets
  const mappings = DataRepository.getMappings();
  
  // 3. Procesa las alarmas cruzando la información con los mappings
  const { mensajesProcesados, errores } = AlarmProcessor.procesarAlarmas(issues, mappings);
  
  // 4. Formatea el mensaje de Slack agrupando por PODs, Clientes, etc.
  const mensajeFinal = MessageFormatter.generarMensaje(mensajesProcesados, errores);
  
  if (!mensajeFinal || mensajeFinal.trim() === "") {
    return { exito: false, mensaje: "Las alarmas obtenidas fueron filtradas/excluidas (ej: Falsos Positivos). No hay nada nuevo para enviar." };
  }
  
  return { exito: true, mensaje: mensajeFinal };
}

function disparadorPrincipal_conAPI() {
  try {
    const resultado = _obtenerMensajeFinal();
    
    if (!resultado.exito) {
      Logger.log(resultado.mensaje);
      return;
    }
    
    // 5. Envía el resultado a Slack
    SlackService.sendNotification(resultado.mensaje);
    Logger.log("Ejecución finalizada con éxito. Mensaje generado:\n" + resultado.mensaje);

  } catch (e) {
    const errorMsg = "Error crítico en el script: " + e.message;
    Logger.log(errorMsg);
    throw new Error(errorMsg);
  }
}

function disparadorPrincipal_Local() {
  try {
    const resultado = _obtenerMensajeFinal();
    const ui = SpreadsheetApp.getUi();
    
    if (!resultado.exito) {
      ui.alert("Aviso", resultado.mensaje, ui.ButtonSet.OK);
      return;
    }
    
    // Muestra el mensaje en un popup en lugar de Slack
    ui.alert("Simulación de Ejecución (Local)", resultado.mensaje, ui.ButtonSet.OK);
    Logger.log("Ejecución local finalizada. Mensaje:\n" + resultado.mensaje);

  } catch (e) {
    SpreadsheetApp.getUi().alert("Error crítico en el script", e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Instala un trigger para que el script se ejecute automáticamente cada 5 minutos.
 */
function instalarTriggerAutomatico() {
  const ui = SpreadsheetApp.getUi();
  try {
    // Primero limpiamos cualquier trigger anterior para evitar duplicados
    desinstalarTriggerAutomatico(true);
    
    ScriptApp.newTrigger('disparadorPrincipal_conAPI')
      .timeBased()
      .everyMinutes(5)
      .create();
      
    ui.alert("✅ Éxito", "El trigger automático se ha instalado correctamente.\nA partir de ahora, el script revisará Jira y enviará a Slack cada 5 minutos de forma automática en el fondo (incluso si cierras esta pestaña).", ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Error", "No se pudo instalar el trigger: " + e.message, ui.ButtonSet.OK);
  }
}

/**
 * Desinstala el trigger automático si existe.
 * @param {boolean} silencioso - Si es true, no muestra alertas UI (usado internamente por el instalador).
 */
function desinstalarTriggerAutomatico(silencioso = false) {
  const triggers = ScriptApp.getProjectTriggers();
  let eliminado = false;
  
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'disparadorPrincipal_conAPI') {
      ScriptApp.deleteTrigger(triggers[i]);
      eliminado = true;
    }
  }
  
  if (!silencioso) {
    const ui = SpreadsheetApp.getUi();
    if (eliminado) {
      ui.alert("⏹️ Desactivado", "Se ha desactivado la ejecución automática. El script ya no correrá cada 5 minutos.", ui.ButtonSet.OK);
    } else {
      ui.alert("Aviso", "No se encontró ningún trigger activo para desactivar.", ui.ButtonSet.OK);
    }
  }
}
