/**
 * WebApp HTTP Listener para Generación Interactiva de Borradores de Correo
 */

function doGet(e) {
  try {
    const draftId = e.parameter.id;
    
    if (!draftId) {
      return HtmlService.createHtmlOutput('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h2 style="color: #d9534f;">⚠️ Enlace Inválido</h2><p>Falta el identificador de la alarma.</p></div>');
    }

    const dataGuardada = CacheService.getScriptCache().get(`draft_${draftId}`);
    if (!dataGuardada) {
      return HtmlService.createHtmlOutput('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h2 style="color: #d9534f;">⚠️ Código expirado o procesado</h2><p>Este borrador ya caducó (pasaron más de 6 horas) o no existe.</p></div>');
    }
    
    const info = JSON.parse(dataGuardada);
    
    // Obtener destinatarios desde DataRepository
    const repositorios = DataRepository.getMappings();
    const mapaCorreos = repositorios.mapaCorreos || {};
    const dest = mapaCorreos[info.cliente] || ""; 
    
    const tz = Session.getScriptTimeZone() || "America/Argentina/Buenos_Aires";
    const fechaAsunto = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
    
    // El asunto contendrá la alarma principal y el nombre del cliente
    const subject = `${info.alarmaPricipal} - WETCOM - ${info.cliente} - ${fechaAsunto}`;
    
    // Armar el cuerpo corporativo
    const cuerpoFinal = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 800px; text-align: left;">
        <p style="font-size: 15px; margin-bottom: 20px;">Estimados, ¿cómo están? Me comunico para informarles que recibimos las siguientes alarmas en su entorno:</p>
        
        ${info.html}
        
        <p style="font-size: 15px; margin-top: 20px; margin-bottom: 10px;">Ante esto les consulto: ¿Están al tanto de las anomalías? ¿Desean que generemos un ticket para analizar el incidente en profundidad?</p>
        <p style="font-size: 15px; margin-top: 0; margin-bottom: 20px;">Aguardamos sus comentarios.</p>
        
        <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px; margin-bottom: 15px;">
        <p style="font-size: 12px; color: #666; margin-top: 0;">Saludos cordiales,<br><b>Wetcom Proactive Center</b></p>
      </div>`;

    GmailApp.createDraft(dest, subject, "Por favor, active HTML para ver el formato corporativo.", {
      htmlBody: cuerpoFinal,
      name: "Soporte Wetcom" 
    });

    return HtmlService.createHtmlOutput(`
      <div style="font-family: 'Segoe UI', Tahoma, sans-serif; text-align: center; margin-top: 60px; padding: 20px;">
        <h1 style="color: #008a3b; font-size: 28px;">✅ Borrador Listo</h1>
        <p style="font-size: 16px; color: #444;">El borrador para <b>${info.cliente}</b> ya está en tu Gmail.</p>
        <p style="font-size: 14px; background-color: #f1f3f4; padding: 15px; border-radius: 8px; display: inline-block;">
          👉 Ve a la carpeta <b>Borradores</b> de tu Gmail. Los destinatarios preconfigurados fueron cargados.
        </p>
        <br><br><p style="color: #888; font-size: 12px;">Ya puedes cerrar esta pestaña y volver a Slack.</p>
      </div>
    `);

  } catch (err) { 
    return HtmlService.createHtmlOutput(`<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h2 style="color: #d9534f;">❌ Ocurrió un error crítico:</h2><p>${err.message}</p></div>`); 
  }
}
