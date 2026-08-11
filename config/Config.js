/**
 * Configuración central del script
 */
const Config = {
  // Entorno actual ('TESTING' para desarrollo/pruebas y 'PROD' para producción)
  ENTORNO: 'TESTING',

  // Configuración de Jira
  JIRA_BASE_URL: "wetcom.atlassian.net",
  JIRA_FILTER_ID: "23855",
  JIRA_POD_FIELD_ID: "customfield_12331", // Extraído al archivo de Configuración
  
  // Nombres de hojas de cálculo
  SHEET_CLIENTES: 'Clientes',
  SHEET_TIPOS_ALARMAS: 'Tipos de Alarmas',
  SHEET_CORREOS_CLIENTES: 'Correos Clientes',
  SHEET_CORREOS_PODS: 'Correos Guardias',
  SHEET_EXCEPCIONES: 'Excepciones',

  // Correo por defecto si un POD no tiene configuración asignada
  EMAIL_FALLBACK: "wpc@wetcom.com",

  // Lista de nombres de alarma que se descartan automáticamente por diseño
  ALARMAS_IGNORADAS_POR_DEFECTO: ['Alarma de vROps', 'Alarma de vRO'],

  // Texto con el que se dan de alta en "Tipos de Alarmas" las filas todavía sin traducir.
  // Se compara por PREFIJO, así que también cubre variantes numeradas de la planilla
  // ("Configurar en Excel 2", "Configurar en Excel 3", ...). Mientras la columna B
  // empiece con este texto, se muestra el nombre original de la alarma.
  // Ver AlarmParser.resolverNombreAlarma.
  PLACEHOLDER_TIPO_ALARMA: 'Configurar en Excel',

  // Prefijos de "sobre" que el equipo nuevo antepone al ${ALERT_DEFINITION} en el summary
  // (ej: "9x5 - Operations - ", "24x7 Wetcom - ").
  //
  // Los grupos de captura son parte del contrato con AlarmEnvelope:
  //   grupo 1 = cobertura contratada (9x5 / 24x7)   → se muestra como rótulo en Slack
  //   grupo 2 = origen emisor (vCenter / Operations / Wetcom)
  //
  // El prefijo NO se usa para rutear parsers: el ruteo va por la estructura de la
  // description (ver AlarmParserRegistry), para que un cambio de prefijo no rompa nada.
  PREFIJOS_SOBRE_ALARMA: [
    /^\s*(9x5|24x7)\s*-?\s*(vCenter|Operations|Wetcom)\s*-\s*/i
  ],

  // Mostrar la cobertura (9x5 / 24x7) como rótulo encima de cada alarma.
  // Apagado: el mensaje del NOC no lo lleva. Ponelo en true si alguna vez se quiere ver.
  // Ojo: esto controla SÓLO el texto. La separación en bloques por cobertura se mantiene
  // igual, porque es lo que evita que una misma alarma recibida bajo dos contratos
  // distintos se mezcle en un único ítem.
  MOSTRAR_ROTULO_COBERTURA: false,

  // Orden de preferencia cuando la MISMA alarma sobre el MISMO objeto llega por más de una
  // cobertura (las dos reglas de automatización disparan sobre el mismo evento). Se informa
  // una sola vez, la de la cobertura que aparezca primero en esta lista.
  // Las alarmas del formato histórico no traen cobertura y nunca se deduplican.
  PRIORIDAD_COBERTURA: ['9x5', '24x7'],

  // Alarmas cuyo título ya es suficientemente explícito y no necesitan que se publique
  // la descripción de vROps (suele ser un párrafo genérico y largo).
  // Se puede escribir tanto el nombre traducido de la planilla como el original en inglés.
  ALARMAS_SIN_DESCRIPCION: [
    'Alarma de desconexión de host',
    'Host has lost connection to vCenter Server'
  ],

  // Cerrar en Jira las alarmas que el motor de Excepciones silencia.
  // Silenciar siempre significó "no publicarla en el resumen del POD"; con esto además
  // se transiciona el ticket, para que no quede abierto sin dueño.
  // Ponelo en false para volver al comportamiento anterior (silenciar sin tocar Jira).
  // OJO: aplica en TESTING y en PROD por igual, porque el Jira es el mismo en los dos.
  CERRAR_ALARMAS_SILENCIADAS: true,

  // Cómo ubicar la transición de cierre dentro del workflow de Jira.
  // Se busca primero por el nombre de la transición y, si no aparece, por el nombre del
  // estado destino. Tener las dos vías evita que un rename en el workflow rompa el cierre
  // en silencio. Ver JiraService._elegirTransicionDeCierre.
  JIRA_TRANSICION_CIERRE: {
    nombre: 'Cerrar Alarma',
    estadoDestino: 'Cerrada'
  },

  // Comentario que se deja en el ticket al cerrarlo, para que quede trazable quién lo cerró
  // y por qué. `{motivo}` se reemplaza por el detalle de la excepción que lo silenció.
  // Si el comentario falla, el cierre igual se da por bueno.
  JIRA_COMENTARIO_CIERRE: 'Cerrada automáticamente por la automatización de alarmas (Apps Script).\n{motivo}',

  // ID de la carpeta en Google Drive donde se guardarán los borradores (.json)
  get ID_CARPETA_BORRADORES() {
    if (this.ENTORNO === 'TESTING') {
      return this.getPropiedad("CARPETA_BORRADORES_TESTING");
    }
    return this.getPropiedad("CARPETA_BORRADORES_PROD");
  },

  // Configuración de WebApp para Generador de Borradores
  // IMPORTANTE: Deberás reemplazar este valor tras hacer la publicación web.
  URL_WEB_APP: "https://script.google.com/a/macros/wetcom.com/s/AKfycbw-ZHuJoFYN4hhOB-GJPwegSIjsbh5VURmTyFTc5_zOKG1WUIQE-IdxIyuMXRZNYYY/exec",

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

  obtenerWebhookSlack: function() {
    if (this.ENTORNO === 'TESTING') {
      return this.getPropiedad("SLACK_WEBHOOK_TESTING");
    }
    return this.getPropiedad("SLACK_WEBHOOK_PROD");
  },

  get SLACK_WEBHOOK_LOGS() {
    return this.getPropiedad('SLACK_WEBHOOK_LOGS');
  },

  get SLACK_WEBHOOK_GUARDIA() {
    return this.getPropiedad('SLACK_WEBHOOK_GUARDIA');
  },

  obtenerTokenJira: function() {
    return this.getPropiedad("JIRA_AUTH_TOKEN");
  }
};
