/**
 * Servicio para conectar e interactuar con la API de Jira
 */
const JiraService = {
  
  /**
   * Obtiene las alarmas desde Jira y devuelve un array de objetos JSON.
   */
  buscarAlarmas: function() {
    const url = `https://${Config.JIRA_BASE_URL}/rest/api/3/search/jql`;

    const headers = {
      "Accept": "application/json",
      "Authorization": `Basic ${Config.obtenerTokenJira()}`,
      "Content-Type": "application/json"
    };

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
   * Cierra un ticket de Jira (transición "Cerrar Alarma") cuando una alarma fue silenciada
   * automáticamente por una regla de Excepción. Si el ticket no tiene esa transición disponible
   * (ej. ya está cerrado, o el workflow del proyecto no la tiene), no hace nada.
   */
  cerrarAlarma: function(ticketKey, excepcionId) {
    const headers = {
      "Accept": "application/json",
      "Authorization": `Basic ${Config.obtenerTokenJira()}`,
      "Content-Type": "application/json"
    };

    const transicion = this._buscarTransicionCierre(ticketKey, headers);
    if (!transicion) {
      Logger.log(`No se encontró la transición de cierre para ${ticketKey}, se omite el cierre automático.`);
      return;
    }

    const url = `https://${Config.JIRA_BASE_URL}/rest/api/3/issue/${ticketKey}/transitions`;
    const payload = {
      "transition": { "id": transicion.id },
      "update": {
        "worklog": [{
          "add": {
            "timeSpent": "0m",
            "comment": this._construirComentarioADF(`Cerrado automáticamente por Excepción ${excepcionId || 'N/A'}`)
          }
        }]
      }
    };

    const options = {
      "method": "post",
      "headers": headers,
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode < 200 || responseCode >= 300) {
      throw new Error(`Jira devolvió un error ${responseCode} al cerrar ${ticketKey}. Respuesta: ${response.getContentText()}`);
    }
  },

  /**
   * Busca, entre las transiciones disponibles del ticket, la que cierra la alarma.
   * Prioriza el nombre configurado (Config.JIRA_TRANSITION_CERRAR_ALARMA) y, si no matchea,
   * cae a buscar cualquier transición cuyo estado destino sea "Cerrada".
   */
  _buscarTransicionCierre: function(ticketKey, headers) {
    const url = `https://${Config.JIRA_BASE_URL}/rest/api/3/issue/${ticketKey}/transitions`;
    const options = {
      "method": "get",
      "headers": headers,
      "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      throw new Error(`Jira devolvió un error ${responseCode} al buscar transiciones de ${ticketKey}. Respuesta: ${response.getContentText()}`);
    }

    const transitions = JSON.parse(response.getContentText()).transitions || [];
    const nombreBuscado = (Config.JIRA_TRANSITION_CERRAR_ALARMA || '').toLowerCase();

    return transitions.find(t => t.name.toLowerCase() === nombreBuscado)
        || transitions.find(t => t.to && t.to.name === 'Cerrada')
        || null;
  },

  /**
   * Construye un comentario en formato Atlassian Document Format (ADF) a partir de texto plano.
   */
  _construirComentarioADF: function(texto) {
    return {
      "type": "doc",
      "version": 1,
      "content": [{
        "type": "paragraph",
        "content": [{ "type": "text", "text": texto }]
      }]
    };
  }
};
