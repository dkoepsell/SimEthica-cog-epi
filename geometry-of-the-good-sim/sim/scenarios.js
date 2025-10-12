// scenarios.js
//
// This module encapsulates a dictionary of scenario functions that mutate
// agents to reflect different normative environments.  Each function
// accepts an agent instance and modifies its norm acknowledgments and
// preferences accordingly.  New scenarios can easily be added here
// without touching other modules.

// scenarios.js — use global variable instead of module import
const normTypes = window.normTypes;



/**
 * Utility to assign acknowledgments for all norms on an agent.  A truthy
 * value means the agent recognises that norm; a falsy value means it
 * disregards it.  Using a helper reduces duplication across scenarios.
 *
 * @param {Object} agent The agent whose acknowledgments will be set
 * @param {Function|boolean} assign A function returning a boolean for each
 *        norm or a constant boolean used for all norms
 */
function setAllAcknowledgments(agent, assign) {
  normTypes.forEach(norm => {
    const value = (typeof assign === 'function') ? assign(norm) : assign;
    agent[`${norm}Acknowledges`] = value;
  });
}

// Scenario implementations.  See the original monolithic loadScenario() for
// descriptions of these patterns.  Scenarios may alter both the
// acknowledgments and the preferred norm of the agent.
export const SCENARIO_FUNCTIONS = {
  // In a pluralist setting agents recognise each norm randomly.
  pluralist: (agent) => {
    setAllAcknowledgments(agent, () => random() > 0.5);
  },

  // Authoritarian societies privilege legal norms exclusively.
  authoritarian: (agent) => {
    agent.aprioriAcknowledges = false;
    agent.legalAcknowledges = true;
    agent.careAcknowledges = false;
    agent.epistemicAcknowledges = false;
  },

  // Utopian worlds acknowledge all norms.
  utopian: (agent) => {
    setAllAcknowledgments(agent, true);
  },

  // Collapsed worlds acknowledge none of the norms.
  collapsed: (agent) => {
    setAllAcknowledgments(agent, false);
  },

  // Anomic settings seldom acknowledge norms.  A 10% chance to recognise
  // each norm produces highly fragmented normative frameworks.
  anomic: (agent) => {
    setAllAcknowledgments(agent, () => random() > 0.1);
  },

  // All care: agents only acknowledge the care norm and prefer it.
  allCare: (agent) => {
    setAllAcknowledgments(agent, (norm) => norm === 'care');
    agent.normPreference = 'care';
  },

  // All legal: agents only acknowledge the legal norm and prefer it.
  allLegal: (agent) => {
    setAllAcknowledgments(agent, (norm) => norm === 'legal');
    agent.normPreference = 'legal';
  },

  // Agents never acknowledge the a priori norm; if their preference is
  // a priori they mutate to another random norm.
  noApriori: (agent) => {
    setAllAcknowledgments(agent, (norm) => norm !== 'apriori');
    if (agent.normPreference === 'apriori') {
      // Choose among the remaining norms
      const remaining = normTypes.filter(n => n !== 'apriori');
      agent.normPreference = random(remaining);
    }
  },

  // Asymmetry only: very few acknowledgments.  Half the agents will
  // acknowledge a single randomly chosen norm and prefer it, the other
  // half merely pick a random preference but acknowledge none.
  asymmetryOnly: (agent) => {
    setAllAcknowledgments(agent, false);
    if (random() < 0.5) {
      const n = random(normTypes);
      agent[`${n}Acknowledges`] = true;
      agent.normPreference = n;
    } else {
      agent.normPreference = random(normTypes);
    }
  },

  // Genocide shock: agents acknowledge no norms and pick a random
  // preference.  This scenario induces normative collapse.
  genocideShock: (agent) => {
    setAllAcknowledgments(agent, false);
    agent.normPreference = random(normTypes);
  }
};

// A helper returning the list of scenario keys.  The GUI uses this to
// populate its buttons.  Exporting the array separately avoids needing
// Object.keys() in multiple places and ensures consistent ordering.
export const SCENARIO_NAMES = Object.keys(SCENARIO_FUNCTIONS);