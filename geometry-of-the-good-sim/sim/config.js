// sim/config.js
//
// Hybrid module: provides ES module exports for importers AND writes
// window.* globals so classic scripts can read the same settings.
// Also includes the Cognitive–Epistemic (EA/CA) configuration block.

export const SIM_CONFIG = {
  /* --- Performance profiles --- */
  performanceProfiles: {
    normal: {
      validationMode: false,
      renderEvery: 1,
      logSample: 0.10,
      snapshotEvery: 250,
      generationInterval: 100,
      obligation: { targetDegree: 6, maxVectors: 500 }
    },
    deepTime: {
      forceFullMetrics: true,
      validationMode: true,
      renderEvery: 0,
      logSample: 0.02,
      snapshotEvery: 1000,
      generationInterval: 1,
      obligation: { targetDegree: 7, maxVectors: 200000 }
    }
  },
  activeProfile: 'normal',

  /* --- Canvas + population --- */
  canvasWidth: 1200,
  canvasHeight: 800,
  numAgents: 100,
  populationCap: null,
  generationInterval: 100,
  maxGenerations: 100,

  /* --- Norm types --- */
  normTypes: ['legal', 'apriori', 'care', 'epistemic'],

  /* --- Force parameters (flocking) --- */
  forceParams: {
    cohesion: 0.02,
    separation: 0.05,
    alignment: 0.02,
    trustAttraction: 0.05
  },

  /* --- Submission / run meta --- */
  allowSubmission: true,
  submitStreaming: false,
  runTags: [],

  /* --- Layout --- */
  margins: { left: 180, right: 20, top: 50, bottom: 150 },

  /* --- Obligation dynamics --- */
  obligation: {
    proximityThreshold: 150,
    countMultiplier: 2,
    maxVectors: 500
  },
  enforcementRules: {
    expirationBase: 10,
    expirationRandom: 10,
    proximityThreshold: 150
  },
  trustGrowth: { increment: 1, decrement: 1 },
  memoryDecay: 1.0,

  /* --- Reproduction, death, repair --- */
  reproduction: {
    chance: 0.25,
    mutationBase: 0.05,
    maxConflictMutation: 0.1,
    preferenceInheritance: 0.75
  },
  death: {
    baseRate: 0.05,
    conflictWeight: 0.01,
    oldAgeBoost: 0.05,
    ageThreshold: 5
  },
  repairChance: 0.1,

  /* --- Cognitive–Epistemic layer (EA/CA) --- */
  epistemic: {
    enabled: true,
    // agent trait distributions (used by your seeding code / patch)
    meanCA: 0.75,
    meanEA: 0.50,
    varCA: 0.15,
    varEA: 0.15,

    // interaction & evidence dynamics
    boundedConfidence: 0.05,  // ε
    noiseSigma: 0.01,         // Gaussian noise on beliefs
    eWeight: 0.05,            // external evidence weight
    truth: 0.70,              // single-truth anchor in [0,1]

    // trust multipliers for social mixing
    inTrust: 1.8,
    outTrust: 0.6,

    // optional plural environment (dual anchors)
    dualMode: false,
    truthA: 0.25,
    truthB: 0.85,
    envMixA: 0.5,             // fraction of updates pulled to A vs B

    // backfire (repulsion when disagreement > theta)
    backfire: {
      theta: 0.25,
      prob: 0.20,
      gain: 0.60
    }
  }
};

/* --- Toggles --- */
export const TOGGLES = {
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

/* --- Batch settings --- */
export const BATCH_SETTINGS = {
  scenarios: ['pluralist', 'authoritarian', 'utopian', 'collapsed', 'anomic'],
  toggleCombos: [
    { moralRepair: true,  directed: false, targeting: false },
    { moralRepair: false, directed: true,  targeting: false },
    { moralRepair: true,  directed: true,  targeting: true  }
  ],
  generationsPerRun: 25,
  batchOutputDir: 'output/',
  logAgentBiographies: true,
  exportAgentLogCSV: true,
  exportMetaJSON: true,
  suppressCanvasRendering: true
};

/* --- Colours --- */
export const COLORS = {
  norms: {
    legal: [128, 0, 128],
    apriori: [0, 0, 255],
    care: [0, 150, 0],
    epistemic: [255, 165, 0]
  },
  agent: {
    baseAlpha: 220,
    noAckAlpha: 80
  },
  obligations: {
    lineAlpha: 100,
    fulfilledWeight: 2.5,
    unfulfilledWeight: 1.2,
    dashDenied: [8, 4],
    dashExpired: [3, 6]
  }
};

/* --- Visual mappings --- */
export const VISUALS = {
  size: {
    baseRadius: 8,
    minRadius: 6,
    maxRadius: 28,
    easing: 0.15,
    weights: {
      trustCount: 0.6,
      conflict: 0.3,
      debt: 0.2,
      momentum: 0.4
    },
    fulfillmentBump: 0
  },
  shapesByRole: {
    initiator: 'circle',
    responder: 'square',
    mediator: 'triangle',
    disruptor: 'hex'
  },
  outlineByStance: {
    reactive:  { weight: 1,   alpha: 180 },
    proactive: { weight: 2.5, alpha: 220 }
  },
  showTrustHalo: true,
  haloMaxAlpha: 70
};

/* --- Convenience export --- */
export const normTypes = SIM_CONFIG.normTypes;

/* --- Optional: server submit helper (kept from your original) --- */
export function submitRun(data) {
  if (!data || !data.agentLog || !data.obligationLog) {
    console.warn("Submission aborted: missing data.");
    return;
  }
  const payload = {
    tags: data.tags || [],
    agentLog: data.agentLog,
    obligationLog: data.obligationLog,
    summary: data.summary || {}
  };
  fetch("sim/api/submitRun.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.ok ? res.json() : Promise.reject(res))
  .then(response => console.log("✅ Run submitted:", response))
  .catch(err => console.error("❌ Submission failed:", err));
}

/* ------------------------------------------------------------------
   Write globals too, so classic scripts can read these immediately.
   This makes TOGGLES defined before sketch.js uses it, avoiding
   "Cannot read properties of undefined (reading 'enableMoralRepair')".
-------------------------------------------------------------------*/
if (typeof window !== 'undefined') {
  window.SIM_CONFIG   = SIM_CONFIG;
  window.TOGGLES      = TOGGLES;
  window.BATCH_SETTINGS = BATCH_SETTINGS;
  window.COLORS       = COLORS;
  window.VISUALS      = VISUALS;
  window.normTypes    = normTypes;
  window.submitRun    = submitRun;
}
