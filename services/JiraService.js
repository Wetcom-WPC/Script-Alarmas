/**
 * Servicio para conectar e interactuar con la API de Jira
 */
const JiraService = {

  /**
   * Encabezados comunes a todas las llamadas a la API de Jira.
   */
  _encabezados: function() {
    return {
      "Accept": "application/json",
      "Authorization": `Basic ${Config.obtenerTokenJira()}`,
      "Content-Type": "application/json"
    };
  },

  /**
   * Obtiene las alarmas desde Jira y devuelve un array de objetos JSON.
   */
  buscarAlarmas: function() {
    const url = `https://${Config.JIRA_BASE_URL}/rest/api/3/search/jql`;

    const headers = this._encabezados();

    const payload = {
      "jql": `filter = ${Config.JIRA_FILTER_ID}`,
      "fields": ["key", "summary", "description", "created", Config.JIRA_POD_FIELD_ID],
      "maxResults": 100
    };

    const options = {
      "method": "post",
      "headers": headers,
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    const jsonResponse = JSON.parse(responseText);

    if (responseCode !== 200) {
      throw new Error(`Jira devolvió un error ${responseCode}. Respuesta: ${responseText}`);
    }

    if (!jsonResponse.issues) {
      return [];
    }

    // Retorna la data mapeada a un objeto estructurado para mejor legibilidad en el código
    return jsonResponse.issues.map(issue => {
      let description = '';
      if (issue.fields.description && issue.fields.description.content) {
        const extractText = (node) => {
          if (node.type === 'text') return node.text || '';
          if (node.content && Array.isArray(node.content)) {
            let joiner = (node.type === 'paragraph' || node.type === 'listItem') ? '\n' : ' ';
            return node.content.map(extractText).join(joiner);
          }
          return '';
        };
        description = extractText(issue.fields.description);
      }
      
      const podField = issue.fields[Config.JIRA_POD_FIELD_ID];

      return {
        key: issue.key,
        summary: issue.fields.summary || "N/A",
        description: description,
        created: issue.fields.created ? new Date(issue.fields.created) : null,
        pod: (podField && podField.value)
              ? podField.value.replace(/^POD-?\s*/i, '').trim()
              : 'POD Desconocido'
      };
    });
  },

  /**
   * Lista las transiciones que el workflow ofrece para un ticket, en su estado actual.
   *
   * Se consulta por ticket y no se cachea a propósito: cada proyecto (SBM, SBDER, ...) puede
   * tener su propio workflow, y el volumen de alarmas silenciadas por corrida es bajo.
   * Un ticket ya cerrado sencillamente no ofrece la transición de cierre.
   */
  obtenerTransiciones: function(ticketKey) {
    const url = `https://${Config.JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(ticketKey)}/transitions`;

    const response = UrlFetchApp.fetch(url, {
      "method": "get",
      "headers": this._encabezados(),
      "muteHttpExceptions": true
    });

    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode !== 200) {
      throw new Error(`Jira devolvió ${responseCode} al listar las transiciones de ${ticketKey}. Respuesta: ${responseText}`);
    }

    return JSON.parse(responseText).transitions || [];
  },

  /**
   * Elige, entre las transiciones disponibles, la que cierra la alarma.
   *
   * Función pura (no toca la red) para poder testearla contra payloads reales de Jira.
   * Devuelve null si ninguna sirve, que es el caso normal cuando el ticket ya está cerrado.
   */
  _elegirTransicionDeCierre: function(transiciones) {
    const objetivo = Config.JIRA_TRANSICION_CIERRE || {};
    const lista = transiciones || [];
    const norm = (t) => (t || '').toString().trim().toLowerCase();

    const coincideNombre = (t) => !!objetivo.nombre && norm(t.name) === norm(objetivo.nombre);
    const coincideEstado = (t) => !!objetivo.estadoDestino && t.to && norm(t.to.name) === norm(objetivo.estadoDestino);

    // El match ideal es el doble: la transición se llama como esperamos Y deja el ticket
    // en el estado esperado. Los dos siguientes cubren que renombren una cosa o la otra.
    return lista.filter(t => coincideNombre(t) && coincideEstado(t))[0]
        || lista.filter(coincideNombre)[0]
        || lista.filter(coincideEstado)[0]
        || null;
  },

  /**
   * Cierra un ticket y le deja un comentario con el motivo.
   *
   * Nunca lanza por un rechazo de Jira: devuelve `{ cerrado, detalle }` para que quien
   * llame decida qué informar. Cerrar es un extra sobre el silenciado, no puede tumbar
   * el envío del resumen a Slack.
   */
  cerrarTicket: function(ticketKey, motivo) {
    if (!ticketKey) return { cerrado: false, detalle: 'el ticket no tiene key' };

    let transiciones;
    try {
      transiciones = this.obtenerTransiciones(ticketKey);
    } catch (e) {
      return { cerrado: false, detalle: e.message };
    }

    const transicion = this._elegirTransicionDeCierre(transiciones);
    if (!transicion) {
      const disponibles = transiciones.map(t => `${t.name} → ${(t.to && t.to.name) || '?'}`).join(', ') || 'ninguna';
      return { cerrado: false, detalle: `no hay transición de cierre disponible (¿ya está cerrado?). Ofrecidas: ${disponibles}` };
    }

    const url = `https://${Config.JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(ticketKey)}/transitions`;
    const response = UrlFetchApp.fetch(url, {
      "method": "post",
      "headers": this._encabezados(),
      "payload": JSON.stringify({ transition: { id: transicion.id } }),
      "muteHttpExceptions": true
    });

    const responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      return { cerrado: false, detalle: `Jira devolvió ${responseCode}: ${response.getContentText()}` };
    }

    // El comentario es best-effort: el ticket ya quedó cerrado, que es lo que importa.
    const comentario = this._armarComentarioDeCierre(motivo);
    if (comentario) {
      try {
        this.comentarTicket(ticketKey, comentario);
      } catch (e) {
        Logger.log(`No se pudo comentar ${ticketKey} tras cerrarlo: ${e.message}`);
      }
    }

    return { cerrado: true, detalle: transicion.name };
  },

  /**
   * Arma el texto del comentario a partir de la plantilla de Config.
   * El motivo viene del log de la excepción, que está escrito para Slack: se le quitan
   * los asteriscos de negrita porque en Jira se verían literales.
   */
  _armarComentarioDeCierre: function(motivo) {
    const plantilla = Config.JIRA_COMENTARIO_CIERRE;
    if (!plantilla) return '';
    return plantilla.replace('{motivo}', (motivo || '').toString().replace(/\*/g, ''));
  },

  /**
   * Agrega un comentario en texto plano a un ticket.
   * La API v3 espera el cuerpo en formato ADF, no un string suelto.
   */
  comentarTicket: function(ticketKey, texto) {
    const url = `https://${Config.JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment`;

    const cuerpo = {
      type: 'doc',
      version: 1,
      content: texto.split('\n').map(linea => ({
        type: 'paragraph',
        content: linea ? [{ type: 'text', text: linea }] : []
      }))
    };

    const response = UrlFetchApp.fetch(url, {
      "method": "post",
      "headers": this._encabezados(),
      "payload": JSON.stringify({ body: cuerpo }),
      "muteHttpExceptions": true
    });

    const responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      throw new Error(`Jira devolvió ${responseCode} al comentar ${ticketKey}. Respuesta: ${response.getContentText()}`);
    }
  }
};
