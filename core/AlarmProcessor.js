/**
 * Lógica de negocio principal para procesar e interpretar las alarmas
 */
const AlarmProcessor = {
  
  procesarAlarmas: function(issues, mappings) {
    const errores = [];
    const mensajesProcesados = {};
    const alarmasSilenciadas = [];

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

        let { alarma: alarmaProcesada, summaryResto } = AlarmParser.extraerNombreYResumenAlarma(issue.summary, mappings.mapaAlarmas, warnings);
        
        let origen = AlarmParser.extraerOrigen(issue.description, issue.summary);
        if (origen.target === 'Target no encontrado') {
          warnings.push(`Target no encontrado en la descripción/summary "${issue.summary}"`);
          origen.target = 'Target Desconocido';
        }

        const formato = this._formatearAlarmaPorTipo(alarmaProcesada, summaryResto, origen.target, issue.description);
        if (!formato.incluir) return; // Si debe excluirse (Ej. Falso positivo) no hace nada
        
        origen.target = formato.nuevoTarget;
        origen.targetLabel = formato.targetLabel;
        summaryResto = formato.nuevoSummary;

        // Filtrado por reglas de Excepciones dinámicas
        const excepcion = this._verificarExcepcion(pod, cliente, origen.target, issue.summary, mappings.reglasExcepcion);
        if (excepcion.matcheada) {
          alarmasSilenciadas.push(excepcion.log);
          return; // La alarma cae dentro de una ventana de mantenimiento o excepción, se omite.
        }

        this._agruparMensaje(pod, cliente, alarmaProcesada, JSON.stringify(origen), issue.created, mensajesProcesados, warnings, summaryResto);

      } catch (err) {
        // index + 2 por retrocompatibilidad con logs antiguos basados en row (fila de excel)
        const filaLog = index + 2;
        errores.push(`Ticket ${issue.key} (Equiv. Fila ${filaLog}): ${err.message}`);
        Logger.log(`Error procesando ticket ${issue.key}: ${err.message}`);
      }
    });

    return { mensajesProcesados, errores, alarmasSilenciadas };
  },

  _obtenerClaveCliente: function(key, mapaClientes) {
    const codigoCliente = key.split('-')[0];
    return mapaClientes[codigoCliente] || `No encontrado (${codigoCliente})`;
  },

  _formatearAlarmaPorTipo: function(tipoAlarma, summaryResto, target, description) {
    const alarmasExcluir = Config.ALARMAS_IGNORADAS_POR_DEFECTO || [];
    
    // Si el tipo de alarma coincide exacto con los estáticos, o si en cualquier parte contiene "falso positivo"
    if (alarmasExcluir.includes(tipoAlarma) || tipoAlarma.toLowerCase().includes('falso positivo')) {
      return { incluir: false };
    }

    let resultado;
    // Implementación de Patrón Strategy: Busca el formateador, si no existe devuelve por defecto.
    if (AlarmFormatters.handlers[tipoAlarma]) {
      resultado = AlarmFormatters.handlers[tipoAlarma](summaryResto, target, description);
    } else {
      resultado = { incluir: true, nuevoTarget: target, nuevoSummary: summaryResto };
    }

    if (resultado.incluir && !resultado.targetLabel && resultado.nuevoTarget) {
      const lowerTarget = resultado.nuevoTarget.toLowerCase();
      if (lowerTarget.startsWith('esx') || lowerTarget.includes('host')) {
        resultado.targetLabel = 'Host';
      } else if (lowerTarget.startsWith('cl-') || lowerTarget.includes('cluster')) {
        resultado.targetLabel = 'Cluster';
      } else if (lowerTarget.startsWith('ds-') || lowerTarget.includes('datastore')) {
        resultado.targetLabel = 'Datastore';
      } else {
        resultado.targetLabel = 'Recurso Afectado';
      }
    }

    return resultado;
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
  },

  _verificarExcepcion: function(pod, cliente, target, summary, reglas) {
    if (!reglas || reglas.length === 0) return { matcheada: false };
    
    const podStr = pod.toString().toUpperCase().replace(/\s+/g, '');
    const clienteStr = cliente.toString().toUpperCase().trim();
    const textoAAnalizar = `${target} ${summary}`.toLowerCase();

    for (let i = 0; i < reglas.length; i++) {
      const regla = reglas[i];
      const aplicaPod = (regla.pod === "GENERAL" || podStr.includes(regla.pod) || regla.pod.includes(podStr));
      const aplicaCliente = (regla.cliente === "GENERAL" || clienteStr === regla.cliente);
      
      if (aplicaPod && aplicaCliente) {
        if (textoAAnalizar.includes(regla.palabraClave)) {
          return {
            matcheada: true,
            log: `Alarma omitida para *${cliente}* en POD ${pod}.\n*Target / Summary:* ${target} | ${summary}\n*Palabra Clave Matcheada:* \`${regla.palabraClave}\``
          };
        }
      }
    }
    return { matcheada: false };
  }
};
