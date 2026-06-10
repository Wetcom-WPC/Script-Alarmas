/**
 * Se encarga de la presentación de los datos usando Slack Block Kit
 */
const MessageFormatter = {
  
  generarMensaje: function(mensajesProcesados, errores) {
    const payloads = [];

    let bloquesErrores = this._formatearErroresBlockKit(errores);
    if (bloquesErrores.length > 0) {
      payloads.push({
        text: "Errores de Ejecución",
        blocks: bloquesErrores
      });
    }

    for (const pod in mensajesProcesados) {
      let blocks = [];
      
      blocks.push({
        type: "header",
        text: { type: "plain_text", text: `🚨 Alarmas - POD ${pod}`, emoji: true }
      });

      if (pod === "WPC") {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: "@wpc Buenas POD! Les comento que recibimos las siguientes alarmas:" }
        });
      } else {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `@pod${pod} Buenas POD! Les comento que recibimos las siguientes alarmas:` }
        });
      }

      for (const cliente in mensajesProcesados[pod]) {
        blocks.push({ type: "divider" });
        blocks.push({
          type: "header",
          text: { type: "plain_text", text: `🏢 ${cliente}`, emoji: true }
        });

        const alarmasBlocks = this._generarDetalleAlarmasBlockKit(mensajesProcesados[pod][cliente]);
        blocks = blocks.concat(alarmasBlocks);
      }

      blocks.push({ type: "divider" });
      if (pod === "WPC") {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: "Ante esto les consulto, ¿están al tanto de las anomalías? ¿Desean que generemos un ticket para analizar la anomalía en profundidad?\n\nAguardamos sus comentarios.\nSaludos cordiales." }
        });
      } else {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: "Ante esto, les consulto, ¿están al tanto de la/s anomalía/s? ¿desean que le informemos al cliente?" }
        });
      }

      this._chunkBlocksAndPush(payloads, blocks, `Resumen de Alarmas - POD ${pod}`);
    }

    return payloads;
  },

  _formatearErroresBlockKit: function(errores) {
    if (errores.length === 0) return [];
    return [
      {
        type: "header",
        text: { type: "plain_text", text: "⚠️ Errores Encontrados", emoji: true }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: errores.map(e => `• ${e}`).join('\n').substring(0, 3000) }
      },
      { type: "divider" }
    ];
  },

  _chunkBlocksAndPush: function(payloads, blocks, fallbackText) {
    const CHUNK_SIZE = 45; // Slack limit is 50
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      payloads.push({
        text: fallbackText + (i > 0 ? " (Continuación)" : ""),
        blocks: blocks.slice(i, i + CHUNK_SIZE)
      });
    }
  },

  _generarDetalleAlarmasBlockKit: function(alarmas) {
    const blocks = [];
    for (const alarma in alarmas) {
      const targetsEntries = alarmas[alarma];
      const todasLasEntradas = Object.values(targetsEntries).flat();
      const mensajeFecha = this._crearMensajeFecha(todasLasEntradas);

      let targetToSummaries = {};
      for (const target in targetsEntries) {
        let summariesSet = new Set();
        targetsEntries[target].forEach(entry => {
          if (entry.summaryResto !== null && entry.summaryResto !== 'N/A' && typeof entry.summaryResto === 'string') {
            const sumVal = entry.summaryResto.trim();
            if (sumVal !== "") summariesSet.add(sumVal);
          }
        });
        targetToSummaries[target] = Array.from(summariesSet).sort();
      }
      
      let groupBySummaries = {};
      for (const target in targetToSummaries) {
        const key = JSON.stringify(targetToSummaries[target]);
        if (!groupBySummaries[key]) groupBySummaries[key] = { targets: [], summaries: targetToSummaries[target] };
        groupBySummaries[key].targets.push(target);
      }

      const groupKeys = Object.keys(groupBySummaries);
      const orderedGroupKeys = groupKeys.filter(k => groupBySummaries[k].summaries.length > 0)
                                        .concat(groupKeys.filter(k => groupBySummaries[k].summaries.length === 0));

      orderedGroupKeys.forEach(key => {
        const group = groupBySummaries[key];
        
        let textBlocks = `🔴 *${alarma}* _(${mensajeFecha})_\n`;
        
        group.targets.forEach(origenStr => {
          let origen;
          try {
             origen = JSON.parse(origenStr);
          } catch(e) {
             origen = { vCenter: 'Desconocido', cluster: 'Desconocido', target: origenStr };
          }
          
          let snippet = `  ◦ *vCenter:* ${origen.vCenter}\n  ◦ *Cluster:* ${origen.cluster}\n  ◦ *Host/Target:* ${origen.target}\n`;
          
          if ((textBlocks.length + snippet.length) > 2800) {
            blocks.push({ type: "section", text: { type: "mrkdwn", text: textBlocks } });
            textBlocks = `🔴 *${alarma}* _(Continuación)_\n`;
          }
          textBlocks += snippet;
        });

        if (group.summaries.length > 0) {
          group.summaries.forEach(summary => {
            const lines = summary.split('\n');
            lines.forEach(l => {
              let snippet = `      ▪ _${l.trim()}_\n`;
              if ((textBlocks.length + snippet.length) > 2800) {
                 blocks.push({ type: "section", text: { type: "mrkdwn", text: textBlocks } });
                 textBlocks = `🔴 *${alarma}* _(Continuación)_\n`;
              }
              textBlocks += snippet;
            });
          });
        }
        
        if (textBlocks.trim() !== "") {
          blocks.push({ type: "section", text: { type: "mrkdwn", text: textBlocks } });
        }
      });
    }
    return blocks;
  },

  _crearMensajeFecha: function(entries) {
    const fechas = entries
      .map(entry => (entry && entry.created) ? new Date(entry.created.setSeconds(0, 0)) : null)
      .filter(date => date !== null && !isNaN(date.getTime()));

    if (fechas.length === 0) return 'Fecha no disponible';

    const fechasOrdenadas = fechas.sort((a, b) => a - b);

    if (fechas.length === 1 || fechasOrdenadas.every(date => date.getTime() === fechasOrdenadas[0].getTime())) {
      const fechaFormateada = this._formatearFecha(fechasOrdenadas[0]);
      return `El día ${fechaFormateada.date} a las ${fechaFormateada.time}`;
    } else {
      const primeraFecha = this._formatearFecha(fechasOrdenadas[0]);
      const ultimaFecha = this._formatearFecha(fechasOrdenadas[fechasOrdenadas.length - 1]);
      if (primeraFecha.date === ultimaFecha.date) {
        return `El día ${primeraFecha.date} desde las ${primeraFecha.time} hasta las ${ultimaFecha.time}`;
      } else {
        return `Desde el día ${primeraFecha.date} a las ${primeraFecha.time} hasta el día ${ultimaFecha.date} a las ${ultimaFecha.time}`;
      }
    }
  },

  _formatearFecha: function(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return { date: `${day}/${month}/${year}`, time: `${hours}:${minutes}` };
  }
};
