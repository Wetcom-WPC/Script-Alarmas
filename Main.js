/**
 * Punto de entrada principal (Entrypoint)
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Ejecutar Automatización')
    .addItem('Ejecutar y Enviar a Slack', 'disparadorPrincipal_conAPI')
    .addItem('Ejecutar e Imprimir Local', 'disparadorPrincipal_Local')
    .addItem('Ejecutar Guardia de Alarmas', 'disparadorGuardia')
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
  const mappings = DataRepository.obtenerMapeos();
  
  // 3. Procesa las alarmas cruzando la información con los mappings
  const { mensajesProcesados, errores, alarmasSilenciadas } = AlarmProcessor.procesarAlarmas(issues, mappings);
  
  // 4. Formatea el mensaje de Slack agrupando por PODs, Clientes, etc.
  const mensajeFinal = MessageFormatter.generarMensaje(mensajesProcesados, errores);
  
  if (!mensajeFinal || mensajeFinal.trim() === "") {
    return { exito: false, mensaje: "Las alarmas obtenidas fueron filtradas/excluidas (ej: Falsos Positivos). No hay nada nuevo para enviar.", alarmasSilenciadas };
  }
  
  return { exito: true, mensaje: mensajeFinal, alarmasSilenciadas, mensajesProcesados, mappings };
}

function disparadorPrincipal_conAPI() {
  try {
    const resultado = _obtenerMensajeFinal();
    
    // Enviar logs de excepciones independientemente del exito del mensaje principal
    if (resultado.alarmasSilenciadas && resultado.alarmasSilenciadas.length > 0) {
      resultado.alarmasSilenciadas.forEach(log => {
        try {
          SlackService.enviarLogExcepcion(log);
        } catch(e) {
          Logger.log("Error enviando log de excepción: " + e.message);
        }
      });
    }

    if (!resultado.exito) {
      Logger.log(resultado.mensaje);
      return;
    }
    
    // 5. Envía el resultado a Slack
    SlackService.enviarNotificacion(resultado.mensaje);
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
    
    if (resultado.alarmasSilenciadas && resultado.alarmasSilenciadas.length > 0) {
      Logger.log("--- ALARMAS SILENCIADAS ---");
      resultado.alarmasSilenciadas.forEach(log => Logger.log(log));
    }

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
 * Entrypoint exclusivo para el Trigger de Guardia Nocturna/Fines de semana.
 */
function disparadorGuardia() {
  try {
    const resultado = _obtenerMensajeFinal();
    
    if (resultado.alarmasSilenciadas && resultado.alarmasSilenciadas.length > 0) {
      resultado.alarmasSilenciadas.forEach(log => {
        try { SlackService.enviarLogExcepcion(log); } catch(e) {}
      });
    }

    if (!resultado.exito) {
      Logger.log("Guardia: " + resultado.mensaje);
      return;
    }
    
    // Enviar a Slack canal de Guardia
    SlackService.enviarNotificacionGuardia(resultado.mensaje);
    Logger.log("Notificación de Guardia enviada a Slack.");

    // Enviar correos por POD
    const { mensajesProcesados, mappings } = resultado;
    
    for (const pod in mensajesProcesados) {
      const alarmasPorCliente = mensajesProcesados[pod];
      const podFormateado = pod === "WPC" ? pod : (pod.toUpperCase().includes('POD') ? pod : `POD ${pod}`);
      
      const htmlCorreo = MessageFormatter.generarCorreoGuardiaHTML(podFormateado, alarmasPorCliente);
      const destino = mappings.mapaCorreosPods[pod] || Config.EMAIL_FALLBACK;
      const tz = Session.getScriptTimeZone() || "America/Argentina/Buenos_Aires";
      const fechaAsunto = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
      const asunto = `🌙 Guardia de Alertas Críticas en Clientes - ${podFormateado} - ${fechaAsunto}`;
      
      // Agregar copia siempre a wpc@wetcom.com (EMAIL_FALLBACK)
      EmailService.enviarReporteGuardia(destino, asunto, htmlCorreo, Config.EMAIL_FALLBACK);
    }
    
    Logger.log("Ejecución de Guardia finalizada con éxito.");
  } catch (e) {
    const errorMsg = "Error crítico en disparador de Guardia: " + e.message;
    Logger.log(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Función global (Entrypoint) para invocar la limpieza programada de borradores desde los Triggers de Apps Script.
 */
function runnerLimpiarBorradoresViejos() {
  Tools.limpiarBorradoresViejos();
}
