/**
 * Se encarga de la presentación de los datos (agrupación y conversión a texto para Slack)
 * Utiliza Markdown avanzado para mantener estética Premium sin Emojis.
 */
const MessageFormatter = {
  
  generarMensaje: function(mensajesProcesados, errores) {
    let mensaje = this._formatearErrores(errores);

    for (const pod in mensajesProcesados) {
      mensaje += `*POD ${pod}*\n`;
      mensaje += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      
      if (pod === "WPC") {
        mensaje += `@wpc Buenas POD! Les comento que recibimos las siguientes alarmas:\n\n`;
      } else {
        mensaje += `@pod${pod} Buenas POD! Les comento que recibimos las siguientes alarmas:\n\n`;
      }

      for (const cliente in mensajesProcesados[pod]) {
        mensaje += `*${cliente}*\n\n`;
        const alarmasCliente = mensajesProcesados[pod][cliente];
        mensaje += this._generarDetalleAlarmas(alarmasCliente);
        
        // --- INYECCIÓN DEL ENLACE DE BORRADOR ---
        if (Config.WEB_APP_URL && Config.WEB_APP_URL.startsWith("http")) {
          try {
            const htmlBorrador = this._generarDetalleAlarmasHTML(alarmasCliente);
            const draftId = Utilities.getUuid();
            const draftPayload = {
              cliente: cliente,
              pod: pod,
              alarmaPricipal: Object.keys(alarmasCliente)[0] || "Incidentes Varios",
              html: htmlBorrador
            };
            CacheService.getScriptCache().put(`draft_${draftId}`, JSON.stringify(draftPayload), 21600); // 6 horas
            mensaje += `\n📩 <${Config.WEB_APP_URL}?id=${draftId}|Generar correo para este cliente>\n\n\n`;
          } catch(e) {
            // Failsafe: si falla la caché, simplemente no imprimimos el botón, pero no rompemos el proceso principal
            mensaje += `\n\n`;
          }
        }
      }

      if (pod === "WPC") {
        mensaje += `Ante esto les consulto, ¿están al tanto de las anomalías? ¿Desean que generemos un ticket para analizar la anomalía en profundidad?\n`;
        mensaje += `Aguardamos sus comentarios.\nSaludos cordiales.\n\n\n\n`;
      } else {
        mensaje += `Ante esto, les consulto, ¿están al tanto de la/s anomalía/s? ¿desean que le informemos al cliente?\n\n\n\n`;
      }
    }

    return mensaje.trim();
  },

  _formatearErrores: function(errores) {
    if (errores.length === 0) return '';
    return '*Errores encontrados:*\n' + errores.map(e => `• ${e}`).join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  },

  _generarDetalleAlarmas: function(alarmas) {
    let detalle = "";
    for (const alarma in alarmas) {
      const targetsEntries = alarmas[alarma];
      const todasLasEntradas = Object.values(targetsEntries).flat();
      const mensajeFecha = this._crearMensajeFecha(todasLasEntradas);

      detalle += `• *${alarma}* _(${mensajeFecha})_\n`;

      // Agrupar por vCenter + Cluster + Summaries idénticos
      let groupByCombination = {};

      for (const targetStr in targetsEntries) {
        let origen;
        try {
           origen = JSON.parse(targetStr);
        } catch(e) {
           origen = { vCenter: 'Desconocido', cluster: 'Desconocido', target: targetStr };
        }
        
        let summariesSet = new Set();
        targetsEntries[targetStr].forEach(entry => {
          if (entry.summaryResto !== null && entry.summaryResto !== 'N/A' && typeof entry.summaryResto === 'string') {
            const sumVal = entry.summaryResto.toString().trim();
            if (sumVal !== "") summariesSet.add(sumVal);
          }
        });

        const sortedSummaries = Array.from(summariesSet).sort();
        const groupKey = JSON.stringify({
          vCenter: origen.vCenter,
          cluster: origen.cluster,
          targetLabel: origen.targetLabel || 'Host/Target',
          summaries: sortedSummaries
        });

        if (!groupByCombination[groupKey]) {
          groupByCombination[groupKey] = {
            vCenter: origen.vCenter,
            cluster: origen.cluster,
            targetLabel: origen.targetLabel || 'Host/Target',
            summaries: sortedSummaries,
            targets: []
          };
        }

        groupByCombination[groupKey].targets.push(origen.target);
      }

      for (const key in groupByCombination) {
        const group = groupByCombination[key];
        
        if (group.vCenter && !group.vCenter.toLowerCase().includes('desconocido')) {
          detalle += `    • *vCenter:* ${group.vCenter}\n`;
        }
        
        if (group.cluster && !group.cluster.toLowerCase().includes('desconocido') && group.targetLabel !== 'Cluster') {
          detalle += `        • *Cluster:* ${group.cluster}\n`;
        }
        
        group.targets.forEach(targetName => {
          if (targetName && !targetName.toLowerCase().includes('desconocido') && !targetName.toLowerCase().includes('no encontrado')) {
            // Si hay un cluster que no es el target, indentamos el target un nivel más
            if (group.cluster && !group.cluster.toLowerCase().includes('desconocido') && group.targetLabel !== 'Cluster') {
              detalle += `            • *${group.targetLabel}:* ${targetName}\n`;
            } else {
              detalle += `        • *${group.targetLabel}:* ${targetName}\n`;
            }
          }
        });
        
        if (group.summaries.length > 0) {
          const indentSummaries = (group.cluster && !group.cluster.toLowerCase().includes('desconocido') && group.targetLabel !== 'Cluster') ? '                ' : '            ';
          group.summaries.forEach(summary => {
            if (summary.indexOf('\n') !== -1) {
              const lines = summary.split('\n');
              for (let i = 0; i < lines.length; i++) {
                detalle += `${indentSummaries}• _${lines[i].trim()}_\n`;
              }
            } else {
              detalle += `${indentSummaries}• _${summary}_\n`;
            }
          });
        }
      }
      detalle += `\n`;
    }
    return detalle;
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
  },

  _generarDetalleAlarmasHTML: function(alarmas) {
    let detalleHTML = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; border-left: 5px solid #00875a; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-top: 15px; margin-bottom: 25px; padding: 15px 20px; background-color: #fcfcfc;">
      <h2 style="color: #00875a; font-size: 18px; margin-top: 0; margin-bottom: 20px;">Incidentes Registrados</h2>
    `;
    
    for (const alarma in alarmas) {
      const targetsEntries = alarmas[alarma];

      let groupByCombination = {};

      for (const targetStr in targetsEntries) {
        let origen;
        try {
           origen = JSON.parse(targetStr);
        } catch(e) {
           origen = { vCenter: 'Desconocido', cluster: 'Desconocido', target: targetStr };
        }
        
        let summariesSet = new Set();
        targetsEntries[targetStr].forEach(entry => {
          if (entry.summaryResto !== null && entry.summaryResto !== 'N/A' && typeof entry.summaryResto === 'string') {
            const sumVal = entry.summaryResto.toString().trim();
            if (sumVal !== "") summariesSet.add(sumVal);
          }
        });

        const sortedSummaries = Array.from(summariesSet).sort();
        const groupKey = JSON.stringify({
          vCenter: origen.vCenter,
          cluster: origen.cluster,
          targetLabel: origen.targetLabel || 'Host/Target',
          summaries: sortedSummaries
        });

        if (!groupByCombination[groupKey]) {
          groupByCombination[groupKey] = {
            vCenter: origen.vCenter,
            cluster: origen.cluster,
            targetLabel: origen.targetLabel || 'Host/Target',
            summaries: sortedSummaries,
            targets: [],
            entries: []
          };
        }

        groupByCombination[groupKey].targets.push(origen.target);
        groupByCombination[groupKey].entries.push(...targetsEntries[targetStr]);
      }

      for (const key in groupByCombination) {
        const group = groupByCombination[key];
        const mensajeFecha = this._crearMensajeFecha(group.entries);
        
        const targetsText = group.targets.filter(t => t && !t.toLowerCase().includes('desconocido') && !t.toLowerCase().includes('no encontrado')).join('<br>') || 'N/A';
        
        let vcenterHtml = '';
        if (group.vCenter && !group.vCenter.toLowerCase().includes('desconocido')) {
          vcenterHtml += `
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 12px 15px; font-weight: bold; color: #555; background-color: #f9f9f9; text-transform: uppercase;">VCENTER</td>
              <td style="padding: 12px 15px; color: #666; line-height: 1.5;">${group.vCenter}</td>
            </tr>
          `;
        }

        let clusterHtml = '';
        if (group.cluster && !group.cluster.toLowerCase().includes('desconocido') && group.targetLabel !== 'Cluster') {
          clusterHtml += `
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 12px 15px; font-weight: bold; color: #555; background-color: #f9f9f9; text-transform: uppercase;">CLUSTER</td>
              <td style="padding: 12px 15px; color: #666; line-height: 1.5;">${group.cluster}</td>
            </tr>
          `;
        }
        
        let summariesHTML = '<ul style="margin: 0; padding-left: 20px; color: #666;">';
        if (group.summaries.length > 0) {
          group.summaries.forEach(summary => {
            if (summary.indexOf('\n') !== -1) {
              const lines = summary.split('\n');
              for (let i = 0; i < lines.length; i++) {
                summariesHTML += `<li>${lines[i].trim()}</li>`;
              }
            } else {
              summariesHTML += `<li>${summary}</li>`;
            }
          });
        } else {
          summariesHTML += `<li>Sin detalles adicionales</li>`;
        }
        summariesHTML += '</ul>';

        detalleHTML += `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; border: 1px solid #e0e0e0; background-color: #fff;">
          <tbody>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 12px 15px; width: 20%; font-weight: bold; color: #555; background-color: #f0f7f4; text-transform: uppercase;">ALARMA</td>
              <td style="padding: 12px 15px; width: 80%; color: #222;"><b>${alarma}</b></td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 12px 15px; font-weight: bold; color: #555; background-color: #f9f9f9; text-transform: uppercase;">FECHA</td>
              <td style="padding: 12px 15px; color: #666;">${mensajeFecha.replace('El día ', '').replace('Desde el día ', 'Desde el ')}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 12px 15px; font-weight: bold; color: #555; background-color: #f9f9f9; text-transform: uppercase;">${group.targetLabel.toUpperCase()}</td>
              <td style="padding: 12px 15px; color: #444; font-family: 'Courier New', Courier, monospace; font-size: 14px;">${targetsText}</td>
            </tr>
            ${vcenterHtml}
            ${clusterHtml}
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; color: #555; background-color: #f9f9f9; text-transform: uppercase; vertical-align: top;">DETALLE</td>
              <td style="padding: 12px 15px; vertical-align: top;">${summariesHTML}</td>
            </tr>
          </tbody>
        </table>
        `;
      }
    }
    
    detalleHTML += `
    </div>
    `;
    
    return detalleHTML;
  }
};
