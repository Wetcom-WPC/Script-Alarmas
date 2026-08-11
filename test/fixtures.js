/**
 * Fixtures de tickets para los tests de regresión.
 *
 * Los casos LEGACY existen para congelar el comportamiento actual: si un refactor
 * cambia aunque sea un carácter de su salida, el golden test falla.
 * Los casos VROPS cubren el formato nuevo estandarizado.
 */

const fecha = (iso) => new Date(iso);

/** Mapa de "Tipos de Alarmas" acotado a lo que necesitan los fixtures. */
const mapaAlarmas = {
  // --- Formato legacy (nombres ya configurados en la planilla) ---
  'vSAN Health Test': 'vSAN Health Test',
  'Path redundancy to storage device': 'Perdida de redundancia de storage',
  'Lost connectivity to storage device': 'Pérdida de conexión a storage',
  'Host is not responding': 'Desconexión de Host',
  'Lost connection to server': 'Pérdida de conexión a storage',
  'vSphere HA initiated a failover action': 'Alarma de HA',
  'Hardware Sensor Status': 'Alarma de sensor de Hardware',
  'Insufficient resources to satisfy vSphere HA failover level': 'Insufficient resources to satisfy vSphere HA failover level',
  'Datastore inaccesible': 'Datastore inaccesible',
  // OJO: a propósito NO se cargan claves con el ID de la alarma (ej: 'StorageConnectivityAlarm').
  // La planilla real está indexada por el texto descriptivo, así que los tickets del formato
  // nuevo (cuyo summary trae sólo el ID) tienen que resolverse por el segundo intento,
  // leyendo la sección "Description:" del cuerpo.
  'net.redundancy.lost': 'Perdida de redundancia de red',
  'vrops.alert': 'Alarma de vROps',

  // Estas dos SÍ están en la planilla real indexadas por el ID de la alarma de vCenter
  'vsan.health.test.stretchedcluster.siteconnectivity': 'Alarma de vSAN',
  'StorageConnectivityAlarm': 'Pérdida de conexión a storage',

  // --- Formato nuevo, ya traducidos en la planilla ---
  'Host has lost connection to vCenter Server': 'Alarma de desconexión de host',
  'Voltage sensors are reporting problems': 'Alarma de sensor de voltaje',
  'ESXi host has detected a link status down on a physical NIC': 'Caída de enlace en NIC física',
  'Path redundancy to storage device degraded': 'Redundancia de rutas a storage degradada',

  // --- Todavía con el placeholder: cubren el centinela ---
  // La planilla usa la variante numerada, por eso el centinela compara por prefijo
  'The host has lost redundant uplinks to the network': 'Configurar en Excel 2',
  'vCenter Server has lost connection to a host that is part of a vSAN cluster': 'Configurar en Excel',
  'Site latency between two fault domains and the witness host has exceeded the recommended treshold values in a vSAN Stretched cluster': 'Configurar en Excel',
  'The overall cache disk health is in bad state, The overall capacity disk health is in bad state': 'Configurar en Excel',
  // Uno ya traducido, para verificar que el centinela no se aplica de más
  'Some disk(s) free space in vSAN Cluster is less than 30%': 'Espacio libre en vSAN por debajo del 30%'
};

const mapaClientes = { SBM: 'Banco Macro', SWAO: 'Balanz' };

const mappings = {
  mapaClientes,
  mapaAlarmas,
  mapaCorreos: {},
  mapaCorreosPods: {},
  reglasExcepcion: []
};

const descLegacy = (vcenter, cluster, target, extra) =>
  `vCenter: ${vcenter}\nCluster Name: ${cluster}\nTarget: ${target}\nPrevious Status: Green${extra ? '\n' + extra : ''}`;

/**
 * Casos del formato viejo. NO deben cambiar de salida nunca.
 */
const legacy = [
  {
    id: 'legacy-vsan-health-test',
    key: 'SBM-26361',
    pod: 'Operations',
    created: fecha('2026-08-01T10:15:00Z'),
    summary: "[alarm.vsan.health.test.stretchedcluster.siteconnectivity] vSAN Health Test 'Site latency health' on cluster CL-PROD-01 changed from green to red",
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'CL-PROD-01')
  },
  {
    id: 'legacy-path-redundancy',
    key: 'SBM-26363',
    pod: 'Operations',
    created: fecha('2026-08-01T10:20:00Z'),
    summary: '[alarm.StorageConnectivityAlarm] Path redundancy to storage device naa.6c45e5c100b1de3aa1b2c3d4e5f60718. Path vmhba2:C0:T1:L0 is down. Affected datastores: DS-PROD-01.',
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'esx01-prod.cliente.com.ar')
  },
  {
    id: 'legacy-host-not-responding',
    key: 'SBM-26350',
    pod: 'WPC',
    created: fecha('2026-08-01T11:00:00Z'),
    summary: 'esx01-prod.cliente.com.ar - Host esx01-prod.cliente.com.ar in CL-PROD-01 is not responding',
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'esx01-prod.cliente.com.ar')
  },
  {
    id: 'legacy-lost-connection-server',
    key: 'SBM-26351',
    pod: 'Operations',
    created: fecha('2026-08-01T11:05:00Z'),
    summary: 'Lost connection to server 10.20.30.40 mount point /vol/ds_nfs_01 mounted as DS-NFS-01.',
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'esx02-prod.cliente.com.ar')
  },
  {
    id: 'legacy-ha-failover',
    key: 'SBM-26352',
    pod: 'Operations',
    created: fecha('2026-08-01T11:10:00Z'),
    summary: 'vSphere HA initiated a failover action on 3 virtual machines in cluster CL-PROD-01',
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'CL-PROD-01')
  },
  {
    id: 'legacy-hardware-sensor',
    key: 'SBM-26353',
    pod: 'WPC',
    created: fecha('2026-08-01T11:15:00Z'),
    summary: 'Hardware Sensor Status: Sensor 12 Fan Module 3: red, Sensor 4 Power Supply 2: yellow, Sensor 1 Ambient Temp: green',
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'esx03-prod.cliente.com.ar')
  },
  {
    id: 'legacy-insufficient-resources',
    key: 'SBM-26354',
    pod: 'Operations',
    created: fecha('2026-08-01T11:20:00Z'),
    summary: 'Insufficient resources to satisfy vSphere HA failover level on cluster CL-PROD-02',
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-02', 'CL-PROD-02')
  },
  {
    id: 'legacy-red-redundancy',
    key: 'SBM-26355',
    pod: 'Operations',
    created: fecha('2026-08-01T11:25:00Z'),
    summary: "[net.redundancy.lost] Alarm 'net.redundancy.lost' on esx04-prod.cliente.com.ar",
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'esx04-prod.cliente.com.ar', 'Physical NIC vmnic3 linkstate is down.')
  },
  {
    id: 'legacy-datastore-veeam-excluido',
    key: 'SBM-26356',
    pod: 'Operations',
    created: fecha('2026-08-01T11:30:00Z'),
    summary: "VeeamBackup_DS01 - Alarm 'Datastore inaccesible' on VeeamBackup_DS01",
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'VeeamBackup_DS01')
  },
  {
    id: 'legacy-vrops-ignorada',
    key: 'SBM-26357',
    pod: 'Operations',
    created: fecha('2026-08-01T11:35:00Z'),
    summary: '[vrops.alert] Something happened in vROps',
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'esx05-prod.cliente.com.ar')
  },
  {
    id: 'legacy-alarma-desconocida',
    key: 'SBM-26358',
    pod: 'Operations',
    created: fecha('2026-08-01T11:40:00Z'),
    summary: '[alarm.EstoNoExisteEnLaPlanilla] Alarm on something',
    description: descLegacy('vcsa-prod.cliente.com.ar', 'CL-PROD-01', 'esx06-prod.cliente.com.ar')
  },
  {
    id: 'legacy-sin-description-util',
    key: 'SBM-26359',
    pod: 'Operations',
    created: fecha('2026-08-01T11:45:00Z'),
    summary: 'Alert Email Digest: NTNX-PROD-01 has 3 unresolved alerts',
    description: 'Sin datos estructurados.'
  },
  // --- Con los prefijos nuevos, pero payload legacy: deben seguir por el camino viejo ---
  {
    id: 'prefijo-9x5-vcenter-falso-positivo',
    key: 'SBM-26379',
    pod: 'Operations',
    created: fecha('2026-08-01T12:00:00Z'),
    summary: '9x5 - vCenter - Falso positivo - Wetcom',
    description: 'Sin datos estructurados.'
  },
  {
    id: 'prefijo-9x5-vcenter-payload-legacy',
    key: 'SBM-26376',
    pod: 'Operations',
    created: fecha('2026-08-01T12:05:00Z'),
    summary: "9x5 - vCenter - esxtmdmz02-prod.macro.com.ar - [Falso positivo - Wetcom] Alarm 'Falso positivo - Wetcom' on esxtmdmz02-prod.macro.com.ar",
    description: descLegacy('vcsa-prod.macro.com.ar', 'CL-DMZ-01', 'esxtmdmz02-prod.macro.com.ar')
  }
];

/**
 * Casos del formato nuevo estandarizado (vROps / Aria Operations).
 *
 * La `description` se prueba en dos formas porque la conversión de ADF de Jira
 * puede entregar los campos separados por salto de línea o colapsados en una sola línea.
 */
const vrops = [
  {
    id: 'vrops-host-multilinea',
    key: 'SBM-26371',
    pod: 'Operations',
    created: fecha('2026-08-02T09:00:00Z'),
    summary: '9x5 - Operations - Host has lost connection to vCenter Server',
    description: [
      'Host: esx07-prod.cliente.com.ar',
      'Cluster: CL-PROD-03',
      'Datacenter: DC-BUENOS-AIRES',
      'vCenter: vcsa-prod.cliente.com.ar',
      'Descripcion: El host perdió la conexión con el vCenter Server.',
      'Recomendacion: Verificar el estado del agente hostd y la conectividad de red del host.'
    ].join('\n')
  },
  {
    id: 'vrops-host-una-sola-linea',
    key: 'SBM-26367',
    pod: 'WPC',
    created: fecha('2026-08-02T09:05:00Z'),
    summary: '24x7 Wetcom - Host has lost connection to vCenter Server',
    description: 'Host: esx08-prod.cliente.com.ar Cluster: CL-PROD-03 Datacenter: DC-BUENOS-AIRES vCenter: vcsa-prod.cliente.com.ar Descripcion: El host perdió la conexión con el vCenter Server. Recomendacion: Verificar el estado del agente hostd.'
  },
  {
    id: 'vrops-vsan-cluster',
    key: 'SBM-26362',
    pod: 'Operations',
    created: fecha('2026-08-02T09:10:00Z'),
    summary: '9x5 - Operations - Site latency between two fault domains and the witness host has exceeded the recommended treshold values in a vSAN Stretched cluster',
    description: [
      'vSAN Cluster: CL-VSAN-STRETCHED-01',
      'Datacenter: DC-BUENOS-AIRES',
      'vCenter: vcsa-prod.cliente.com.ar',
      'Descripcion: La latencia entre sitios superó el umbral recomendado.',
      'Latencia sitio preferido a secundario: 8 ms',
      'Latencia sitio preferido a witness: 210 ms'
    ].join('\n')
  },
  {
    id: 'vrops-capacity-disk',
    key: 'SBM-26340',
    pod: 'Operations',
    created: fecha('2026-08-02T09:15:00Z'),
    summary: '24x7 Wetcom - The overall cache disk health is in bad state, The overall capacity disk health is in bad state',
    description: [
      'Objeto: naa.6c45e5c100b1de3aa1b2c3d4e5f60718',
      'Descripcion: El estado de salud del disco de capacidad es malo.',
      'Health Status: 3'
    ].join('\n')
  },
  {
    id: 'vrops-vsan-cluster-ya-traducida',
    key: 'SBM-26341',
    pod: 'Operations',
    created: fecha('2026-08-02T09:20:00Z'),
    summary: '9x5 - Operations - Some disk(s) free space in vSAN Cluster is less than 30%',
    description: [
      'vSAN Cluster: CL-VSAN-02',
      'Datacenter: DC-CORDOBA',
      'vCenter: vcsa-prod.cliente.com.ar',
      'Descripcion: Espacio libre por debajo del umbral.'
    ].join('\n')
  },
  {
    id: 'vrops-con-variables-sin-resolver',
    key: 'SBM-26342',
    pod: 'Operations',
    created: fecha('2026-08-02T09:25:00Z'),
    summary: '24x7 Wetcom - The host has lost redundant uplinks to the network',
    description: [
      'Host: esx09-prod.cliente.com.ar',
      'Cluster: ${VMWARE|HostSystem|summary|parentCluster}',
      'Datacenter: DC-BUENOS-AIRES',
      'vCenter: vcsa-prod.cliente.com.ar',
      'Descripcion: El host perdió uplinks redundantes.',
      'Recomendacion: '
    ].join('\n')
  },
  {
    id: 'vrops-sin-prefijo',
    key: 'SBM-26343',
    pod: 'Operations',
    created: fecha('2026-08-02T09:30:00Z'),
    summary: 'vCenter Server has lost connection to a host that is part of a vSAN cluster',
    description: [
      'Host: esx10-prod.cliente.com.ar',
      'Cluster: CL-VSAN-02',
      'Datacenter: DC-CORDOBA',
      'vCenter: vcsa-prod.cliente.com.ar',
      'Descripcion: El vCenter perdió la conexión con un host del cluster vSAN.'
    ].join('\n')
  }
];

/**
 * Tickets REALES capturados de Jira el 11/08/2026. Texto copiado tal cual, sin retocar.
 * Son la referencia de verdad: si el parseo cambia, tiene que seguir funcionando sobre estos.
 */
const reales = [
  {
    // Formato nuevo bien formado (template estructurado correcto)
    id: 'real-SBM-26380-operations-host',
    key: 'SBM-26380',
    pod: '5',
    created: fecha('2026-08-10T17:54:00Z'),
    summary: '9x5 - Operations - Host has lost connection to vCenter Server',
    description: [
      'Host: 10.74.1.228',
      'Cluster: N/A',
      'Datacenter: dc-macro',
      'vCenter: dn-macro',
      'Descripcion: The host has been unexpectedly disconnected from vCenter Server. The virtual machines on the host have also lost connectivity to vCenter Server. The host might not have a problem and the virtual machines on the host might be running as expected, but any configuration, data, and events from the host and its virtual machines are lost.',
      'Recomendacion: Click "Open Host in vSphere Web Client" in the Actions menu at the top of Alert details page to connect to the vCenter managing this host and manually reconnect the host to vCenter Server. After the connection to the host is restored by vCenter Server, the alert will be canceled.',
      'If you added this host to a different vCenter, remove it from the current vCenter.'
    ].join('\n')
  },
  {
    // Formato nuevo con el template MAL aplicado desde vROps: prosa, sin campos estructurados
    id: 'real-SBM-26382-wetcom-mal-formada',
    key: 'SBM-26382',
    pod: '5',
    created: fecha('2026-08-10T17:54:00Z'),
    summary: '24x7 Wetcom - Host has lost connection to vCenter Server',
    description: 'Alerta reportada en 10.74.1.228 ubicado en N/A. Descripcion: The host has been unexpectedly disconnected from vCenter Server. The virtual machines on the host have also lost connectivity to vCenter Server. The host might not have a problem and the virtual machines on the host might be running as expected, but any configuration, data, and events from the host and its virtual machines are lost.. Recomendacion: Click "Open Host in vSphere Web Client" in the Actions menu at the top of Alert details page to connect to the vCenter managing this host and manually reconnect the host to vCenter Server. After the connection to the host is restored by vCenter Server, the alert will be canceled.\nIf you added this host to a different vCenter, remove it from the current vCenter.'
  },
  {
    // Alarma nativa de vCenter reenviada con el prefijo nuevo: el detalle vive en "Description:"
    id: 'real-SBM-26392-vcenter-storage',
    key: 'SBM-26392',
    pod: '5',
    created: fecha('2026-08-10T22:42:00Z'),
    summary: '9x5 - vCenter - alarm.StorageConnectivityAlarm',
    // Ver nota de aplanado de ADF en real-SWAO-71: '\n' dentro del párrafo, espacio entre
    // párrafos. Ese espacio antes de "Description:" es el que hacía perder el detalle.
    description: 'Target: esxi031-lom.macro.com.ar\nPrevious Status: Unset\nNew Status: Unset Alarm Definition:\n([Event alarm expression: Lost Storage Connectivity] OR [Event alarm expression: Lost Storage Path Redundancy] OR [Event alarm expression: Degraded Storage Path Redundancy] OR [Event alarm expression: Lost connection to NFS server]) Description:\nPath redundancy to storage device naa.6c45e5c100b1de3acc8eb07c00000003 degraded. Path vmhba64:C0:T1:L4 is down. Affected datastores: Unknown.'
  },
  {
    id: 'real-SBM-26394-vcenter-vsan',
    key: 'SBM-26394',
    pod: '5',
    created: fecha('2026-08-11T01:16:00Z'),
    summary: '9x5 - vCenter - alarm.vsan.health.test.stretchedcluster.siteconnectivity',
    description: "Target: cl-highio-paclom-01\nPrevious Status: Normal\nNew Status: Warning Alarm Definition:\n([Event alarm expression: Checks the network latency between the two fault domains and the witness host; Status = Yellow] OR [Event alarm expression: Checks the network latency between the two fault domains and the witness host; Status = Red]) Description:\nvSAN Health Test 'Site latency health' status changed from 'green' to 'yellow'"
  },
  {
    // Falso positivo con prefijo: debe seguir excluyéndose aun con el nombre bien resuelto
    id: 'real-falso-positivo-con-prefijo',
    key: 'SBM-26379',
    pod: '5',
    created: fecha('2026-08-10T12:00:00Z'),
    summary: '9x5 - vCenter - Falso positivo - Wetcom',
    description: 'Target: esxtmdmz02-prod.macro.com.ar\nPrevious Status: Green\nNew Status: Red'
  }
];

/**
 * Segunda tanda de tickets REALES, capturados el 11/08/2026 a la mañana.
 * Cubren el template en prosa del canal 24x7 y el primer caso multi-cliente (Balanz).
 */
const reales2 = [
  {
    // Prosa 24x7, con cluster real rescatable ("ubicado en cl-gp-paclom-02")
    id: 'real-SBM-26401-prosa-con-cluster',
    key: 'SBM-26401',
    pod: '5',
    created: fecha('2026-08-11T10:15:00Z'),
    summary: '24x7 Wetcom - ESXi host has detected a link status down on a physical NIC',
    description: 'Alerta reportada en esxi023-lom.macro.com.ar ubicado en cl-gp-paclom-02. Descripcion: ESXi host has detected a link status down on a physical NIC.. Recomendacion: ESXi deactivates the device to avoid the link flapping state. You might need to replace the physical NIC. The alert will be canceled when the NIC is repaired and functioning. If you replace the physical NIC, you might need to manually cancel the alert.'
  },
  {
    // Prosa 24x7 con todo en N/A: no hay cluster ni recomendación que rescatar
    id: 'real-SBM-26397-prosa-sin-cluster',
    key: 'SBM-26397',
    pod: '5',
    created: fecha('2026-08-11T10:15:00Z'),
    summary: '24x7 Wetcom - Path redundancy to storage device degraded',
    description: 'Alerta reportada en esxi031-lom.macro.com.ar ubicado en N/A. Descripcion: Path redundancy to storage device degraded. Recomendacion: N/A'
  },
  {
    // Nombre SÍ cargado en la planilla: no debe salir como "Alarma desconocida"
    id: 'real-SBM-26402-prosa-nombre-conocido',
    key: 'SBM-26402',
    pod: '5',
    created: fecha('2026-08-11T10:18:00Z'),
    summary: '24x7 Wetcom - Voltage sensors are reporting problems',
    description: 'Alerta reportada en esxi029-pac.macro.com.ar ubicado en cl-lan-prod-vdi-pac. Descripcion: One or more voltage sensors on the host are reporting problems. Specific details should be available in the symptom details. For more information, check the Hardware Status of the host in vSphere Client. Recomendacion: N/A'
  },
  {
    // Otro cliente (proyecto SWAO → Balanz) y cuerpo legacy CON línea "vCenter:"
    id: 'real-SWAO-71-balanz-vcenter',
    key: 'SWAO-71',
    pod: '5',
    created: fecha('2026-08-11T09:44:00Z'),
    summary: '9x5 - vCenter - alarm.HostConnectivityAlarm',
    // Forma REAL del aplanado de ADF: JiraService une con '\n' los hijos de un mismo
    // párrafo, y con ESPACIO los párrafos entre sí. Por eso el bloque de cabecera
    // conserva saltos de línea pero "Alarm Definition:" y "Description:" quedan pegados
    // al texto anterior por un espacio. Reproducirlo mal acá esconde bugs reales.
    description: 'vCenter: vcsa65.balanzcapital.net.ar\nTarget: esxi15.balanzcapital.net.ar\nPrevious Status: Unset\nNew Status: Unset Alarm Definition:\n([Event alarm expression: Cannot connect host - network error] OR [Event alarm expression: Cannot connect host - time-out] OR [Event alarm expression: Host connection lost]) Description:\nHost esxi15.balanzcapital.net.ar in BALANZ is not responding'
  },
  {
    // Caso defensivo: mismo contenido pero SIN ningún salto de línea, que es lo que pasa
    // si Jira arma la description con cada línea en su propio párrafo. Sin el corte por
    // etiquetas conocidas, el valor de vCenter se llevaba puesto todo el resto del cuerpo.
    id: 'robustez-adf-totalmente-colapsado',
    key: 'SWAO-72',
    pod: '5',
    created: fecha('2026-08-11T09:45:00Z'),
    summary: '9x5 - vCenter - alarm.HostConnectivityAlarm',
    description: 'vCenter: vcsa65.balanzcapital.net.ar Target: esxi15.balanzcapital.net.ar Previous Status: Unset New Status: Unset Alarm Definition: ([Event alarm expression: Host connection lost]) Description: Host esxi15.balanzcapital.net.ar in BALANZ is not responding'
  }
];

const aTicket = (f) => ({
  key: f.key,
  summary: f.summary,
  description: f.description,
  created: new Date(f.created.getTime()),
  pod: f.pod
});

module.exports = { legacy, vrops, reales, reales2, mappings, aTicket };
