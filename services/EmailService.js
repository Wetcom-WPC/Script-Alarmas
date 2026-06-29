/**
 * Servicio encargado de gestionar el envío de correos electrónicos.
 */
const EmailService = {
  /**
   * Envía el reporte de guardia por correo electrónico.
   * @param {string} destino - Correo electrónico de destino (del POD o fallback).
   * @param {string} asunto - Asunto del correo.
   * @param {string} htmlCuerpo - Cuerpo del mensaje en formato HTML.
   */
  enviarReporteGuardia: function(destino, asunto, htmlCuerpo) {
    try {
      MailApp.sendEmail({
        to: destino,
        subject: asunto,
        htmlBody: htmlCuerpo,
        name: "Guardia Ops Wetcom"
      });
      Logger.log(`Correo de guardia enviado a ${destino}`);
    } catch (error) {
      Logger.log(`Error al enviar correo de guardia a ${destino}: ${error.message}`);
    }
  }
};
