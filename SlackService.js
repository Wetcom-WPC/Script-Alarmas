/**
 * Servicio para el envío de notificaciones a Slack
 */
const SlackService = {
  
  sendNotification: function(message) {
    const webhookUrl = Config.getSlackWebhookUrl();
    
    if (!webhookUrl || webhookUrl.trim() === "") {
      Logger.log("Webhook de Slack no configurado, saltando envío.");
      return;
    }

    const payload = JSON.stringify({ 
      text: "```\n" + message + "\n```" 
    });
    
    const options = { 
      method: "post", 
      contentType: "application/json", 
      payload: payload, 
      muteHttpExceptions: true 
    };

    try { 
      const response = UrlFetchApp.fetch(webhookUrl, options);
      const statusCode = response.getResponseCode();
      
      if (statusCode < 200 || statusCode >= 300) {
        const errorMsg = `Error HTTP ${statusCode} al enviar a Slack: ${response.getContentText()}`;
        Logger.log(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (e) { 
      Logger.log("Excepción al enviar a Slack: " + e.message); 
    }
  }
};
