/**
 * Configuración central del script
 */
const Config = {
  // Entorno actual ('TESTING' para desarrollo/pruebas y 'PROD' para producción)
  ENVIRONMENT: 'TESTING',

  // Configuración de Jira
  JIRA_BASE_URL: "wetcom.atlassian.net",
  JIRA_FILTER_ID: "23855",
  JIRA_POD_FIELD_ID: "customfield_12331", // Extraído al archivo de Configuración
  
  // Nombres de hojas de cálculo
  SHEET_CLIENTES: 'Clientes',
  SHEET_TIPOS_ALARMAS: 'Tipos de Alarmas',
  SHEET_CORREOS_CLIENTES: 'Correos Clientes',

  // Configuración de WebApp para Generador de Borradores
  // IMPORTANTE: Deberás reemplazar este valor tras hacer la publicación web.
  WEB_APP_URL: "https://script.google.com/a/macros/wetcom.com/s/AKfycbw-ZHuJoFYN4hhOB-GJPwegSIjsbh5VURmTyFTc5_zOKG1WUIQE-IdxIyuMXRZNYYY/exec",

  /**
   * Obtiene una propiedad de script de forma segura.
   * Si no existe en PropertiesService, lanza un error crítico.
   */
  getPropiedad: function(clave) {
    const props = PropertiesService.getScriptProperties();
    const valor = props.getProperty(clave);
    if (!valor) {
      throw new Error(`Configuración faltante: La clave secreta '${clave}' no se encontró en PropertiesService.`);
    }
    return valor;
  },

  getSlackWebhookUrl: function() {
    if (this.ENVIRONMENT === 'TESTING') {
      return this.getPropiedad("SLACK_WEBHOOK_TESTING");
    }
    return this.getPropiedad("SLACK_WEBHOOK_PROD");
  },

  getJiraAuthToken: function() {
    return this.getPropiedad("JIRA_AUTH_TOKEN");
  }
};
