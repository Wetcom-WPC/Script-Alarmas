/**
 * Servicio para el envío de notificaciones a Slack
 */
const SlackService = {
  
  enviarNotificacion: function(message) {
    const webhookUrl = Config.obtenerWebhookSlack();
    
    if (!webhookUrl || webhookUrl.trim() === "") {
      Logger.log("Webhook de Slack no configurado, saltando envío.");
      return;
    }

    const payload = JSON.stringify({ 
      text: message 
    });
    
    const options = { 
      method: "post", 
      contentType: "application/json", 
      payload: payload, 
      muteHttpExceptions: true 
    };

    const response = UrlFetchApp.fetch(webhookUrl, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode < 200 || statusCode >= 300) {
      const errorMsg = `Error HTTP ${statusCode} al enviar a Slack: ${response.getContentText()}`;
      Logger.log(errorMsg);
      throw new Error(errorMsg);
    }
  },

  enviarNotificacionGuardia: function(message) {
    const webhookUrl = Config.SLACK_WEBHOOK_GUARDIA;
    
    if (!webhookUrl || webhookUrl.trim() === "") {
      Logger.log("Webhook de Slack Guardia no configurado, saltando envío.");
      return;
    }

    const payload = JSON.stringify({ 
      text: message 
    });
    
    const options = { 
      method: "post", 
      contentType: "application/json", 
      payload: payload, 
      muteHttpExceptions: true 
    };

    const response = UrlFetchApp.fetch(webhookUrl, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode < 200 || statusCode >= 300) {
      const errorMsg = `Error HTTP ${statusCode} al enviar a Slack Guardia: ${response.getContentText()}`;
      Logger.log(errorMsg);
      throw new Error(errorMsg);
    }
  },

  enviarLogExcepcion: function(mensaje) {
    const webhookURL = Config.getPropiedad("SLACK_WEBHOOK_TESTING");
    if (!webhookURL) {
      Logger.log("Log de excepción omitido (Falta SLACK_WEBHOOK_TESTING): " + mensaje);
      return;
    }
    const payload = JSON.stringify({
      text: `🔇 *Alarma Silenciada*\n_${mensaje}_`
    });
    const options = { 
      method: "post", 
      contentType: "application/json", 
      payload: payload, 
      muteHttpExceptions: true 
    };
    UrlFetchApp.fetch(webhookURL, options);
  }
};
