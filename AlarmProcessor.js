/**
 * Lógica de negocio principal para procesar e interpretar las alarmas
 */
const AlarmProcessor = {
  
  procesarAlarmas: function(issues, mappings) {
    const errores = [];
    const mensajesProcesados = {};

    issues.forEach((issue, index) => {
      const warnings = [];
      try {
        if (!issue.key) throw new Error(`Clave faltante`);
        if (!issue.created || isNaN(issue.created.getTime())) throw new Error(`Fecha inválida o faltante`);

        let cliente = this._obtenerClaveCliente(issue.key, mappings.mapaClientes);
        if (cliente.includes('No encontrado')) {
          warnings.push(`Cliente no encontrado para la clave "${issue.key}"`);
          cliente = 'Cliente Desconocido';
        }

        let pod = issue.pod;
        if (!pod || pod === 'POD Desconocido') {
          warnings.push(`POD no encontrado para el ticket "${issue.key}" en el custom field de Jira`);
          pod = 'POD Desconocido';
        }

        let { alarma: alarmaProcesada, summaryResto } = this._extraerDatosAlarma(issue.summary, mappings.mapaAlarmas, warnings);
        
        let origen = this._extraerOrigen(issue.description, issue.summary);
        if (origen.target === 'Target no encontrado') {
          warnings.push(`Target no encontrado en la descripción/summary "${issue.summary}"`);
          origen.target = 'Target Desconocido';
        }

        const formato = this._formatearAlarmaPorTipo(alarmaProcesada, summaryResto, origen.target, issue.description);
        if (!formato.incluir) return; // Si debe excluirse (Ej. Falso positivo) no hace nada
        
        origen.target = formato.nuevoTarget;
        summaryResto = formato.nuevoSummary;

        this._agruparMensaje(pod, cliente, alarmaProcesada, JSON.stringify(origen), issue.created, mensajesProcesados, warnings, summaryResto);

      } catch (err) {
        // index + 2 por retrocompatibilidad con logs antiguos basados en row (fila de excel)
        const filaLog = index + 2;
        errores.push(`Ticket ${issue.key} (Equiv. Fila ${filaLog}): ${err.message}`);
        Logger.log(`Error procesando ticket ${issue.key}: ${err.message}`);
      }
    });

    return { mensajesProcesados, errores };
  },

  _obtenerClaveCliente: function(key, mapaClientes) {
    const codigoCliente = key.split('-')[0];
    return mapaClientes[codigoCliente] || `No encontrado (${codigoCliente})`;
  },

  _extraerDatosAlarma: function(summary, mapaAlarmas, warnings) {
    const { alarmaNombre, summaryResto } = this._extraerNombreYResumenAlarma(summary);
    const alarmaNormalizada = alarmaNombre.replace(/'/g, '').toLowerCase().trim();
    
    let alarmaProcesada;

    // REGLAS HARDCODEADAS (Mantenidas por retrocompatibilidad)
    if (alarmaNormalizada.includes('vsan')) {
      alarmaProcesada = 'Alarma de vSAN';
    } else if (alarmaNormalizada.includes('hardware sensor status')) {
      alarmaProcesada = 'Alarma de sensor de Hardware';
    } else {
      // Búsqueda en la hoja "Tipos de Alarmas"
      const alarmaEncontrada = Object.keys(mapaAlarmas).find(key =>
        key.replace(/'/g, '').toLowerCase().trim() === alarmaNormalizada
      );
      
      alarmaProcesada = alarmaEncontrada ? mapaAlarmas[alarmaEncontrada] : `Alarma desconocida [${alarmaNombre}]`;
      
      if (!alarmaEncontrada) {
        warnings.push(`Alarma no encontrada para el summary "${summary}"`);
      }
    }

    return { alarma: alarmaProcesada, summaryResto };
  },

  _extraerNombreYResumenAlarma: function(summary) {
    let cleanSummary = summary ? summary.toString().trim() : '';

    // FIX ROBUSTO: Normaliza los prefijos extraños sin importar si están al inicio exacto o tienen espacios invisibles previos.
    cleanSummary = cleanSummary.replace(/\[\[?alarm\]?\s*([^\]]+)\]/i, '[alarm.$1]');

    const interceptors = [
      {
        regex: /(Lost path redundancy to storage device|Path redundancy to storage device|Lost connectivity to storage device)\s+(naa\..*)/i,
        action: (match) => {
          const alarmaNombre = match[1].trim(); 
          let summaryResto = "";
          if (alarmaNombre.toLowerCase().includes('path redundancy')) {
            summaryResto = "storage device " + match[2];
          } else {
            summaryResto = match[1] + " " + match[2];
          }
          return { alarmaNombre, summaryResto };
        }
      },
      {
        regex: /(Host\s+.*?\s+is not responding)/i,
        action: (match) => ({ alarmaNombre: "Host is not responding", summaryResto: match[1] })
      },
      {
        regex: /(Lost connection to server)\s+(.*)/i,
        action: (match) => ({ alarmaNombre: "Lost connection to server", summaryResto: match[1] + " " + match[2] })
      },
      {
        regex: /(vSphere HA initiated a failover action)\s+(.*)/i,
        action: (match) => ({ alarmaNombre: "vSphere HA initiated a failover action", summaryResto: match[2].trim() })
      },
      {
        regex: /(vSAN Health Test)\s+(.*)/i,
        action: (match) => ({ alarmaNombre: "vSAN Health Test", summaryResto: match[2].trim() })
      },
      {
        regex: /(Insufficient resources to satisfy vSphere HA failover level)\s*(.*)/i,
        action: (match) => ({ alarmaNombre: "Insufficient resources to satisfy vSphere HA failover level", summaryResto: match[2].trim() })
      },
      {
        regex: /(Hardware Sensor Status.*)/i,
        action: (match) => ({ alarmaNombre: "Hardware Sensor Status", summaryResto: match[1].trim() })
      }
    ];

    for (let interceptor of interceptors) {
      const match = cleanSummary.match(interceptor.regex);
      if (match) return interceptor.action(match);
    }

    const patronesEspecificos = [
      /.*?Alarm\s+'?(.*?)'?\s+on/i, 
      /^(?:[^\s]+\s+-\s+)(.*?)(?:\s+on\s+[^.]*)?(?:\.|$)/i,
      /\[alarm\.StorageConnectivityAlarm\] .*?(Lost connection|Path redundancy)(?: to|)/i, 
      /\[VMware vCenter - Alarm alarm\.(\S+)\]/i,
      /\[(.+?)\] Alarm '(.*?)' on/i,
      /\[?alarm\.([^\]\s]+)\]?/i, 
      /\[Failed\] (\S+)/i,
      /Alert Email Digest: (\S+)/i
    ];
    
    let alarmaNombre = "Nombre de alarma no encontrado";
    let summaryResto = cleanSummary;

    for (let regex of patronesEspecificos) {
      const match = cleanSummary.match(regex);
      if (match) {
        alarmaNombre = match[2] || match[1] || alarmaNombre;
        summaryResto = cleanSummary.replace(match[0], '').trim(); 
        summaryResto = summaryResto.replace(/^-\s*/, ''); 
        return { alarmaNombre, summaryResto };
      }
    }

    const matchAlertA = cleanSummary.match(/Alert A\d{4}/i);
    if (matchAlertA) {
      summaryResto = cleanSummary.replace(matchAlertA[0], '').trim();
      return { alarmaNombre: "Alert A####", summaryResto };
    }

    const matchGeneral = cleanSummary.match(/\[(.*?)\]/i);
    if (matchGeneral) {
      summaryResto = cleanSummary.replace(matchGeneral[0], '').trim();
      return { alarmaNombre: matchGeneral[1], summaryResto };
    }

    return { alarmaNombre, summaryResto };
  },

  _extraerOrigen: function(description, summary) {
    const origen = { vCenter: 'Desconocido', cluster: 'Desconocido', target: 'Target no encontrado' };

    const vCenterMatch = description.match(/vCenter\s*:?\s*(.*?)(?=\n|$)/i);
    if (vCenterMatch && vCenterMatch[1].trim() !== '') {
      origen.vCenter = vCenterMatch[1].trim();
    }

    const clusterMatch = description.match(/Cluster Name\s*:?\s*(.*?)(?=\n|$)/i);
    if (clusterMatch && clusterMatch[1].trim() !== '') {
      origen.cluster = clusterMatch[1].trim();
    }

    const targetMatch = description.match(/Target:?\s*(.*?)(?=\s*Previous Status|\n|$)/i);
    if (targetMatch && targetMatch[1].trim() !== '') {
      origen.target = targetMatch[1].trim();
    } else if (summary) {
      const summaryMatch = summary.match(/^(.*?)\s+-\s+(?:vSAN|vSphere|Host|Alarm|\[|Lost|Path|Insufficient|Hardware)/i);
      if (summaryMatch) origen.target = summaryMatch[1].trim();
      else {
        const fallbackMatch = summary.match(/^(.+?)\s+-/i);
        if (fallbackMatch) origen.target = fallbackMatch[1].trim();
      }
    }
    
    return origen;
  },

  _formatearAlarmaPorTipo: function(tipoAlarma, summaryResto, target, description) {
    const alarmasExcluir = ['Alarma de vROps', 'Alarma de vRO'];
    
    // Si el tipo de alarma coincide exacto con los estáticos, o si en cualquier parte contiene "falso positivo"
    if (alarmasExcluir.includes(tipoAlarma) || tipoAlarma.toLowerCase().includes('falso positivo')) {
      return { incluir: false };
    }

    // Implementación de Patrón Strategy: Busca el formateador, si no existe devuelve por defecto.
    if (AlarmFormatters.handlers[tipoAlarma]) {
      return AlarmFormatters.handlers[tipoAlarma](summaryResto, target, description);
    }

    return { incluir: true, nuevoTarget: target, nuevoSummary: summaryResto };
  },

  _agruparMensaje: function(pod, cliente, alarma, target, created, mensajesProcesados, warnings, summaryResto) {
    if (!mensajesProcesados[pod]) mensajesProcesados[pod] = {};
    if (!mensajesProcesados[pod][cliente]) mensajesProcesados[pod][cliente] = {};
    if (!mensajesProcesados[pod][cliente][alarma]) mensajesProcesados[pod][cliente][alarma] = {};
    if (!mensajesProcesados[pod][cliente][alarma][target]) mensajesProcesados[pod][cliente][alarma][target] = [];
    
    mensajesProcesados[pod][cliente][alarma][target].push({
      created,
      warnings: warnings.length > 0 ? warnings.join(', ') : null,
      summaryResto
    });
  }
};
