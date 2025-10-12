// exporter.js
// Provides logging, summaries, client-side CSV downloads, and optional server submission.
// Now includes Cognitive Agency (CA), Epistemic Autonomy (EA), and belief logging.

// exporter.js — browser-safe global access
const SIM_CONFIG = window.SIM_CONFIG;
const normTypes = window.normTypes;

/* ---------- Full-metrics coercion helpers ---------- */
const __forceFull = () => (SIM_CONFIG && (SIM_CONFIG.forceFullMetrics ||
  (SIM_CONFIG.performanceProfiles && SIM_CONFIG.activeProfile &&
  SIM_CONFIG.performanceProfiles[SIM_CONFIG.activeProfile]?.forceFullMetrics))) || false;
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
    // NEW fields
    "CA","EA","belief",
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
      // NEW cognitive-epistemic fields
      N(row.CA),
      N(row.EA),
      N(row.belief),
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
export function logGeneration(agents, generation, log) {
  if (!Array.isArray(log)) return;
  const n = (agents?.length ?? 0) || 1;
  const sum = fn => agents.reduce((s, a) => s + (Number(fn(a)) || 0), 0);

  const fulfillmentRate = sum(a => a.obligationSuccesses) / n;
  const avgConflict = sum(a => a.internalConflict) / n;
  const avgDebt = sum(a => a.contradictionDebt) / n;

  const repairEvents = sum(a => {
    if (!a.relationalLedger) return 0;
    let c = 0;
    const it = (typeof a.relationalLedger.values === 'function')
      ? a.relationalLedger.values()
      : Object.values(a.relationalLedger);
    for (const v of it) if (v === 'repaired') c++;
    return c;
  });

  // Cognitive–epistemic stats
  const beliefs = agents.map(a => Number.isFinite(Number(a?.belief)) ? Number(a.belief) : 0.5);
  const mean = arr => arr.reduce((s,x)=>s+x,0) / (arr.length || 1);
  const m = mean(beliefs);
  const std = Math.sqrt(mean(beliefs.map(x => (x - m) ** 2)));
  const pol = beliefs.length ? Math.max(...beliefs) - Math.min(...beliefs) : 0;
  const avgCA = mean(agents.map(a => Number.isFinite(Number(a?.CA)) ? Number(a.CA) : 0));
  const avgEA = mean(agents.map(a => Number.isFinite(Number(a?.EA)) ? Number(a.EA) : 0));

  log.push({
    generation,
    fulfillmentRate,
    avgConflict,
    avgDebt,
    repairEvents,
    emergentNorms: 0,
    avgBelief: m,
    stdBelief: std,
    polarization: pol,
    avgCA,
    avgEA
  });
}

export function generateInterpretiveSummary(log = [], agents = [], scenario = 'pluralist') {
  if (log.length === 0) return `Scenario: ${scenario}\nNo data recorded yet.`;
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
  if (last.avgBelief !== undefined) {
    lines.push(
      `<strong>Avg Belief:</strong> ${Number(last.avgBelief ?? 0).toFixed(3)}`,
      `<strong>Belief Std:</strong> ${Number(last.stdBelief ?? 0).toFixed(3)}`,
      `<strong>Polarization (Δ):</strong> ${Number(last.polarization ?? 0).toFixed(3)}`,
      `<strong>Avg CA / Avg EA:</strong> ${Number(last.avgCA ?? 0).toFixed(2)} / ${Number(last.avgEA ?? 0).toFixed(2)}`
    );
  }
  return lines.join('\n');
}

export function downloadAgentLog(agentLog = [], name = 'run') {
  const csv = buildAgentCSV(agentLog);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  blobDownload(`agentLog_${name}_${ts}.csv`, csv, 'text/csv');
}

export function downloadObligationLog(obligationLog = [], name = 'run') {
  const csv = buildObligationCSV(obligationLog);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  blobDownload(`obligationLog_${name}_${ts}.csv`, csv, 'text/csv');
}

export async function exportAndSubmitRun(log = [], agents = [], scenario = 'run') {
  const allow = !!(SIM_CONFIG?.allowSubmission);
  const stream = !!(SIM_CONFIG?.submitStreaming);
  if (!allow || !stream) return;
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
    await fetch('sim/api/submitRun.php', { method: 'POST', body: form });
  } catch (e) {
    console.warn('exportAndSubmitRun (stream) error:', e);
  }
}

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
        affiliationEntropy: new Set(agents.map(a => a.affiliation)).size,
        avgBelief: (log?.length ? (log[log.length-1].avgBelief ?? 0) : 0),
        stdBelief: (log?.length ? (log[log.length-1].stdBelief ?? 0) : 0),
        polarization: (log?.length ? (log[log.length-1].polarization ?? 0) : 0),
        avgCA: (log?.length ? (log[log.length-1].avgCA ?? 0) : 0),
        avgEA: (log?.length ? (log[log.length-1].avgEA ?? 0) : 0)
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
    if (!resp.ok) console.error('CSV submit failed:', await resp.text());
  } catch (err) {
    console.error('exportAndSubmitRunFinal error:', err);
  }
}

export { buildAgentCSV, buildObligationCSV };
