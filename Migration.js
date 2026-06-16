/**
 * Función temporal para migrar automáticamente las llaves de configuración en PropertiesService.
 * Puedes ejecutar esta función manualmente desde el menú superior de Apps Script (Seleccionar 'migrarPropiedades' y darle a Play).
 * Una vez ejecutada con éxito, puedes borrar este archivo si lo deseas.
 */
function migrarPropiedades() {
  const props = PropertiesService.getScriptProperties();
  
  const oldJira = props.getProperty('JIRA_AUTH_TOKEN_BASE64');
  const oldSlack = props.getProperty('SLACK_WEBHOOK_URL_VM');
  
  if (oldJira) {
    props.setProperty('JIRA_AUTH_TOKEN', oldJira);
    Logger.log('✅ Migrado: JIRA_AUTH_TOKEN');
  } else {
    Logger.log('⚠️ No se encontró JIRA_AUTH_TOKEN_BASE64 viejo.');
  }
  
  if (oldSlack) {
    props.setProperty('SLACK_WEBHOOK_TESTING', oldSlack);
    Logger.log('✅ Migrado: SLACK_WEBHOOK_TESTING (con el webhook viejo)');
  } else {
    Logger.log('⚠️ No se encontró SLACK_WEBHOOK_URL_VM viejo.');
  }
  
  // Seteamos el nuevo Webhook productivo entregado por el usuario
  // IMPORTANTE: Reemplaza 'PEGA_EL_WEBHOOK_AQUI' por tu URL de Slack antes de ejecutar esto
  const nuevoWebhookProd = 'PEGA_EL_WEBHOOK_AQUI';
  if (nuevoWebhookProd !== 'PEGA_EL_WEBHOOK_AQUI') {
    props.setProperty('SLACK_WEBHOOK_PROD', nuevoWebhookProd);
    Logger.log('✅ Creado: SLACK_WEBHOOK_PROD');
  } else {
    Logger.log('⚠️ ERROR: Olvidaste pegar la URL en la constante nuevoWebhookProd');
  }

  Logger.log('Migración completada con éxito.');
}
