// config.js
//
// This module centralizes all global settings, toggles, batch options and
// colour definitions used throughout the simulation. Keeping these values in
// one place makes it easy to tune the behaviour of the experiment or create
// reproducible batches of runs without touching the core logic.  Many of
// these parameters were derived from the original monolithic sketch but
// extracted here to improve modularity and maintainability.

export const SIM_CONFIG = {
  // --- Performance profiles for normal vs deep-time large-N runs ---
  performanceProfiles: {
    normal: {
      validationMode: false,
      renderEvery: 1,
      logSample: 0.10,
      snapshotEvery: 250,
      generationInterval: 100,
      obligation: { targetDegree: 6, maxVectors: 500 
  }
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

  // Canvas dimensions are used when a fixed size is desired.  When running
  // inside the browser the sketch will still resize to the available
  // viewport; these values act as sensible defaults for standalone runs.
  canvasWidth: 1200,
  canvasHeight: 800,

  // The starting number of agents.  Note that the simulation allows
  // reproduction and death so the population may grow or shrink over time.
  numAgents: 100,

  // Optional hard cap on total population; null = uncapped
  populationCap: null,

  // Frames per generation.  A generation encapsulates an update, logging
  // and obligation refresh cycle.  Lower values cause generations to
  // advance more frequently.
  generationInterval: 100,

  // Maximum number of generations to simulate before a batch run terminates.
  maxGenerations: 100,

  // Available norm types.  Each agent acknowledges (or not) each of these
  // norms individually and also selects one as its preferred norm.  Adding
  // new entries here will automatically propagate throughout the system.
  normTypes: ['legal', 'apriori', 'care', 'epistemic'],

  // Force parameters control the flocking-style motion of the agents.  These
  // values correspond to cohesion, separation and alignment strengths.  A
  // trustAttraction term biases motion towards trusted peers.  Feel free
  // to experiment with these values or expose them via the GUI.
  forceParams: {
    cohesion: 0.02,
    separation: 0.05,
    alignment: 0.02,
    trustAttraction: 0.05
  },

  // ▼▼▼ NEW: Cognitive–Epistemic settings (CA×EA layer) ▼▼▼
  epistemic: {
    enabled: true,        // master toggle

    // Social trust weights
    inTrust: 1.8,         // weight for same-group peers
    outTrust: 0.6,        // weight for out-group peers

    // Bounded confidence & process noise
    epsilon: 0.05,        // ignore peers beyond this belief distance
    noise: 0.01,          // Gaussian process noise on belief updates
    eWeight: 0.05,        // weight on external evidence vs social mix

    // Evidence channel (single or dual anchors)
    truth: 0.7,           // single anchor when dualMode=false
    dualMode: false,      // if true, draw from {truthA, truthB}
    truthA: 0.4,
    truthB: 0.8,
    envMixA: 0.5,         // environment share of anchor A (0..1)
    truthNoise: 0.00,     // observation noise on evidence
    truthBias: 0.00,      // global evidence bias

    // Backfire dynamics (repulsion on strong disagreement)
    backfire: { theta: 0.25, prob: 0.10, gain: 1.0 }
  },
  // ▲▲▲ END new block ▲▲▲

  allowSubmission: true,        // enable CSV uploads to server when Stop/batch finishes
  submitStreaming: false,       // keep per-generation "heartbeat" OFF (no background posts)
  runTags: [],

  margins: {
    left: 180,
    right: 20,
    top: 50,
    bottom: 150
  },

  // Obligation settings control how many vectors are generated, their
  // proximity filter and maximum count.  These values mirror those in
  // the original sketch but are surfaced here for easy tuning.
  obligation: {
    proximityThreshold: 150,
    countMultiplier: 2,
    maxVectors: 500
  },

  // Enforcement rules control the temporal dynamics of obligations.
  // expirationBase defines the minimum lifespan of an obligation in
  // generations; expirationRandom adds a uniformly random range to
  // create variability.  Should you wish to experiment with longer or
  // shorter obligations, adjust these values.  proximityThreshold is
  // duplicated here for completeness but overridden by advanced
  // settings if provided by the GUI.
  enforcementRules: {
    expirationBase: 10,
    expirationRandom: 10,
    proximityThreshold: 150
  },

  // Trust growth defines how much trust increments or decrements when
  // obligations are fulfilled or denied.  Fine tuning these values
  // allows researchers to model more sensitive or resilient trust
  // dynamics.
  trustGrowth: {
    increment: 1,
    decrement: 1
  },

  // Memory decay influences how long obligations remain in an
  // agent's relational ledger.  Larger values yield longer
  // memories; lower values cause agents to forget past interactions
  // more quickly.  This field is reserved for future extensions.
  memoryDecay: 1.0,

  // Reproduction settings govern how often agents reproduce, how strongly
  // conflict influences mutation and how norm preferences are inherited.
  reproduction: {
    chance: 0.25,
    mutationBase: 0.05,
    maxConflictMutation: 0.1,
    preferenceInheritance: 0.75
  },

  // Mortality settings govern the likelihood of agent death.  Conflict
  // contributes to the death rate and older agents die more readily.
  death: {
    baseRate: 0.05,
    conflictWeight: 0.01,
    oldAgeBoost: 0.05,
    ageThreshold: 5
  },

  // The probability of a moral repair event occurring when obligations are
  // denied or expire.  A higher value increases the likelihood that
  // previously failed obligations will be repaired.
  repairChance: 0.1
};

// Toggle values control optional behavioural subroutines.  The GUI can
// enable or disable these flags at run time without restarting the
// simulation.
export const TOGGLES = { enableWorkers: true,
  enableMoralRepair: true,
  enableDirectedEmergence: false,
  enableNonReciprocalTargeting: false,
  enableHoverBios: true,
  enableTrustAttraction: true,
  enableObligationForces: true,
  showInterpretiveSummaryOnStop: true,
  showAgentTrails: false,
  // Toggle for the trust heatmap overlay.  When enabled, agents
  // radiate coloured halos whose intensity corresponds to the sum of
  // their trust relationships.  See sketch.js drawTrustHeatmap() for
  // implementation details.
  showTrustHeatmap: false,
  enableFalsifiabilityFlags: true,
  // Enable dry-run validation mode.  When this flag is true the
  // simulation skips rendering and performs consistency checks only.
  enableValidationMode: false
};

// Batch settings describe how to iterate through a collection of scenarios
// and toggle combinations without user interaction.  These values are
// consumed by external scripts (not provided here) that perform
// headless runs of the simulation.
export const BATCH_SETTINGS = {
  scenarios: ['pluralist', 'authoritarian', 'utopian', 'collapsed', 'anomic'],
  toggleCombos: [
    { moralRepair: true, directed: false, targeting: false },
    { moralRepair: false, directed: true, targeting: false },
    { moralRepair: true, directed: true, targeting: true }
  ],
  generationsPerRun: 25,
  batchOutputDir: 'output/',
  logAgentBiographies: true,
  exportAgentLogCSV: true,
  exportMetaJSON: true,
  suppressCanvasRendering: true
};

// Colour definitions used throughout the simulation.  p5.js colour objects
// are created on demand from these arrays; alpha values are handled
// separately in the rendering code.  Having a single location for
// colours ensures visual consistency between modules.
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

// Visual mappings for expressive agent rendering
export const VISUALS = {
  size: {
    // Starting circle radius (pixels)
    baseRadius: 8,
    // Clamp the dynamic size
    minRadius: 6,
    maxRadius: 28,
    // How quickly size eases toward the target [0..1]
    easing: 0.15,
    // Weighted contribution of metrics to size.
    // Tune these to emphasize different “stories” visually.
    weights: {
      trustCount: 0.6,  // # of trusted peers
      conflict: 0.3,    // internalConflict
      debt: 0.2,        // contradictionDebt
      momentum: 0.4     // culturalMomentum (0.1..1.0)
    },
    // Optional additive bump when the agent recently fulfilled obligations (reserved for future)
    fulfillmentBump: 0
  },

  // Which geometric shape to draw for each role
  shapesByRole: {
    initiator: 'circle',
    responder: 'square',
    mediator: 'triangle',
    disruptor: 'hex'
  },

  // Outline styling by moral stance (subtle cue)
  outlineByStance: {
    reactive:  { weight: 1,   alpha: 180 },
    proactive: { weight: 2.5, alpha: 220 }
  },

  // Optional glow that scales with total trust (cheap “halo”)
  showTrustHalo: true,
  haloMaxAlpha: 70
};

window.submitRun = function(data) {
  // Basic validation
  if (!data || !data.agentLog || !data.obligationLog) {
    console.warn("Submission aborted: missing data.");
    return;
  }

  // Construct payload
  const payload = {
    tags: data.tags || [],
    agentLog: data.agentLog,
    obligationLog: data.obligationLog,
    summary: data.summary || {}
  };

  // Send to server
  fetch("sim/api/submitRun.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.ok ? res.json() : Promise.reject(res))
  .then(response => {
    console.log("✅ Run submitted:", response);
    // Optionally show GUI confirmation here
  })
  .catch(err => {
    console.error("❌ Submission failed:", err);
  });
};

// Expose normTypes separately for convenience in other modules.
export const normTypes = SIM_CONFIG.normTypes;
