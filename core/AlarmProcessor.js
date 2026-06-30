/**
 * Lógica de negocio principal para procesar e interpretar las alarmas
 */
const AlarmProcessor = {
  
  procesarAlarmas: function(tickets, mappings) {
    const errores = [];
    const mensajesProcesados = {};
    const alarmasSilenciadas = [];

    tickets.forEach((ticket, index) => {
      const warnings = [];
      try {
        if (!ticket.key) throw new Error(`Clave faltante`);
        if (!ticket.created || isNaN(ticket.created.getTime())) throw new Error(`Fecha inválida o faltante`);

        let cliente = this._obtenerClaveCliente(ticket.key, mappings.mapaClientes);
        if (cliente.includes('No encontrado')) {
          warnings.push(`Cliente no encontrado para la clave "${ticket.key}"`);
          cliente = 'Cliente Desconocido';
        }

        let pod = ticket.pod;
        if (!pod || pod === 'POD Desconocido') {
          warnings.push(`POD no encontrado para el ticket "${ticket.key}" en el custom field de Jira`);
          pod = 'POD Desconocido';
        }

        let { alarma: alarmaProcesada, summaryResto } = AlarmParser.extraerNombreYResumenAlarma(ticket.summary, mappings.mapaAlarmas, warnings);
        
        let origen = AlarmParser.extraerOrigen(ticket.description, ticket.summary);
        if (origen.target === 'Target no encontrado') {
          warnings.push(`Target no encontrado en la descripción/summary "${ticket.summary}"`);
          origen.target = 'Target Desconocido';
        }

        const formato = this._formatearAlarmaPorTipo(alarmaProcesada, summaryResto, origen.target, ticket.description);
        if (!formato.incluir) return; // Si debe excluirse (Ej. Falso positivo) no hace nada
        
        origen.target = formato.nuevoTarget;
        origen.etiquetaTarget = formato.etiquetaTarget;
        summaryResto = formato.nuevoSummary;

        // Filtrado por reglas de Excepciones dinámicas
        const excepcion = this._verificarExcepcion(pod, cliente, alarmaProcesada, origen, mappings.reglasExcepcion);
        if (excepcion.matcheada) {
          alarmasSilenciadas.push(excepcion.log);
          return; // La alarma cae dentro de una ventana de mantenimiento o excepción, se omite.
        }

        this._agruparMensaje(pod, cliente, alarmaProcesada, JSON.stringify(origen), ticket.created, mensajesProcesados, warnings, summaryResto);

      } catch (err) {
        // index + 2 por retrocompatibilidad con logs antiguos basados en row (fila de excel)
        const filaLog = index + 2;
        errores.push(`Ticket ${ticket.key} (Equiv. Fila ${filaLog}): ${err.message}`);
        Logger.log(`Error procesando ticket ${ticket.key}: ${err.message}`);
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
    if (AlarmFormatters.manejadores[tipoAlarma]) {
      resultado = AlarmFormatters.manejadores[tipoAlarma](summaryResto, target, description);
    } else {
      resultado = { incluir: true, nuevoTarget: target, nuevoSummary: summaryResto };
    }

    if (resultado.incluir && !resultado.etiquetaTarget && resultado.nuevoTarget) {
      const lowerTarget = resultado.nuevoTarget.toLowerCase();
      if (lowerTarget.startsWith('esx') || lowerTarget.includes('host')) {
        resultado.etiquetaTarget = 'Host';
      } else if (lowerTarget.startsWith('cl-') || lowerTarget.includes('cluster')) {
        resultado.etiquetaTarget = 'Cluster';
      } else if (lowerTarget.startsWith('ds-') || lowerTarget.includes('datastore')) {
        resultado.etiquetaTarget = 'Datastore';
      } else {
        resultado.etiquetaTarget = 'Recurso Afectado';
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

  _verificarExcepcion: function(pod, cliente, tipoAlarma, origen, reglas) {
    if (!reglas || reglas.length === 0) return { matcheada: false };
    
    const ahora = new Date();

    for (let i = 0; i < reglas.length; i++) {
      const regla = reglas[i];
      
      // 1. Validar Caducidad
      if (regla.validaHasta && regla.validaHasta < ahora) continue;
      
      // 2. Validar POD
      const p1 = pod.toString().toUpperCase().replace(/POD/g, '').trim();
      const p2 = regla.pod.toString().toUpperCase().replace(/POD/g, '').trim();
      if (regla.pod !== 'TODOS' && p1 !== p2) continue;
      
      // 3. Validar Cliente
      if (regla.cliente !== 'TODOS' && regla.cliente.trim() !== cliente.trim()) continue;
      
      // 4. Validar Tipo Alarma
      if (regla.tipoAlarma !== 'TODAS' && regla.tipoAlarma.trim() !== tipoAlarma.trim()) continue;
      
      // 5. Validar Campo y Condición
      if (regla.campo !== 'CUALQUIERA' && regla.valor !== '') {
        let valorAComparar = '';
        if (regla.campo === 'vCenter') valorAComparar = origen.vCenter;
        else if (regla.campo === 'Cluster') valorAComparar = origen.cluster;
        else if (regla.campo === 'Host' || regla.campo === 'Target') valorAComparar = origen.target;
        
        valorAComparar = (valorAComparar || '').toLowerCase();
        const valorRegla = regla.valor.toLowerCase();
        
        let coincidencia = false;
        switch (regla.condicion.toLowerCase()) {
          case 'contiene':
            coincidencia = valorAComparar.includes(valorRegla);
            break;
          case 'empieza con':
            coincidencia = valorAComparar.startsWith(valorRegla);
            break;
          case 'termina con':
            coincidencia = valorAComparar.endsWith(valorRegla);
            break;
          case 'igual a':
          case 'coincidencia exacta':
            coincidencia = (valorAComparar === valorRegla);
            break;
          default:
            coincidencia = valorAComparar.includes(valorRegla); // Fallback
        }
        
        if (!coincidencia) continue;
      }
      
      // Si llega acá, matcheó todo
      return {
        matcheada: true,
        log: `Alarma silenciada por Excepción ID: *${regla.id}* | Cliente: ${cliente} | Alarma: ${tipoAlarma} | Target: ${origen.target || 'N/A'}`
      };
    }
    
    return { matcheada: false };
  }
};
