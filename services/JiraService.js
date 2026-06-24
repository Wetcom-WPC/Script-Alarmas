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
  }
};
