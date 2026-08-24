const fs = require('fs');
const rvtools = fs.readFileSync('../script-operaciones/Ops Playground/rvtools/RVTools_Licencias.js', 'utf8');
const veeam = fs.readFileSync('../script-operaciones/Ops Playground/veeam/Veeam_Licencias.js', 'utf8');
const dataProcessing = fs.readFileSync('../script-operaciones/Ops Playground/core/DataProcessingService.js', 'utf8');

let csvParserMatch = dataProcessing.match(/function parseCsvDeReporte[\s\S]+?(?=\nfunction |\nconst |\n$)/);
let csvParser = csvParserMatch ? csvParserMatch[0] : '';
let sepMatch = dataProcessing.match(/function detectarSeparadorCsv[\s\S]+?(?=\nfunction |\nconst |\n$)/);
let sepParser = sepMatch ? sepMatch[0] : '';

let cleanedRVTools = rvtools
  .replace(/function onOpen[\s\S]*?addToUi\(\);\n}/, '')
  .replace(/AutomatizarOperaciones\./g, '')
  .replace(/sendSlackMessage\([^,]+,\s*(msg|msgCrit)\);/g, 'SlackService.enviarNotificacionGuardia($1);')
  .replace(/sendEmail\(\{[\s\S]*?\}\);/g, (match) => {
    return `// Adaptado para Script-Alarmas
    EmailService.enviarReporteGuardia(emailsAEnviar, asunto, cuerpoHtml);`;
  });

let cleanedVeeam = veeam
  .replace(/function onOpen[\s\S]*?addToUi\(\);\n}/, '')
  .replace(/AutomatizarOperaciones\./g, '')
  .replace(/sendSlackMessage\([^,]+,\s*(msg|msgCrit)\);/g, 'SlackService.enviarNotificacionGuardia($1);')
  .replace(/sendEmail\(\{[\s\S]*?\}\);/g, (match) => {
    return `// Adaptado para Script-Alarmas
    EmailService.enviarReporteGuardia(emailsAEnviar, asunto, cuerpoHtml);`;
  });

const unified = `
/**
 * =================================================================
 * SCRIPT DE AUDITORÍA DE LICENCIAS UNIFICADO (vSphere + Veeam)
 * =================================================================
 */

// --- PARSER CSV ---
${sepParser}
${csvParser}

// --- VSPHERE ---
${cleanedRVTools}

// --- VEEAM ---
${cleanedVeeam}
`;

fs.writeFileSync('services/Licencias.js', unified);
console.log('Merged successfully.');