/**
 * Se encarga de la presentación de los datos (agrupación y conversión a texto para Slack)
 */
const MessageFormatter = {
  
  generarMensaje: function(mensajesProcesados, errores) {
    let mensaje = this._formatearErrores(errores);

    for (const pod in mensajesProcesados) {
      if (pod === "WPC") {
        mensaje += `\nPOD ${pod}\n\n`;
        mensaje += `@wpc Buenas POD! Les comento que recibimos las siguientes alarmas:\n\n`;
        for (const cliente in mensajesProcesados[pod]) {
          const alarmasCliente = mensajesProcesados[pod][cliente];
          const numAlarmas = Object.keys(alarmasCliente).length;
          let subject = numAlarmas === 1 
            ? `Subject: ${Object.keys(alarmasCliente)[0]} - WETCOM - ${cliente}`
            : `Subject: Múltiples Alarmas - WETCOM - ${cliente}`;
          
          const cuerpo = this._procesarClienteWPC(cliente, alarmasCliente);
          mensaje += subject + "\n\n" + cuerpo + "\n============================================================\n\n";
        }
      } else {
        mensaje += `\nPOD ${pod}\n\n`;
        mensaje += `\n@pod${pod} Buenas POD! Les comento que recibimos las siguientes alarmas:\n\n`;
        for (const cliente in mensajesProcesados[pod]) {
          mensaje += this._procesarCliente(cliente, mensajesProcesados[pod][cliente]);
        }
        mensaje += 'Ante esto, les consulto, ¿están al tanto de la/s anomalía/s? ¿desean que le informemos al cliente?\n\n\n';
        mensaje += '///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////\n\n';
      }
    }

    return mensaje;
  },

  _formatearErrores: function(errores) {
    if (errores.length === 0) return '';
    return 'Errores encontrados:\n' + errores.join('\n') + '\n////////////////////////////////////////////////////////////////////////////////////////////////////////////////////\n';
  },

  _generarDetalleAlarmas: function(alarmas) {
    let detalle = "";
    for (const alarma in alarmas) {
      const targetsEntries = alarmas[alarma];
      const todasLasEntradas = Object.values(targetsEntries).flat();
      const mensajeFecha = this._crearMensajeFecha(todasLasEntradas);

      let targetToSummaries = {};
      for (const target in targetsEntries) {
        let summariesSet = new Set();
        targetsEntries[target].forEach(entry => {
          if (entry.summaryResto !== null && entry.summaryResto !== 'N/A' && typeof entry.summaryResto === 'string') {
            const sumVal = entry.summaryResto.toString().trim();
            if (sumVal !== "") summariesSet.add(sumVal);
          }
        });
        targetToSummaries[target] = Array.from(summariesSet).sort();
      }
      
      let groupBySummaries = {};
      for (const target in targetToSummaries) {
        const summariesArr = targetToSummaries[target];
        const key = JSON.stringify(summariesArr);
        if (!groupBySummaries[key]) groupBySummaries[key] = { targets: [], summaries: summariesArr };
        groupBySummaries[key].targets.push(target);
      }

      detalle += `• ${alarma}. ${mensajeFecha}\n`;

      const groupKeys = Object.keys(groupBySummaries);
      const groupsWithSummary = groupKeys.filter(key => groupBySummaries[key].summaries.length > 0);
      const groupsWithoutSummary = groupKeys.filter(key => groupBySummaries[key].summaries.length === 0);
      const orderedGroupKeys = groupsWithSummary.concat(groupsWithoutSummary);

      orderedGroupKeys.forEach(key => {
        const group = groupBySummaries[key];
        group.targets.forEach(target => {
          detalle += `\t• ${target}\n`;
        });
        if (group.summaries.length > 0) {
          group.summaries.forEach(summary => {
            if (summary.indexOf('\n') !== -1) {
              const lines = summary.split('\n');
              for (let i = 0; i < lines.length; i++) {
                detalle += `\t\t• ${lines[i].trim()}\n`;
              }
            } else {
              detalle += `\t\t• ${summary}\n`;
            }
          });
        }
      });
    }
    return detalle;
  },

  _procesarClienteWPC: function(cliente, alarmas) {
    let cuerpo = "Estimados, ¿cómo están? Me comunico para informarles que recibimos la siguiente alarma:\n\n";
    cuerpo += this._generarDetalleAlarmas(alarmas);
    cuerpo += "\nAnte esto les consulto, ¿están al tanto de las anomalías? ¿Desean que generemos un ticket para analizar la anomalía en profundidad?\n\n";
    cuerpo += "Aguardamos sus comentarios.\nSaludos cordiales.\n";
    return cuerpo;
  },

  _procesarCliente: function(cliente, alarmas) {
    let mensajeCliente = `${cliente}\n`;
    mensajeCliente += this._generarDetalleAlarmas(alarmas);
    return mensajeCliente + "\n";
  },

  _crearMensajeFecha: function(entries) {
    const fechas = entries
      .map(entry => (entry && entry.created) ? new Date(entry.created.setSeconds(0, 0)) : null)
      .filter(date => date !== null && !isNaN(date.getTime()));

    if (fechas.length === 0) return 'Fecha no disponible';

    const fechasOrdenadas = fechas.sort((a, b) => a - b);

    if (fechas.length === 1 || fechasOrdenadas.every(date => date.getTime() === fechasOrdenadas[0].getTime())) {
      const fechaFormateada = this._formatearFecha(fechasOrdenadas[0]);
      return `El día ${fechaFormateada.date} a las ${fechaFormateada.time}.`;
    } else {
      const primeraFecha = this._formatearFecha(fechasOrdenadas[0]);
      const ultimaFecha = this._formatearFecha(fechasOrdenadas[fechasOrdenadas.length - 1]);
      if (primeraFecha.date === ultimaFecha.date) {
        return `El día ${primeraFecha.date} desde las ${primeraFecha.time} hasta las ${ultimaFecha.time}.`;
      } else {
        return `Desde el día ${primeraFecha.date} a las ${primeraFecha.time} hasta el día ${ultimaFecha.date} a las ${ultimaFecha.time}.`;
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
