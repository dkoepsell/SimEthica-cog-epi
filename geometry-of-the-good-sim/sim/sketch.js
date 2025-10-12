
// sim/sketch.js — stable build (EA/CA logging + no-freeze)
//
// - Defensive globals (SIM_CONFIG/TOGGLES/normTypes) so nothing crashes
// - CA / EA / belief captured in agentLog rows
// - Fixes undefined 'a' in evolveGeneration()
// - Keeps batch mode, workers, GUI hooks, and summaries
// - Compatible with your existing agent.js/norms.js/exporter.js/scenarios.js/gui.js

/* -------------------- Defensive globals -------------------- */
const SIM_CONFIG = window.SIM_CONFIG || {};
const TOGGLES = window.TOGGLES || {
  enableWorkers: true,
  enableMoralRepair: true,
  enableDirectedEmergence: false,
  enableNonReciprocalTargeting: false,
  enableHoverBios: true,
  enableTrustAttraction: true,
  enableObligationForces: true,
  showInterpretiveSummaryOnStop: true,
  showAgentTrails: false,
  showTrustHeatmap: false,
  enableFalsifiabilityFlags: true,
  enableValidationMode: false
};
const VISUALS = window.VISUALS || {};
const COLORS  = window.COLORS  || {};
const normTypes = (Array.isArray(window.normTypes) && window.normTypes.length)
  ? window.normTypes
  : (SIM_CONFIG.normTypes || ['legal','apriori','care','epistemic']);

/* -------------------- Imports -------------------- */
import { registerNorm, defaultEnforce } from './norms.js';
import { Agent, ObligationVector, getNormColor } from './agent.js';
import { SCENARIO_FUNCTIONS, SCENARIO_NAMES } from './scenarios.js';
import { createGUI } from './gui.js';
import { WorkerPool } from './workers/pool.js';
import {
  logGeneration,
  generateInterpretiveSummary,
  downloadAgentLog,
  downloadObligationLog,
  exportAndSubmitRun,
  exportAndSubmitRunFinal
} from './exporter.js';

/* -------------------- Deep-time profile -------------------- */
let validationMode = !!TOGGLES.enableValidationMode;
function __applyDeepTimeProfile(name) {
  try {
    const profiles = SIM_CONFIG.performanceProfiles || {};
    const p = profiles[name] || profiles.normal || {};
    if (typeof p.validationMode === 'boolean') validationMode = p.validationMode;
    if (typeof p.generationInterval === 'number') SIM_CONFIG.generationInterval = p.generationInterval;
    if (p.obligation) {
      if (typeof p.obligation.maxVectors === 'number') SIM_CONFIG.obligation.maxVectors = p.obligation.maxVectors;
      if (typeof p.obligation.targetDegree === 'number') SIM_CONFIG.obligation.targetDegree = p.obligation.targetDegree;
    }
    window.__snapshotEvery = p.snapshotEvery ?? window.__snapshotEvery ?? 1000;
    window.__logSample = p.logSample ?? window.__logSample ?? 0.02;
    SIM_CONFIG.activeProfile = name;
  } catch(_) {}
}
window.setDeepTimeMode = (on) => __applyDeepTimeProfile(on ? 'deepTime' : 'normal');

/* -------------------- Global state -------------------- */
let agents = [];
let obligationVectors = [];
let agentLog = [];
let obligationLog = [];
let log = [];
let falsifyFlags = [];

let generation = 0;
let generationTimer = 0;
const __genInterval = () => Number(SIM_CONFIG.generationInterval || 100);

let scenario = 'pluralist';
let enableMoralRepair = !!TOGGLES.enableMoralRepair;
let enableDirectedEmergence = !!TOGGLES.enableDirectedEmergence;
let enableNonReciprocalTargeting = !!TOGGLES.enableNonReciprocalTargeting;

let enableTrustHeatmap = !!TOGGLES.showTrustHeatmap;
let enableAgentTrails = !!TOGGLES.showAgentTrails;
let enableAffiliationHeatmap = false;
let enableConflictHeatmap = false;

let batchMode = false;
let batchTotalRuns = 1;
let batchGenerations = 25;
let batchIndex = 0;
let batchRunsSequence = [];
let batchAgentLog = [];
let batchObligationLog = [];

window.groupColors = {};

let advancedSettings = {
  numAgents: SIM_CONFIG.numAgents || 100,
  proximityThreshold: (SIM_CONFIG.enforcementRules?.proximityThreshold ?? SIM_CONFIG.obligation?.proximityThreshold ?? 150),
  defaultNormDistribution: 'uniform',
  memoryBase: 0.6,
  moralStanceDistribution: 'uniform'
};

let globalAgentIndex = 0;
let agentMap = new Map();
let hostilePairs = new Set();
let running = true;
let isPaused = false;
let interpretiveSummary = '';
let summaryPopup, aboutPopup;

/* -------------------- Utils -------------------- */
function classifyScenario(agent) {
  const ack = {
    apriori: !!agent.aprioriAcknowledges,
    legal: !!agent.legalAcknowledges,
    care: !!agent.careAcknowledges,
    epistemic: !!agent.epistemicAcknowledges
  };
  const ackCount = Object.values(ack).filter(Boolean).length;
  if (ackCount === normTypes.length) return 'utopian';
  if (ackCount === 0) return 'collapsed';
  if (ackCount === 1) {
    if (ack.legal) return 'authoritarian';
    if (ack.care) return 'allCare';
    return 'pluralist';
  }
  return 'pluralist';
}
window.agents = agents;
window.agentMap = agentMap;
window.isPaused = isPaused;

/* -------------------- Batch launcher -------------------- */
window.startBatch = function (runs, generations) {
  const reps = parseInt(runs) || 1;
  batchGenerations = parseInt(generations) || 25;
  batchRunsSequence = [];
  batchAgentLog = [];
  batchObligationLog = [];
  const combos = [
    { enableMoralRepair: false, enableDirectedEmergence: false, enableNonReciprocalTargeting: false },
    { enableMoralRepair: true,  enableDirectedEmergence: false, enableNonReciprocalTargeting: false },
    { enableMoralRepair: false, enableDirectedEmergence: true,  enableNonReciprocalTargeting: false },
    { enableMoralRepair: false, enableDirectedEmergence: false, enableNonReciprocalTargeting: true },
    { enableMoralRepair: true,  enableDirectedEmergence: true,  enableNonReciprocalTargeting: false },
    { enableMoralRepair: true,  enableDirectedEmergence: false, enableNonReciprocalTargeting: true },
    { enableMoralRepair: false, enableDirectedEmergence: true,  enableNonReciprocalTargeting: true },
    { enableMoralRepair: true,  enableDirectedEmergence: true,  enableNonReciprocalTargeting: true }
  ];
  for (const s of SCENARIO_NAMES) {
    for (const combo of combos) {
      for (let i = 0; i < reps; i++) batchRunsSequence.push({ scenario: s, combo });
    }
  }
  batchTotalRuns = batchRunsSequence.length;
  batchIndex = 0;
  batchMode = true;
  validationMode = true;
  if (batchRunsSequence.length > 0) applyBatchConfig(batchRunsSequence[0]);
  resetSimulation();
};

/* -------------------- Workers -------------------- */
let __pool = null;
let __forcesPromise = null, __forcesResult = null;
let __enforcePromise = null, __enforceResult = null;

function __initPool() {
  try {
    if (!__pool && window.Worker && TOGGLES.enableWorkers) {
      const threads = Math.max(1, (navigator.hardwareConcurrency || 4));
      __pool = new WorkerPool(new URL('./workers/simWorker.js', import.meta.url), threads);
      console.log('[SimEthica] Worker pool started with', threads, 'threads');
    }
  } catch (e) {
    console.warn('Worker init failed', e);
  }
}

/* -------------------- p5 setup/draw -------------------- */
export function setup() {
  try { __applyDeepTimeProfile(SIM_CONFIG.activeProfile || 'normal'); } catch(_) {}

  const canvas = createCanvas(windowWidth - 40, windowHeight - 100);
  canvas.parent('sketch-holder');
  pixelDensity(2);
  __initPool();
  smooth();

  // Summary popup
  summaryPopup = createDiv('').id('summary-popup').style('display','none');
  document.body.appendChild(summaryPopup.elt);

  // About popup
  aboutPopup = createDiv('').id('about-popup').style('display','none');
  document.body.appendChild(aboutPopup.elt);

  createGUI({
    scenarios: SCENARIO_NAMES,
    toggles: ['Moral Repair', 'Directed Norms', 'Vulnerability Targeting', 'Trust Heatmap', 'Affiliation Heatmap', 'Conflict Heatmap', 'Trails'],
    onScenarioSelect: (type) => { scenario = type; resetSimulation(); },
    onToggleChange: (name) => {
      switch (name) {
        case 'Moral Repair': enableMoralRepair = !enableMoralRepair; break;
        case 'Directed Norms': enableDirectedEmergence = !enableDirectedEmergence; break;
        case 'Vulnerability Targeting': enableNonReciprocalTargeting = !enableNonReciprocalTargeting; break;
        case 'Trust Heatmap': enableTrustHeatmap = !enableTrustHeatmap; break;
        case 'Affiliation Heatmap': enableAffiliationHeatmap = !enableAffiliationHeatmap; break;
        case 'Conflict Heatmap': enableConflictHeatmap = !enableConflictHeatmap; break;
        case 'Trails': enableAgentTrails = !enableAgentTrails; break;
      }
    },
    onPauseResume: () => { isPaused = !isPaused; running = !isPaused; },
    onStop: () => {
      running = false;
      interpretiveSummary = generateInterpretiveSummary(log, agents, scenario);
      exportAndSubmitRunFinal({ agents, scenario, agentLog, obligationLog, allowSubmission: !!SIM_CONFIG.allowSubmission });
      showInterpretivePopup();
    },
    onReset: () => { resetSimulation(); },
    onDownloadAgentLog: () => { downloadAgentLog(agentLog, scenario); },
    onDownloadObligationLog: () => { downloadObligationLog(obligationLog, scenario); },
    onAdvancedChange: (settings) => {
      if (settings.proximityThreshold !== undefined) {
        const v = parseFloat(settings.proximityThreshold);
        SIM_CONFIG.enforcementRules.proximityThreshold = v;
        SIM_CONFIG.obligation.proximityThreshold = v;
      }
      if (settings.numAgents !== undefined) SIM_CONFIG.numAgents = parseInt(settings.numAgents);
      if (settings.trustIncrement !== undefined) SIM_CONFIG.trustGrowth.increment = parseFloat(settings.trustIncrement);
      if (settings.trustDecrement !== undefined) SIM_CONFIG.trustGrowth.decrement = parseFloat(settings.trustDecrement);
      if (settings.expirationBase !== undefined) SIM_CONFIG.enforcementRules.expirationBase = parseInt(settings.expirationBase);
      if (settings.expirationRandom !== undefined) SIM_CONFIG.enforcementRules.expirationRandom = parseInt(settings.expirationRandom);
      if (settings.reproductionChance !== undefined) SIM_CONFIG.reproduction.chance = parseFloat(settings.reproductionChance);
      if (settings.deathRate !== undefined) SIM_CONFIG.death.baseRate = parseFloat(settings.deathRate);
      if (settings.cohesion !== undefined) SIM_CONFIG.forceParams.cohesion = parseFloat(settings.cohesion);
      if (settings.separation !== undefined) SIM_CONFIG.forceParams.separation = parseFloat(settings.separation);
      if (settings.alignment !== undefined) SIM_CONFIG.forceParams.alignment = parseFloat(settings.alignment);
      if (settings.trustAttraction !== undefined) SIM_CONFIG.forceParams.trustAttraction = parseFloat(settings.trustAttraction);
      if (settings.memoryBase !== undefined) advancedSettings.memoryBase = parseFloat(settings.memoryBase);
      if (settings.moralStanceDistribution !== undefined) advancedSettings.moralStanceDistribution = settings.moralStanceDistribution;
      if (settings.validationMode !== undefined) validationMode = !!settings.validationMode;
    },
    onAddNorm: ({ name, color }) => {
      if (!name) return;
      const lower = name.toLowerCase();
      if (SIM_CONFIG.normTypes.includes(lower)) return;
      registerNorm(lower, {
        color,
        enforceFn: (vec, state) => defaultEnforce(vec, state),
        acknowledgeFn: (agent) => agent[`${lower}Acknowledges`]
      });
      SIM_CONFIG.normTypes.push(lower);
      COLORS.norms[lower] = color;
      if (window.normSelect && typeof window.normSelect.option === 'function') {
        const label = lower.charAt(0).toUpperCase() + lower.slice(1) + ' biased';
        window.normSelect.option(label);
      }
      for (const agent of agents) {
        agent[`${lower}Acknowledges`] = random() > 0.5;
        agent.lastAcknowledgments = agent.lastAcknowledgments || {};
        agent.lastAcknowledgments[lower] = agent[`${lower}Acknowledges`];
      }
    },
    onShowAbout: () => { showAboutPopup(); }
  });

  initializeAgents();
  loadScenario(scenario);
  generateObligations();
  logGeneration(agents, generation, log);

  frameRate(60);
  smooth();
  pixelDensity(1);
  running = true;
  loop();
}

function draw() {
  background(245);

  // Validation (headless-ish) path
  if (validationMode) {
    agentMap.clear();
    for (const a of agents) agentMap.set(a.id, a);
    window.agents = agents; window.agentMap = agentMap;

    const __oblStart = obligationLog.length;
    for (const vec of obligationVectors) vec.enforce({ generation, obligationLog });
    const __new = obligationLog.slice(__oblStart);
    for (const e of __new) {
      const s = agentMap.get(e.from);
      const t = agentMap.get(e.to);
      if (!s) continue;
      s.obligationAttempts = (s.obligationAttempts || 0) + 1;
      s.relationalLedger = s.relationalLedger || new Map();
      if (t) s.relationalLedger.set(t.id, e.status);
      if (e.status === 'fulfilled') {
        s.obligationSuccesses = (s.obligationSuccesses || 0) + 1;
      } else if (e.status === 'denied' && s.incrementContradictionDebt) {
        s.incrementContradictionDebt('denied');
      }
      if (t) {
        s.trustMap = s.trustMap || new Map();
        const prev = s.trustMap.get(t.id) || 0;
        if (e.status === 'fulfilled') {
          const inc = SIM_CONFIG?.trustGrowth?.increment ?? 1;
          s.trustMap.set(t.id, prev + inc);
        } else if (e.status === 'denied' || e.status === 'expired') {
          const dec = SIM_CONFIG?.trustGrowth?.decrement ?? 1;
          s.trustMap.set(t.id, Math.max(0, prev - dec));
        }
      }
    }

    for (const agent of agents) agent.update();

    if (running) {
      generationTimer++;
      if (generationTimer >= __genInterval()) {
        evolveGeneration();
        generationTimer = 0;
      }
    }

    fill(0); noStroke(); textSize(14); textAlign(CENTER, CENTER);
    let msg = 'Validation mode – running without rendering';
    msg += `\nScenario: ${scenario}  Generation: ${generation}`;
    if (batchMode) msg += `  Run: ${batchIndex + 1}/${batchTotalRuns}`;
    text(msg, width / 2, height / 2);
    return;
  }

  // Normal path
  agentMap.clear();
  for (const a of agents) agentMap.set(a.id, a);
  window.agents = agents; window.agentMap = agentMap;

  drawTraitBars();
  drawLabels();

  if (isPaused) {
    for (const vec of obligationVectors) vec.display();
    if (enableAffiliationHeatmap) drawAffiliationHeatmap();
    if (enableConflictHeatmap) drawConflictHeatmap();
    for (const agent of agents) agent.display();
    drawLegend();
    drawDebtConflictGraph();
    return;
  }

  __kickForcesJob();

  // Apply forces from workers
  if (__forcesResult && Array.isArray(__forcesResult)) {
    const n = Math.min(agents.length, Math.floor(__forcesResult.length / 2));
    for (let i = 0; i < n; i++) {
      const fx = __forcesResult[2 * i], fy = __forcesResult[2 * i + 1];
      agents[i].applyExternalForce(fx, fy);
    }
    __forcesResult = null;
  }

  // Apply enforce from workers
  if (__enforceResult && Array.isArray(__enforceResult)) {
    for (let i = 0; i < Math.min(obligationVectors.length, __enforceResult.length); i++) {
      const vec = obligationVectors[i];
      const status = __enforceResult[i];
      if (!status) continue;
      const s = vec.source, t = vec.target;

      if (s) {
        s.obligationAttempts = (s.obligationAttempts || 0) + 1;
        s.relationalLedger = s.relationalLedger || new Map();
        if (t) s.relationalLedger.set(t.id, status);
      }
      if (status === 'fulfilled') {
        if (s) s.obligationSuccesses = (s.obligationSuccesses || 0) + 1;
      } else if (status === 'denied') {
        if (s && s.incrementContradictionDebt) s.incrementContradictionDebt('denied');
      }
      if (s && t) {
        s.trustMap = s.trustMap || new Map();
        const prev = s.trustMap.get(t.id) || 0;
        if (status === 'fulfilled') {
          const inc = SIM_CONFIG?.trustGrowth?.increment ?? 1;
          s.trustMap.set(t.id, prev + inc);
        } else if (status === 'denied' || status === 'expired') {
          const dec = SIM_CONFIG?.trustGrowth?.decrement ?? 1;
          s.trustMap.set(t.id, Math.max(0, prev - dec));
        }
      }
      obligationLog.push({ generation, from: s?.id, to: t?.id, norm: vec.norm, status });
    }
    __enforceResult = null;
  }

  // Render obligations + sync enforce if no workers
  for (const vec of obligationVectors) vec.display();
  if (!__kickEnforceJob()) {
    const __oblStart = obligationLog.length;
    for (const vec of obligationVectors) { vec.enforce({ generation, obligationLog }); vec.display(); }
    const __new = obligationLog.slice(__oblStart);
    for (const e of __new) {
      const s = agentMap.get(e.from);
      const t = agentMap.get(e.to);
      if (!s) continue;
      s.obligationAttempts = (s.obligationAttempts || 0) + 1;
      s.relationalLedger = s.relationalLedger || new Map();
      if (t) s.relationalLedger.set(t.id, e.status);
      if (e.status === 'fulfilled') {
        s.obligationSuccesses = (s.obligationSuccesses || 0) + 1;
      } else if (e.status === 'denied' && s.incrementContradictionDebt) {
        s.incrementContradictionDebt('denied');
      }
      if (t) {
        s.trustMap = s.trustMap || new Map();
        const prev = s.trustMap.get(t.id) || 0;
        if (e.status === 'fulfilled') {
          const inc = SIM_CONFIG?.trustGrowth?.increment ?? 1;
          s.trustMap.set(t.id, prev + inc);
        } else if (e.status === 'denied' || e.status === 'expired') {
          const dec = SIM_CONFIG?.trustGrowth?.decrement ?? 1;
          s.trustMap.set(t.id, Math.max(0, prev - dec));
        }
      }
    }
  }

  if (enableAffiliationHeatmap) drawAffiliationHeatmap();
  if (enableConflictHeatmap) drawConflictHeatmap();

  for (const agent of agents) {
    agent.update();
    agent.updateConflictAndDebt();
    agent.display();
  }

  // Tooltip
  for (const agent of agents) {
    if (dist(mouseX, mouseY, agent.pos.x, agent.pos.y) < (agent.visualRadius || agent.r)) {
      fill(255); stroke(100);
      rect(mouseX + 10, mouseY - 10, 160, 84, 8);
      noStroke(); fill(0); textSize(11); textAlign(LEFT, TOP);
      text(
        `Agent #${agent.id}\nNorm: ${agent.normPreference}\nBelief: ${Number(agent.belief ?? 0).toFixed(2)}\nCA/EA: ${Number(agent.CA ?? 0).toFixed(2)} / ${Number(agent.EA ?? 0).toFixed(2)}\nTrust: ${agent.trustMap?.size ?? 0}\nDebt: ${Number(agent.contradictionDebt ?? 0).toFixed(2)}`,
        mouseX + 14, mouseY - 6
      );
      break;
    }
  }

  drawLegend();
  drawDebtConflictGraph();
  if (enableTrustHeatmap) drawTrustHeatmap();
  if (enableAgentTrails) drawTrails();

  if (running) {
    generationTimer++;
    if (generationTimer >= __genInterval()) {
      evolveGeneration();
      generationTimer = 0;
    }
  }
}

/* -------------------- Reset/init helpers -------------------- */
function resetSimulation() {
  falsifyFlags = [];
  interpretiveSummary = '';
  log = [];
  agentLog = [];
  obligationLog = [];
  generation = 0;
  generationTimer = 0;
  window.groupColors = {};
  initializeAgents();
  loadScenario(scenario);
  generateObligations();
  logGeneration(agents, generation, log);
  running = true;
}

function updateAffiliations() {
  for (const agent of agents) {
    const groupScores = {};
    (agent.trustMap || new Map()).forEach((trust, id) => {
      const neighbour = agentMap.get(id);
      if (neighbour) {
        const group = neighbour.affiliation || `pref_${neighbour.normPreference}`;
        groupScores[group] = (groupScores[group] || 0) + trust;
      }
    });
    let bestGroup = agent.affiliation;
    let maxScore = -Infinity;
    for (const group in groupScores) {
      const score = groupScores[group];
      if (score > maxScore) { maxScore = score; bestGroup = group; }
    }
    if (Object.keys(groupScores).length === 0) bestGroup = `pref_${agent.normPreference}`;
    if (!window.groupColors[bestGroup]) {
      window.groupColors[bestGroup] = color(random(100, 255), random(100, 255), random(100, 255), 220);
    }
    agent.affiliation = bestGroup;
  }
}

function updateScenarios() {
  for (const agent of agents) agent.scenarioGroup = classifyScenario(agent);
}

function updateGroupDynamics() {
  hostilePairs.clear();
  const groupMembers = {};
  for (const agent of agents) {
    const g = agent.affiliation;
    if (!groupMembers[g]) groupMembers[g] = [];
    groupMembers[g].push(agent);
  }
  const groups = Object.keys(groupMembers);
  const mergeThreshold = 3;
  const hostileThreshold = 0.5;
  const mergeTargets = {};
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const g1 = groups[i], g2 = groups[j];
      let trustSum = 0, count = 0;
      for (const a of groupMembers[g1]) for (const b of groupMembers[g2]) { trustSum += (a.trustMap?.get(b.id) || 0); count++; }
      for (const a of groupMembers[g2]) for (const b of groupMembers[g1]) { trustSum += (a.trustMap?.get(b.id) || 0); count++; }
      const avgTrust = count > 0 ? trustSum / count : 0;
      if (avgTrust < hostileThreshold) {
        const key = [g1, g2].sort().join('|'); hostilePairs.add(key);
      } else if (avgTrust > mergeThreshold) {
        const size1 = groupMembers[g1].length, size2 = groupMembers[g2].length;
        if (size1 >= size2) mergeTargets[g2] = g1; else mergeTargets[g1] = g2;
      }
    }
  }
  for (const [from, to] of Object.entries(mergeTargets)) {
    for (const agent of (groupMembers[from] || [])) agent.affiliation = to;
    delete window.groupColors[from];
  }
}

function applyBatchConfig(cfg) {
  if (!cfg) return;
  scenario = cfg.scenario;
  enableMoralRepair = !!cfg.combo.enableMoralRepair;
  enableDirectedEmergence = !!cfg.combo.enableDirectedEmergence;
  enableNonReciprocalTargeting = !!cfg.combo.enableNonReciprocalTargeting;
  enableTrustHeatmap = false;
  enableAgentTrails = false;
}

function initializeAgents() {
  agents = [];
  const count = parseInt(advancedSettings.numAgents) || SIM_CONFIG.numAgents || 100;
  for (let i = 0; i < count; i++) {
    const agent = new Agent(globalAgentIndex++);
    agent.birthGeneration = generation;
    const dist = (advancedSettings.defaultNormDistribution || 'uniform');
    if (dist !== 'uniform') {
      const target = dist;
      if (random() < 0.6) agent.normPreference = target;
      else {
        const others = normTypes.filter(n => n !== target);
        if (others.length) agent.normPreference = random(others);
      }
    }
    agents.push(agent);
  }
  for (const agent of agents) {
    agent.scenarioGroup = scenario;
    agent.affiliation = `pref_${agent.normPreference}`;
    if (!window.groupColors[agent.affiliation]) {
      window.groupColors[agent.affiliation] = color(random(100, 255), random(100, 255), random(100, 255), 220);
    }
  }
  for (const agent of agents) {
    if (advancedSettings.memoryBase) {
      const base = Number(advancedSettings.memoryBase);
      const minVal = Math.max(0.1, base - 0.2);
      const maxVal = Math.min(1.0, base + 0.2);
      agent.memoryLength = random(minVal, maxVal);
    }
    if (advancedSettings.moralStanceDistribution) {
      const dist = advancedSettings.moralStanceDistribution;
      if (dist === 'reactive-biased') agent.moralStance = random() < 0.7 ? 'reactive' : 'proactive';
      else if (dist === 'proactive-biased') agent.moralStance = random() < 0.7 ? 'proactive' : 'reactive';
    }
  }
}

function loadScenario(type) {
  const fn = SCENARIO_FUNCTIONS[type];
  if (!fn) return;
  for (const agent of agents) fn(agent);
}

function generateObligations() {
  obligationVectors = [];
  if (!agents || agents.length < 2) return;
  const maxVectors = Number(SIM_CONFIG.obligation?.maxVectors ?? 500);
  const multiplier = Number(SIM_CONFIG.obligation?.countMultiplier ?? 2);
  const proximity = Number(advancedSettings.proximityThreshold || SIM_CONFIG.enforcementRules?.proximityThreshold || 150);
  const vectorCount = Math.min(agents.length * multiplier, maxVectors);
  for (let i = 0; i < vectorCount; i++) {
    const source = random(agents);
    let nearby = agents.filter(a => a !== source && p5.Vector.dist(a.pos, source.pos) < proximity);
    nearby = nearby.filter(a => {
      const key = [source.affiliation, a.affiliation].sort().join('|');
      return !hostilePairs.has(key);
    });
    if (!nearby.length) continue;
    const target = random(nearby);
    const strength = random(0.2, 1.0);
    const norm = random(normTypes);
    obligationVectors.push(new ObligationVector(source, target, strength, norm));
  }
}

/* -------------------- Generation tick -------------------- */
function evolveGeneration() {
  // Death
  agents = agents.filter(agent => {
    const age = generation - (agent.birthGeneration || 0);
    const baseDeathRate = SIM_CONFIG.death?.baseRate ?? 0.05;
    const conflictWeight = SIM_CONFIG.death?.conflictWeight ?? 0.01;
    const oldAgeBoostBase = SIM_CONFIG.death?.oldAgeBoost ?? 0.05;
    const ageThreshold = SIM_CONFIG.death?.ageThreshold ?? 5;

    const conflictPenalty = Math.min((agent.internalConflict || 0) * conflictWeight, 0.1);
    const oldAgeBoost = age > ageThreshold ? oldAgeBoostBase * (age - ageThreshold) : 0;
    const deathChance = baseDeathRate + conflictPenalty + oldAgeBoost;
    return random() >= deathChance;
  });
  for (const agent of agents) agent.updateConflictAndDebt();

  // Map, step, and obligations
  agentMap.clear();
  for (const a of agents) agentMap.set(a.id, a);

  generation++;
  generateObligations();

  // Norm drift
  for (const agent of agents) {
    if (random() < 0.02) {
      const others = normTypes.filter(n => n !== agent.normPreference);
      if (others.length) agent.normPreference = random(others);
    }
  }
  updateScenarios();
  updateAffiliations();
  updateGroupDynamics();

  // Biography + falsifiability + per-agent CSV row
  for (const agent of agents) {
    agent.recordBiography(generation);
    agent.updateConflictAndDebt();

    const ledgerVals = Array.from((agent.relationalLedger || new Map()).values());
    const fulfilled = ledgerVals.filter(v => v === 'fulfilled').length;
    const denied    = ledgerVals.filter(v => v === 'denied').length;
    const expired   = ledgerVals.filter(v => v === 'expired').length;
    const repaired  = ledgerVals.filter(v => v === 'repaired').length;

    for (const norm of normTypes) {
      const key = `${norm}Acknowledges`;
      agent.lastAcknowledgments = agent.lastAcknowledgments || {};
      if (agent[key] !== agent.lastAcknowledgments[norm]) {
        falsifyFlags.push(`Agent #${agent.id} changed ${norm} to ${agent[key]} @ Gen ${generation}`);
        agent.lastAcknowledgments[norm] = agent[key];
      }
    }

    const trustVals = Array.from((agent.trustMap || new Map()).values());
    const trustMax = trustVals.length ? Math.max(...trustVals) : 0;
    const trustCount = (agent.trustMap && agent.trustMap.size) ? agent.trustMap.size : 0;

    agentLog.push({
      generation,
      scenario,
      id: agent.id,
      normPref: agent.normPreference,
      aprioriAck: agent.aprioriAcknowledges,
      legalAck: agent.legalAcknowledges,
      careAck: agent.careAcknowledges,
      epistemicAck: agent.epistemicAcknowledges,
      attempts: agent.obligationAttempts || 0,
      successes: agent.obligationSuccesses || 0,
      conflict: agent.internalConflict || 0,
      debt: agent.contradictionDebt || 0,
      momentum: agent.culturalMomentum || 0,
      trustCount,
      trustMax,
      fulfilled,
      denied,
      expired,
      repaired,
      role: agent.role,
      temperament: agent.temperament,
      moralStance: agent.moralStance,
      scenarioGroup: agent.scenarioGroup,
      memoryLength: agent.memoryLength,
      affiliation: agent.affiliation,
      // EA/CA/belief:
      CA: (Number.isFinite(Number(agent?.CA)) ? Number(agent.CA) : null),
      EA: (Number.isFinite(Number(agent?.EA)) ? Number(agent.EA) : null),
      belief: (Number.isFinite(Number(agent?.belief)) ? Number(agent.belief) : null),
      enableMoralRepair: !!TOGGLES.enableMoralRepair,
      enableDirectedEmergence: !!TOGGLES.enableDirectedEmergence,
      enableNonReciprocalTargeting: !!TOGGLES.enableNonReciprocalTargeting,
      batchRun: (typeof batchIndex !== 'undefined' ? batchIndex : null)
    });
  }

  // Aggregate + optional heartbeat
  logGeneration(agents, generation, log);
  exportAndSubmitRun(log, agents, scenario);

  // Batch handling
  if (batchMode && generation >= batchGenerations) {
    const agentLogCopy = agentLog.slice();
    const obligationLogCopy = obligationLog.slice();
    const cfg = batchRunsSequence[batchIndex] || { scenario };
    const runNum = batchIndex + 1;

    for (const row of agentLogCopy) { row.run = runNum; row.batchScenario = cfg.scenario; }
    for (const row of obligationLogCopy) { row.run = runNum; row.batchScenario = cfg.scenario; }

    batchAgentLog.push(...agentLogCopy);
    batchObligationLog.push(...obligationLogCopy);

    batchIndex++;
    if (batchIndex < batchTotalRuns) {
      applyBatchConfig(batchRunsSequence[batchIndex]);
      resetSimulation();
    } else {
      batchMode = false;
      validationMode = false;
      running = false;

      if (batchAgentLog.length > 0) downloadAgentLog(batchAgentLog, 'batch_runs');
      if (batchObligationLog.length > 0) downloadObligationLog(batchObligationLog, 'batch_runs');

      exportAndSubmitRunFinal({
        agents,
        scenario: 'batch_runs',
        agentLog: batchAgentLog,
        obligationLog: batchObligationLog,
        allowSubmission: !!SIM_CONFIG.allowSubmission
      });

      interpretiveSummary = generateInterpretiveSummary(log, agents, scenario);
      summaryPopup?.remove();
      summaryPopup = createDiv(interpretiveSummary)
        .style('position', 'absolute')
        .style('top', '60px')
        .style('left', '50%')
        .style('transform', 'translateX(-50%)')
        .style('background', '#ffffff')
        .style('padding', '12px')
        .style('border', '1px solid #ccc')
        .style('border-radius', '8px')
        .style('max-width', '440px')
        .style('z-index', '1000');
    }
  }

  // Moral repair
  if (enableMoralRepair) {
    const repairChance = SIM_CONFIG.repairChance ?? 0.1;
    for (const agent of agents) {
      const ledger = agent.relationalLedger || new Map();
      for (const [targetID, status] of ledger.entries()) {
        if ((status === 'denied' || status === 'expired') && random() < repairChance) {
          ledger.set(targetID, 'repaired');
          obligationLog.push({ status: 'repaired', norm: 'n/a', from: agent.id, to: targetID, generation });
        }
      }
    }
  }

  // Reproduction
  const offspring = [];
  for (const parent of agents) {
    const capOK = (SIM_CONFIG.populationCap == null) ? true : ((agents.length + offspring.length) < SIM_CONFIG.populationCap);
    if (capOK && random() < (SIM_CONFIG.reproduction?.chance ?? 0.25)) {
      const child = new Agent(globalAgentIndex++);
      const mutationRate = (SIM_CONFIG.reproduction?.mutationBase ?? 0.05) +
                           (SIM_CONFIG.reproduction?.maxConflictMutation ?? 0.1) * (parent.internalConflict || 0);
      for (const norm of normTypes) {
        const key = `${norm}Acknowledges`;
        child[key] = (random() < (1 - mutationRate)) ? parent[key] : (random() > 0.5);
      }
      const inheritPrefP = SIM_CONFIG.reproduction?.preferenceInheritance ?? 0.75;
      child.normPreference = (random() < inheritPrefP) ? parent.normPreference : random(normTypes);
      child.scenarioGroup = parent.scenarioGroup;
      child.affiliation = parent.affiliation;
      child.culturalMomentum = constrain((parent.culturalMomentum || 0.5) + random(-0.1, 0.1), 0.1, 1.0);
      child.birthGeneration = generation;
      offspring.push(child);
    }
  }
  agents = agents.concat(offspring);
}

/* -------------------- Forces/enforce jobs -------------------- */
function __kickForcesJob() {
  if (!__pool || __forcesPromise) return null;
  try {
    const n = agents.length;
    const pos = new Float32Array(n * 2);
    const vel = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = agents[i];
      pos[2 * i] = a.pos.x; pos[2 * i + 1] = a.pos.y;
      vel[2 * i] = a.vel.x; vel[2 * i + 1] = a.vel.y;
    }
    const params = {
      cohesion: SIM_CONFIG.forceParams?.cohesion ?? 0.02,
      separation: SIM_CONFIG.forceParams?.separation ?? 0.05,
      alignment: SIM_CONFIG.forceParams?.alignment ?? 0.02,
      trustAttraction: SIM_CONFIG.forceParams?.trustAttraction ?? 0.05,
      width, height
    };
    const chunkSize = Math.max(16, Math.ceil(n / (navigator.hardwareConcurrency || 4)));
    const chunks = [];
    for (let start = 0; start < n; start += chunkSize) {
      const end = Math.min(n, start + chunkSize);
      chunks.push({ start, end, positions: pos, velocities: vel, params });
    }
    __forcesPromise = __pool.map(chunks, 'forces')
      .then(r => { __forcesResult = r; __forcesPromise = null; })
      .catch(e => { console.warn('Parallel force compute failed', e); __forcesPromise = null; });
    return null;
  } catch (e) {
    console.warn('Parallel force compute failed', e);
  }
}

function __kickEnforceJob() {
  if (!__pool || __enforcePromise) return !!__pool;
  try {
    const edges = obligationVectors.map(vec => {
      const s = vec.source, t = vec.target, norm = vec.norm;
      const prox = SIM_CONFIG.enforcementRules?.proximityThreshold ?? 150;
      const srcAck = (s && (s[`${norm}Acknowledges`] !== undefined)) ? !!s[`${norm}Acknowledges`] : true;
      const tgtAck = (t && (t[`${norm}Acknowledges`] !== undefined)) ? !!t[`${norm}Acknowledges`] : true;
      return {
        from: s?.id, to: t?.id, norm,
        strength: vec.strength ?? 0.5, proxThresh: prox,
        sx: s?.pos?.x ?? 0, sy: s?.pos?.y ?? 0,
        tx: t?.pos?.x ?? 0, ty: t?.pos?.y ?? 0,
        srcAck, tgtAck
      };
    });
    const chunkSize = Math.max(128, Math.ceil(edges.length / (navigator.hardwareConcurrency || 4)));
    const chunks = [];
    for (let i = 0; i < edges.length; i += chunkSize) {
      chunks.push({ edges: edges.slice(i, i + chunkSize) });
    }
    __enforcePromise = __pool.map(chunks, 'enforce')
      .then(st => { __enforceResult = st; __enforcePromise = null; })
      .catch(e => { console.warn('Parallel enforce failed', e); __enforcePromise = null; });
    return true;
  } catch (e) {
    console.warn('Parallel enforce failed', e);
    return false;
  }
}

/* -------------------- UI panels & visuals -------------------- */
function drawLabels() {
  const x = 20; let y = 20; const lineHeight = 18;
  fill(0); textAlign(LEFT); textSize(12); noStroke();

  const metrics = [
    `Generation: ${generation}`,
    `Agents: ${agents.length}`,
    `Scenario: ${scenario.charAt(0).toUpperCase() + scenario.slice(1)}`,
    `Moral Repair: ${enableMoralRepair ? 'On' : 'Off'}`,
    `Directed Norms: ${enableDirectedEmergence ? 'On' : 'Off'}`,
    `Vulnerability Targeting: ${enableNonReciprocalTargeting ? 'On' : 'Off'}`
  ];
  if (batchMode) metrics.push(`Batch Run: ${batchIndex + 1}/${batchTotalRuns}`);

  const scenarioCounts = {};
  for (const a of agents) scenarioCounts[a.scenarioGroup || 'n/a'] = (scenarioCounts[a.scenarioGroup || 'n/a'] || 0) + 1;
  metrics.push(`Scenarios: ${Object.entries(scenarioCounts).map(([s,c]) => `${s}: ${c}`).join(', ')}`);

  const groupCounts = {};
  for (const a of agents) groupCounts[a.affiliation || 'n/a'] = (groupCounts[a.affiliation || 'n/a'] || 0) + 1;
  metrics.push(`Groups: ${Object.entries(groupCounts).map(([g,c]) => `${g}: ${c}`).join(', ')}`);

  if (log.length > 0) {
    const last = log[log.length - 1];
    const ri = 1 - ((Number(last.avgConflict ?? 0) + Number(last.avgDebt ?? 0)) / 2);
    metrics.push(
      `Fulfillment Rate: ${Number(last.fulfillmentRate ?? 0).toFixed(2)}`,
      `Relational Integrity: ${ri.toFixed(2)}`,
      `Contradiction Debt (Denied+Expired): ${Number(last.avgDebt ?? 0).toFixed(2)}`,
      `Internal Conflict: ${Number(last.avgConflict ?? 0).toFixed(2)}`,
      `Repair Events: ${last.repairEvents ?? 0}`,
      `Emergent Norms: ${last.emergentNorms ?? 0}`
    );
  }
  for (const line of metrics) { text(line, x, y); y += lineHeight; }

  if (falsifyFlags.length > 0) {
    fill(150, 0, 0); textSize(11);
    text(`⚠ Falsifiability Flags (${falsifyFlags.length}):`, x, y);
    y += lineHeight;
    falsifyFlags.slice(0, 3).forEach(flag => { text(`- ${flag}`, x + 10, y); y += lineHeight - 5; });
  }
}

function drawLegend() {
  const legendW = 210, lineH = 18, pad = 8, startX = width - legendW - 20;
  const shapeRows = Object.entries(VISUALS.shapesByRole || {});
  const stanceRows = Object.entries(VISUALS.outlineByStance || {});
  const agentFillRows = [
    ...normTypes.map(n => ({ label: `${n.charAt(0).toUpperCase() + n.slice(1)} (preferred)`, color: getNormColor(n, true) })),
    { label: 'Not Acknowledged', color: getNormColor(normTypes[0] || 'legal', false) }
  ];
  const obligationRows = [
    ...normTypes.map(n => ({ type: 'norm', label: n.charAt(0).toUpperCase() + n.slice(1), color: color(...(COLORS.norms[n] || [120, 120, 120])), weight: COLORS.obligations?.unfulfilledWeight ?? 1.2, dash: [] })),
    { type: 'style', label: 'Fulfilled', color: 0, weight: COLORS.obligations?.fulfilledWeight ?? 2.5, dash: [] },
    { type: 'style', label: 'Denied', color: 0, weight: COLORS.obligations?.unfulfilledWeight ?? 1.2, dash: COLORS.obligations?.dashDenied || [8,4] },
    { type: 'style', label: 'Expired', color: 0, weight: COLORS.obligations?.unfulfilledWeight ?? 1.2, dash: COLORS.obligations?.dashExpired || [3,6] }
  ];
  const notes = ['Size = trust + conflict + debt + momentum', 'Halo = total trust (stronger glow → more trusted)'];

  const shapeSectionH = (shapeRows.length + 1) * lineH + pad;
  const stanceSectionH = (stanceRows.length + 1) * lineH + pad;
  const agentFillH = (agentFillRows.length + 1) * lineH + pad;
  const obligationH = (obligationRows.length + 1) * lineH + pad;
  const notesH = (notes.length) * lineH + pad;
  const legendH = shapeSectionH + stanceSectionH + agentFillH + obligationH + notesH + pad * 2 + 6;
  const legendX = startX, legendY = height - legendH - 20;

  fill(255); stroke(180); rect(legendX, legendY, legendW, legendH, 6);

  let cx = legendX + pad, y = legendY + pad;
  fill(0); noStroke(); textSize(12); textAlign(LEFT, TOP);
  text('Legend', cx, y); y += lineH;

  text('Roles & Shapes:', cx, y); y += lineH;
  for (const [role, shape] of shapeRows) {
    fill(220); stroke(0, 160); strokeWeight(1); drawLegendShape(shape, cx + 10, y + 6, 8);
    noStroke(); fill(0); text(role, cx + 28, y); y += lineH;
  }
  y += pad;

  text('Outline → Moral stance:', cx, y); y += lineH;
  for (const [stance, style] of stanceRows) {
    noFill(); stroke(0, style.alpha); strokeWeight(style.weight); ellipse(cx + 10, y + 6, 16, 16);
    noStroke(); fill(0); text(stance, cx + 28, y); y += lineH;
  }
  y += pad;

  text('Agent Fill:', cx, y); y += lineH;
  for (const row of agentFillRows) {
    fill(row.color); stroke(0); strokeWeight(1); ellipse(cx + 10, y + 6, 12, 12);
    noStroke(); fill(0); text(row.label, cx + 28, y); y += lineH;
  }
  y += pad;

  text('Obligations:', cx, y); y += lineH;
  for (const row of obligationRows) {
    stroke(row.color || 0); strokeWeight(row.weight || 1.5);
    if (row.dash && row.dash.length) drawingContext.setLineDash(row.dash); else drawingContext.setLineDash([]);
    line(cx + 2, y + 6, cx + 32, y + 6);
    drawingContext.setLineDash([]);
    noStroke(); fill(0); text(row.label, cx + 40, y); y += lineH;
  }
  y += pad;

  fill(0);
  for (const note of notes) { text(note, cx, y); y += lineH; }
}

function drawLegendShape(shape, cx, cy, r) {
  push(); translate(cx, cy);
  switch (shape) {
    case 'square': rectMode(CENTER); rect(0, 0, r * 2, r * 2); break;
    case 'triangle': triangle(-r, r, 0, -r, r, r); break;
    case 'hex':
      beginShape(); for (let i = 0; i < 6; i++) { const a = (PI / 3) * i; vertex(cos(a) * r, sin(a) * r); } endShape(CLOSE);
      break;
    case 'circle': default: ellipse(0, 0, r * 2);
  }
  pop();
}

function drawTraitBars() {
  const margin = 20, barHeight = 18, spacing = 6, total = agents.length;
  if (!total) return;
  const counts = normTypes.map(norm => agents.filter(a => a[`${norm}Acknowledges`]).length);
  const avgMomentum = agents.reduce((s, a) => s + (a.culturalMomentum || 0), 0) / total;
  const barWidth = width - 2 * margin;
  const startY = height - margin - (normTypes.length + 1) * (barHeight + spacing);
  normTypes.forEach((norm, i) => {
    const y = startY + i * (barHeight + spacing);
    const normColour = getNormColor(norm, true);
    fill(normColour); rect(margin, y, (counts[i] / total) * barWidth, barHeight);
    fill(0); textSize(12); textAlign(LEFT, CENTER);
    text(`${norm.charAt(0).toUpperCase() + norm.slice(1)} (${counts[i]}/${total})`, margin + 5, y + barHeight / 2);
  });
  const momentumY = startY + normTypes.length * (barHeight + spacing);
  fill(180); rect(margin, momentumY, avgMomentum * barWidth, barHeight);
  fill(0); textAlign(LEFT, CENTER); text(`Avg Momentum: ${avgMomentum.toFixed(2)}`, margin + 5, momentumY + barHeight / 2);
}

function drawDebtConflictGraph() {
  const graphWidth = 260, graphHeight = 80, xOffset = width - graphWidth - 20, yOffset = 40;
  const maxPoints = Math.floor(graphWidth / 3);
  const recentLog = log.slice(-maxPoints);
  const maxConflict = Math.max(...recentLog.map(e => Number(e.avgConflict ?? 0)), 0.01);
  const maxDebt = Math.max(...recentLog.map(e => Number(e.avgDebt ?? 0)), 0.01);
  const yMax = Math.max(maxConflict, maxDebt);
  noStroke(); fill(255, 240); rect(xOffset - 10, yOffset - 30, graphWidth + 20, graphHeight + 50, 12);
  fill(0); textSize(10); text('Conflict / Debt (scaled)', xOffset, yOffset - 12);
  noFill(); stroke(200, 50, 50);
  beginShape(); for (let i = 0; i < recentLog.length; i++) { const y = map(Number(recentLog[i].avgConflict ?? 0), 0, yMax, yOffset + graphHeight, yOffset); vertex(xOffset + i * 3, y); } endShape();
  stroke(50, 50, 200);
  beginShape(); for (let i = 0; i < recentLog.length; i++) { const y = map(Number(recentLog[i].avgDebt ?? 0), 0, yMax, yOffset + graphHeight, yOffset); vertex(xOffset + i * 3, y); } endShape();
  noStroke(); fill(200, 50, 50); text('Conflict', xOffset, yOffset + graphHeight + 12);
  fill(50, 50, 200); text('Debt', xOffset + 80, yOffset + graphHeight + 12);
}

function showInterpretivePopup() {
  summaryPopup.html(`
    <div style="text-align:right;">
      <button onclick="document.getElementById('summary-popup').style.display='none'" style="font-size:16px;">✖</button>
    </div>
    <div>${interpretiveSummary.replace(/\n/g, '<br>')}</div>
  `);
  summaryPopup.style('display', 'block');
}

function showAboutPopup() {
  const html = `
    <div style="text-align:right;">
      <button onclick="document.getElementById('about-popup').style.display='none'" style="font-size:16px;">✖</button>
    </div>
    <div style="max-height:60vh; overflow-y:auto;">
      <p><strong>About the Relational Obligation Simulation</strong></p>
      <p>This interactive model is inspired by the ontological framework described in <em>The Geometry of the Good</em>...</p>
    </div>
  `;
  aboutPopup.html(html);
  aboutPopup.style('display', 'block');
}

/* -------------------- Bind p5 -------------------- */
window.setup = setup;
window.draw = draw;
