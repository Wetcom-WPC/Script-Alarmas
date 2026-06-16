/**
 * Servicio encargado exclusivamente de parsear texto de alarmas y extraer 
 * metadatos (Origen, Cluster, Target, Nombre y Summary).
 * Aplica expresiones regulares complejas, liberando de esta carga al procesador central.
 */
const AlarmParser = {

  extraerNombreYResumenAlarma: function(summary, mapaAlarmas, warnings) {
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

    let alarmaNombre = "Nombre de alarma no encontrado";
    let summaryResto = cleanSummary;
    let matchFound = false;

    for (let interceptor of interceptors) {
      const match = cleanSummary.match(interceptor.regex);
      if (match) {
        const result = interceptor.action(match);
        alarmaNombre = result.alarmaNombre;
        summaryResto = result.summaryResto;
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
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
      
      for (let regex of patronesEspecificos) {
        const match = cleanSummary.match(regex);
        if (match) {
          alarmaNombre = match[2] || match[1] || alarmaNombre;
          summaryResto = cleanSummary.replace(match[0], '').trim(); 
          summaryResto = summaryResto.replace(/^-\s*/, ''); 
          matchFound = true;
          break;
        }
      }
    }

    if (!matchFound) {
      const matchAlertA = cleanSummary.match(/Alert A\d{4}/i);
      if (matchAlertA) {
        summaryResto = cleanSummary.replace(matchAlertA[0], '').trim();
        alarmaNombre = "Alert A####";
        matchFound = true;
      } else {
        const matchGeneral = cleanSummary.match(/\[(.*?)\]/i);
        if (matchGeneral) {
          summaryResto = cleanSummary.replace(matchGeneral[0], '').trim();
          alarmaNombre = matchGeneral[1];
        }
      }
    }

    // Proceso de cruce con Mapa (Sin reglas hardcodeadas)
    const alarmaNormalizada = alarmaNombre.replace(/'/g, '').toLowerCase().trim();
    
    // Búsqueda en la hoja "Tipos de Alarmas"
    const alarmaEncontrada = Object.keys(mapaAlarmas).find(key =>
      key.replace(/'/g, '').toLowerCase().trim() === alarmaNormalizada
    );
    
    let alarmaProcesada = alarmaEncontrada ? mapaAlarmas[alarmaEncontrada] : `Alarma desconocida [${alarmaNombre}]`;
    
    if (!alarmaEncontrada) {
      warnings.push(`Alarma no encontrada para el summary "${summary}"`);
    }

    return { alarma: alarmaProcesada, summaryResto };
  },

  extraerOrigen: function(description, summary) {
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
  }
};
