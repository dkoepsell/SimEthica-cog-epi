// norms.js
//
// Defensive norm registry + default enforcement.
// - Works even if a norm wasn't registered.
// - Auto-registers base norms from config.js on load.

// -----------------------------------------------------------------------------
// Browser-safe globals
// -----------------------------------------------------------------------------
const SIM_CONFIG = window.SIM_CONFIG || {};
const COLORS = window.COLORS || {};

// Exportable norm registry for agent.js and other modules
export const normRegistry = Object.create(null);

// Also expose to window for debugging (optional but helpful)
window.normRegistry = normRegistry;

// Safe fallback for norm types
const normTypes = (
  Array.isArray(window.normTypes) && window.normTypes.length > 0
)
  ? window.normTypes
  : (SIM_CONFIG.normTypes || ["legal", "apriori", "care", "epistemic"]);

// -----------------------------------------------------------------------------
// Norm registration and enforcement
// -----------------------------------------------------------------------------

/**
 * Register (or overwrite) a norm's behavior.
 * @param {string} name
 * @param {{color?: any, enforceFn?: Function, acknowledgeFn?: Function}} cfg
 */
export function registerNorm(name, cfg = {}) {
  normRegistry[name] = {
    color: cfg.color ?? COLORS?.norms?.[name],
    // Fall back to defaultEnforce if custom not supplied
    enforceFn: (typeof cfg.enforceFn === 'function')
      ? cfg.enforceFn
      : defaultEnforce,
    // Default acknowledgment: agent[`${name}Acknowledges`] (or true if missing)
    acknowledgeFn: (typeof cfg.acknowledgeFn === 'function')
      ? cfg.acknowledgeFn
      : (agent) => {
          const prop = `${name}Acknowledges`;
          return agent?.[prop] !== undefined ? !!agent[prop] : true;
        }
  };
}

// -----------------------------------------------------------------------------
// Initialize core norm types so all are always available
// -----------------------------------------------------------------------------
(function initBaseNorms() {
  for (const n of normTypes) {
    if (!normRegistry[n]) {
      registerNorm(n, { color: COLORS?.norms?.[n] });
    }
  }
})();

// -----------------------------------------------------------------------------
// Default enforcement rule
// -----------------------------------------------------------------------------
/**
 * Default enforcement used when a norm has no custom rule.
 * Returns: 'fulfilled' | 'denied' | 'pending'
 */
export function defaultEnforce(vec, { generation, obligationLog } = {}) {
  const source = vec?.source;
  const target = vec?.target;
  const norm   = vec?.norm;

  if (!source || !target || !norm) return 'pending';

  const entry = normRegistry?.[norm];
  const ackFn = (typeof entry?.acknowledgeFn === 'function') ? entry.acknowledgeFn : null;

  const srcAck = (ackFn ? ackFn(source) : (source?.[`${norm}Acknowledges`] ?? true));
  const tgtAck = (ackFn ? ackFn(target) : (target?.[`${norm}Acknowledges`] ?? true));

  // Proximity and probability modifiers
  const d = p5.Vector.dist(source.pos, target.pos);
  const proxThresh = SIM_CONFIG.enforcementRules?.proximityThreshold ?? 150;
  const proximityOK = d < proxThresh;

  let p = vec?.strength ?? 0.5;
  p *= proximityOK ? 1.0 : 0.6;
  p *= (srcAck && tgtAck) ? 1.0 : 0.5;

  // Clamp and roll
  p = constrain(p, 0.05, 0.98);
  return (random() < p) ? 'fulfilled' : 'denied';
}

// -----------------------------------------------------------------------------
// Optional debug exposure (safe no-ops in production)
// -----------------------------------------------------------------------------
window.registerNorm = registerNorm;
window.defaultEnforce = defaultEnforce;
