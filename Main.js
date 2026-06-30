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
      const destino = mappings.mapaCorreosPods[podFormateado] || mappings.mapaCorreosPods[pod] || Config.EMAIL_FALLBACK;
      const tz = Session.getScriptTimeZone() || "America/Argentina/Buenos_Aires";
      const fechaAsunto = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
      const asunto = `🌙 Guardia de Alertas Críticas en Clientes - ${podFormateado} - ${fechaAsunto}`;
      
      // Agregar copia a wpc solo si estamos en PROD
      const copia_cc = (Config.ENTORNO === 'PROD') ? Config.EMAIL_FALLBACK : null;
      EmailService.enviarReporteGuardia(destino, asunto, htmlCorreo, copia_cc);
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

/**
 * Función global (Entrypoint) para limpiar las excepciones vencidas de la planilla.
 * Ideal para ser programada como trigger diario a la madrugada.
 */
function runnerLimpiarExcepcionesVencidas() {
  Tools.limpiarExcepcionesVencidas();
}

/**
 * Trigger simple que se ejecuta automáticamente al editar una celda en Google Sheets.
 * Utilizado para crear menús desplegables dependientes (Dropdowns Dinámicos) en Excepciones.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  
  const range = e.range;
  const sheet = range.getSheet();
  
  // Prevenir ejecución si se pegan o borran múltiples celdas de golpe
  if (range.getNumRows() > 1 || range.getNumColumns() > 1) return;
  
  // Validar hoja Excepciones y columna POD (Columna B / Índice 2)
  if (sheet.getName() === Config.SHEET_EXCEPCIONES && range.getColumn() === 2 && range.getRow() > 1) {
    const row = range.getRow();
    const selectedPod = e.value ? e.value.toString().trim() : "";
    const cellCliente = sheet.getRange(row, 3); // Columna C (Cliente)
    
    // Si la celda POD queda en blanco, limpiamos la celda Cliente
    if (selectedPod === "") {
      cellCliente.clearContent();
      cellCliente.clearDataValidations();
      return;
    }
    
    const clientesSheet = e.source.getSheetByName(Config.SHEET_CLIENTES);
    if (!clientesSheet) return;
    
    const lastRow = clientesSheet.getLastRow();
    if (lastRow < 2) return; // No hay datos de clientes
    
    const data = clientesSheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const listaClientes = ["TODOS"];
    
    data.forEach(fila => {
      const clienteNombre = fila[1]; // Asumiendo Col B
      const clientePod = fila[2];    // Asumiendo Col C
      
      // Si el POD coincide, o si eligieron "TODOS" los PODs, mostramos el cliente
      if (clientePod === selectedPod || selectedPod === "TODOS") {
        if (clienteNombre && clienteNombre !== "") {
          listaClientes.push(clienteNombre);
        }
      }
    });
    
    // Construir e inyectar el dropdown
    const rule = SpreadsheetApp.newDataValidation()
                             .requireValueInList(listaClientes, true)
                             .setAllowInvalid(false)
                             .build();
                             
    cellCliente.setDataValidation(rule);
    
    // Autoseleccionar "TODOS" por defecto para mejor UX
    cellCliente.setValue("TODOS"); 
  }
}
