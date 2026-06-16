/**
 * Configuración central del script
 */
const Config = {
  // Entorno actual (Cambiar a 'TESTING' para desarrollo/pruebas)
  ENVIRONMENT: 'PROD',

  // Configuración de Jira
  JIRA_BASE_URL: "wetcom.atlassian.net",
  JIRA_FILTER_ID: "23855",
  JIRA_POD_FIELD_ID: "customfield_12331", // Extraído al archivo de Configuración
  
  // Nombres de hojas de cálculo
  SHEET_CLIENTES: 'Clientes',
  SHEET_TIPOS_ALARMAS: 'Tipos de Alarmas',

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
