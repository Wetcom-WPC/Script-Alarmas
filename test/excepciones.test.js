/**
 * Verifica que las reglas de Excepciones (silenciado por ventana de mantenimiento)
 * sigan matcheando sobre el formato NUEVO, no sólo sobre el viejo.
 *
 * Es el punto más frágil de la integración: las reglas comparan contra
 * `origen.etiquetaTarget`, así que si un parser nuevo rotula mal su objeto,
 * las excepciones dejan de silenciar y el cliente recibe alarmas que pidió callar.
 */
const { legacy, vrops, reales, reales2, mappings, aTicket } = require('./fixtures');

const porId = {};
[...legacy, ...vrops, ...reales, ...reales2].forEach(f => { porId[f.id] = f; });

const regla = (over) => Object.assign({
  id: 'EXC-TEST',
  pod: 'TODOS',
  cliente: 'TODOS',
  tipoAlarma: 'TODAS',
  campo: 'CUALQUIERA',
  condicion: 'Contiene',
  valor: '',
  validaHasta: null
}, over);

const CASOS = [
  {
    nombre: 'vROps Host: silencia por campo Host',
    fixture: 'vrops-host-multilinea',
    regla: regla({ campo: 'Host', condicion: 'Contiene', valor: 'esx07-prod' }),
    silenciada: true
  },
  {
    nombre: 'vROps Host: silencia por campo Cluster (cluster contenedor)',
    fixture: 'vrops-host-multilinea',
    regla: regla({ campo: 'Cluster', condicion: 'Igual a', valor: 'CL-PROD-03' }),
    silenciada: true
  },
  {
    nombre: 'vROps Host: silencia por campo vCenter',
    fixture: 'vrops-host-multilinea',
    regla: regla({ campo: 'vCenter', condicion: 'Empieza con', valor: 'vcsa-prod' }),
    silenciada: true
  },
  {
    nombre: 'vROps Host: NO silencia si el host no coincide',
    fixture: 'vrops-host-multilinea',
    regla: regla({ campo: 'Host', condicion: 'Contiene', valor: 'esx99-prod' }),
    silenciada: false
  },
  {
    nombre: 'vROps vSAN Cluster: campo Cluster usa el propio objeto',
    fixture: 'vrops-vsan-cluster',
    regla: regla({ campo: 'Cluster', condicion: 'Contiene', valor: 'VSAN-STRETCHED' }),
    silenciada: true
  },
  {
    nombre: 'vROps Capacity Disk: silencia por campo Target',
    fixture: 'vrops-capacity-disk',
    regla: regla({ campo: 'Target', condicion: 'Empieza con', valor: 'naa.6c45' }),
    silenciada: true
  },
  {
    nombre: 'vROps: regla vencida no silencia',
    fixture: 'vrops-host-multilinea',
    regla: regla({ campo: 'Host', valor: 'esx07-prod', validaHasta: new Date('2020-01-01T00:00:00Z') }),
    silenciada: false
  },
  {
    nombre: 'vROps: regla acotada por tipo de alarma que NO es la del ticket',
    fixture: 'vrops-host-multilinea',
    regla: regla({ tipoAlarma: 'Desconexión de Host', campo: 'Host', valor: 'esx07-prod' }),
    silenciada: false
  },
  {
    nombre: 'Legacy: sigue silenciando igual que antes (no hay regresión)',
    fixture: 'legacy-host-not-responding',
    regla: regla({ campo: 'Host', condicion: 'Contiene', valor: 'esx01-prod' }),
    silenciada: true
  }
];

function correr(AlarmProcessor) {
  let fallos = 0;

  CASOS.forEach(caso => {
    const fixture = porId[caso.fixture];
    if (!fixture) throw new Error(`Fixture inexistente: ${caso.fixture}`);

    const mappingsConRegla = Object.assign({}, mappings, { reglasExcepcion: [caso.regla] });
    const { alarmasSilenciadas } = AlarmProcessor.procesarAlarmas([aTicket(fixture)], mappingsConRegla);
    const fueSilenciada = alarmasSilenciadas.length > 0;

    if (fueSilenciada === caso.silenciada) {
      console.log(`  ok    ${caso.nombre}`);
    } else {
      fallos++;
      console.log(`  FALLA ${caso.nombre}`);
      console.log(`        esperaba silenciada=${caso.silenciada}, obtuvo ${fueSilenciada}`);
    }
  });

  return { total: CASOS.length, fallos };
}

module.exports = { correr };
