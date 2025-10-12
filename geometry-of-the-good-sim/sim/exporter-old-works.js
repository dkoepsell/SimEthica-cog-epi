// exporter.js
// Provides logging, summaries, client-side CSV downloads, and optional server submission.
// Matches the imports used in sketch.js.

import { normTypes, SIM_CONFIG } from './config.js';

/* ---------- Full-metrics coercion helpers ---------- */
const __forceFull = () => (SIM_CONFIG && (SIM_CONFIG.forceFullMetrics || (SIM_CONFIG.performanceProfiles && SIM_CONFIG.activeProfile && SIM_CONFIG.performanceProfiles[SIM_CONFIG.activeProfile]?.forceFullMetrics))) || false;
function __asStrFull(v){ return (v===undefined||v===null||v==='') ? 'n/a' : String(v); }
function __asNumFull(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function __asBoolFull(v){ return (v===true || v==='TRUE' || v===1) ? 'TRUE' : 'FALSE'; }


/* -------------------------
   Helpers: CSV builders
--------------------------*/
function buildAgentCSV(agentLog) {
  const header = [
    "generation","scenario","id","normPref","aprioriAck","legalAck","careAck","epistemicAck",
    "attempts","successes","conflict","debt","momentum","trustCount","trustMax",
    "fulfilled","denied","expired","repaired","role","temperament","moralStance",
    "scenarioGroup","memoryLength","affiliation",
    "enableMoralRepair","enableDirectedEmergence","enableNonReciprocalTargeting","batchRun"
  ].join(",") + "\n";

  const force = __forceFull();
  const B = v => force ? __asBoolFull(v) : (v ?? "");
  const N = v => force ? __asNumFull(v)  : (v ?? "");
  const S = v => force ? __asStrFull(v)  : (v ?? "");

  let csv = header;
  for (const row of (agentLog || [])) {
    csv += [
      N(row.generation),
      S(row.scenario),
      N(row.id),
      S(row.normPref),
      B(row.aprioriAck),
      B(row.legalAck),
      B(row.careAck),
      B(row.epistemicAck),
      N(row.attempts),
      N(row.successes),
      N(row.conflict),
      N(row.debt),
      N(row.momentum),
      N(row.trustCount),
      N(row.trustMax),
      N(row.fulfilled),
      N(row.denied),
      N(row.expired),
      N(row.repaired),
      S(row.role),
      N(row.temperament),
      S(row.moralStance),
      S(row.scenarioGroup),
      N(row.memoryLength),
      S(row.affiliation),
      B(row.enableMoralRepair),
      B(row.enableDirectedEmergence),
      B(row.enableNonReciprocalTargeting),
      N(row.batchRun)
    ].join(",") + "\n";
  }
  return csv;
}

function buildObligationCSV(obligationLog) {
  const header = "generation,from,to,norm,status\n";
  let csv = header;
  for (const row of (obligationLog || [])) {
    csv += [
      row.generation ?? "",
      row.from ?? "",
      row.to ?? "",
      row.norm ?? "",
      row.status ?? ""
    ].join(",") + "\n";
  }
  return csv;
}

/* -------------------------
   Helper: client download
--------------------------*/
function blobDownload(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -----------------------------------
   Exports used by sketch.js imports
------------------------------------*/

/**
 * logGeneration(agents, generation, log)
 * Pushes a compact metrics snapshot to `log`.
 */
export function logGeneration(agents, generation, log) {
  if (!Array.isArray(log)) return;
  const n = (agents?.length ?? 0) || 1;
  const sum = (fn) => agents.reduce((s, a) => s + (Number(fn(a)) || 0), 0);

  const fulfillmentRate = sum(a => a.obligationSuccesses) / n;
  const avgConflict = sum(a => a.internalConflict) / n;
  const avgDebt = sum(a => a.contradictionDebt) / n;
  const repairEvents = sum(a => {
    if (!a.relationalLedger) return 0;
    let c = 0;
    for (const v of a.relationalLedger.values()) if (v === 'repaired') c++;
    return c;
  });

  // You can extend this with emergent norm tracking if you log it elsewhere
  const entry = {
    generation,
    fulfillmentRate,
    avgConflict,
    avgDebt,
    repairEvents,
    emergentNorms: 0
  };
  log.push(entry);
}

/**
 * generateInterpretiveSummary(log, agents, scenario)
 * Returns a simple HTML-ready string summary.
 */
export function generateInterpretiveSummary(log = [], agents = [], scenario = 'pluralist') {
  if (log.length === 0) {
    return `Scenario: ${scenario}\nNo data recorded yet.`;
  }
  const last = log[log.length - 1];
  const totalAgents = agents.length;

  const lines = [
    `<strong>Scenario:</strong> ${scenario}`,
    `<strong>Agents:</strong> ${totalAgents}`,
    `<strong>Latest Generation:</strong> ${last.generation}`,
    `<strong>Fulfillment Rate:</strong> ${Number(last.fulfillmentRate ?? 0).toFixed(2)}`,
    `<strong>Relational Integrity (low conflict & debt):</strong> ${(1 - ((Number(last.avgConflict ?? 0) + Number(last.avgDebt ?? 0)) / 2)).toFixed(2)}`,
    `<strong>Avg Conflict:</strong> ${Number(last.avgConflict ?? 0).toFixed(2)}`,
    `<strong>Avg Contradiction Debt:</strong> ${Number(last.avgDebt ?? 0).toFixed(2)}`,
    `<strong>Repair Events (latest snapshot):</strong> ${last.repairEvents ?? 0}`
  ];
  return lines.join('\n');
}

/**
 * downloadAgentLog(agentLog, nameOrScenario)
 * Saves a CSV to the client.
 */
export function downloadAgentLog(agentLog = [], name = 'run') {
  const csv = buildAgentCSV(agentLog);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  blobDownload(`agentLog_${name}_${ts}.csv`, csv, 'text/csv');
}

/**
 * downloadObligationLog(obligationLog, nameOrScenario)
 * Saves a CSV to the client.
 */
export function downloadObligationLog(obligationLog = [], name = 'run') {
  const csv = buildObligationCSV(obligationLog);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  blobDownload(`obligationLog_${name}_${ts}.csv`, csv, 'text/csv');
}

/**
 * exportAndSubmitRun(log, agents, scenario)
 * Called once per generation from sketch.js. We keep it lightweight:
 * - By default, NO server traffic (avoids spamming).
 * - If you set SIM_CONFIG.submitStreaming = true and SIM_CONFIG.allowSubmission = true,
 *   it will POST a tiny heartbeat summary (no JSON/CSV files).
 */
export async function exportAndSubmitRun(log = [], agents = [], scenario = 'run') {
  const allow = !!(SIM_CONFIG?.allowSubmission);
  const stream = !!(SIM_CONFIG?.submitStreaming);
  if (!allow || !stream) return;

  // Throttle to ~1 request per 2 seconds
  const now = performance.now();
  if (!window.__lastStreamPost) window.__lastStreamPost = 0;
  if (now - window.__lastStreamPost < 2000) return;
  window.__lastStreamPost = now;

  try {
    const latest = log[log.length - 1] || {};
    const meta = {
      userID: "anon",
      timestamp: new Date().toISOString(),
      scenario,
      metrics: {
        generation: latest.generation ?? 0,
        fulfillmentRate: latest.fulfillmentRate ?? 0,
        avgConflict: latest.avgConflict ?? 0,
        avgDebt: latest.avgDebt ?? 0
      }
    };
    const form = new FormData();
    form.append('meta', JSON.stringify(meta));
    // Server can ignore these mini heartbeats; they are not stored as files.
    const resp = await fetch('sim/api/submitRun.php', { method: 'POST', body: form });
    if (!resp.ok) {
      console.warn('Streaming submit failed:', await resp.text());
    }
  } catch (e) {
    console.warn('exportAndSubmitRun (stream) error:', e);
  }
}

/**
 * exportAndSubmitRunFinal(options)
 * Sends ONLY the CSVs (no JSON files) to the server when allowed.
 * This is intended for the final/explicit submission step.
 */
export async function exportAndSubmitRunFinal({
  agents = [],
  scenario = 'run',
  agentLog = [],
  obligationLog = [],
  tags = (window?.SIM_CONFIG?.runTags || []),
  config = {
    trustGrowth: SIM_CONFIG?.trustGrowth,
    obligation: {
      proximityThreshold: SIM_CONFIG?.enforcementRules?.proximityThreshold ?? SIM_CONFIG?.obligation?.proximityThreshold,
      countMultiplier: SIM_CONFIG?.obligation?.countMultiplier,
      maxVectors: SIM_CONFIG?.obligation?.maxVectors
    }
  },
  allowSubmission = (window?.SIM_CONFIG?.allowSubmission ?? false)
} = {}) {
  try {
    if (!allowSubmission) return;

    const timestamp = new Date().toISOString();

    // Lightweight inline summary
    const counts = Object.fromEntries(normTypes.map(n => [n, agents.filter(a => a[`${n}Acknowledges`]).length]));
    const summaryHtml = `
      <strong>Summary — Final</strong><br>
      Scenario: ${scenario}<br>
      Norm Acknowledgment: ${Object.entries(counts).map(([k,v]) => `${k}: ${v}`).join(', ')}
    `;

    const meta = {
      userID: "anon",
      timestamp,
      scenario,
      tags,
      config,
      metrics: {
        avgTrust: agents.length
          ? (agents.reduce((s,a)=>s + (a.trustMap?.size||0), 0) / agents.length)
          : 0,
        normAcknowledgment: Object.fromEntries(
          normTypes.map(n => [n, agents.length ? (agents.filter(a => a[`${n}Acknowledges`]).length / agents.length) : 0])
        ),
        affiliationEntropy: new Set(agents.map(a => a.affiliation)).size
      },
      summary: summaryHtml
    };

    const agentCsv = buildAgentCSV(agentLog);
    const oblCsv = buildObligationCSV(obligationLog);

    const form = new FormData();
    form.append('meta', JSON.stringify(meta));
    form.append('agent_csv', new Blob([agentCsv], { type: 'text/csv' }), `agentLog_${timestamp}.csv`);
    form.append('obligation_csv', new Blob([oblCsv], { type: 'text/csv' }), `obligationLog_${timestamp}.csv`);

    const resp = await fetch('sim/api/submitRun.php', { method: 'POST', body: form });
    if (!resp.ok) {
      console.error('CSV submit failed:', await resp.text());
      return;
    }
    const j = await resp.json().catch(()=>null);
    if (j?.ok) {
      console.log('Run saved to data/runs/', j);
    } else {
      console.warn('Server responded but not ok:', j);
    }
  } catch (err) {
    console.error('exportAndSubmitRunFinal error:', err);
  }
}

/* ------------------------------------------------
   Optional: expose builders if you need them elsewhere
-------------------------------------------------*/
export { buildAgentCSV, buildObligationCSV };
