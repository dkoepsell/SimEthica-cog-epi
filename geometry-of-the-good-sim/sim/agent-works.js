// agent.js
//
// Contains the Agent and ObligationVector classes which embody the
// behavioural logic of the simulation. Each agent moves according to
// simple flocking rules and forms or fulfils obligations to other agents.
// The ObligationVector class mediates interactions between agents and
// records the outcome of those interactions.

import { SIM_CONFIG, COLORS, normTypes, VISUALS } from './config.js';
import { normRegistry, defaultEnforce } from './norms.js';

/**
 * Convert a norm type and acknowledgment flag into a p5 colour.
 */
export function getNormColor(norm, acknowledged) {
  const rgb = COLORS.norms[norm] || [120, 120, 120];
  const alpha = acknowledged ? COLORS.agent.baseAlpha : COLORS.agent.noAckAlpha;
  return color(rgb[0], rgb[1], rgb[2], alpha);
}

/**
 * Agent class
 */
export class Agent {
  constructor(id) {
    this.id = id;

    const { left, right, top, bottom } = SIM_CONFIG.margins;
    this.pos = createVector(random(left, width - right), random(top, height - bottom));
    this.vel = createVector();
    this.acc = createVector();

    // Legacy radius + smoothed visual radius for expressive rendering
    this.r = 10;
    this.visualRadius = VISUALS.size.baseRadius;

    this.vulnerability = random();
    this.wander = p5.Vector.random2D();

    // Norm acknowledgments
    normTypes.forEach(norm => {
      this[`${norm}Acknowledges`] = random() > 0.5;
    });

    // Preference & grouping
    this.normPreference = random(normTypes);
    this.scenarioGroup = this.normPreference;
    this.affiliation = `pref_${this.normPreference}`;

    // Display color (interpolates over time)
    this.displayColor = getNormColor(
      this.normPreference,
      this[`${this.normPreference}Acknowledges`]
    );
    this.lastPref = this.normPreference;

    // Track last acks for falsifiability
    this.lastAcknowledgments = {};
    normTypes.forEach(norm => {
      this.lastAcknowledgments[norm] = this[`${norm}Acknowledges`];
    });

    // Social state
    this.trustMap = new Map();
    this.relationalLedger = new Map();

    // Counters
    this.obligationAttempts = 0;
    this.obligationSuccesses = 0;

    // Internal metrics
    this.contradictionDebt = 0;
    this.internalConflict = 0;
    this.culturalMomentum = random(0.3, 1.0);

    // Traits
    const roles = ['initiator', 'responder', 'mediator', 'disruptor'];
    this.role = random(roles);
    this.temperament = random();
    this.moralStance = random(['reactive', 'proactive']);
    this.memoryLength = random(0.2, 1.0);

    // Visual aids
    this.trail = [];

    // Logs / biography
    this.narrativeLog = [];
    this.conflictLog = new Map();
    this.biography = [];

    this.birthGeneration = 0;
  }

  applyForce(force) { this.acc.add(force); }

  applyExternalForce(fx, fy) { this.acc.x += fx; this.acc.y += fy; }

  applyCohesionForce(neighbors = window.agents) {
    const { cohesion } = SIM_CONFIG.forceParams;
    let count = 0;
    const centre = createVector();
    for (const other of neighbors) {
      const d = p5.Vector.dist(this.pos, other.pos);
      if (other !== this && d < 60) { centre.add(other.pos); count++; }
    }
    if (count > 0) {
      centre.div(count);
      const desired = p5.Vector.sub(centre, this.pos);
      desired.setMag(cohesion);
      this.applyForce(desired);
    }
  }

  applyAlignmentForce(neighbors = window.agents) {
    const { alignment } = SIM_CONFIG.forceParams;
    let count = 0;
    const avgVel = createVector();
    for (const other of neighbors) {
      const d = p5.Vector.dist(this.pos, other.pos);
      if (other !== this && d < 60) { avgVel.add(other.vel); count++; }
    }
    if (count > 0) {
      avgVel.div(count);
      avgVel.setMag(alignment);
      this.applyForce(avgVel);
    }
  }

  applySeparationForce(neighbors = window.agents) {
    const { separation } = SIM_CONFIG.forceParams;
    let count = 0;
    const steer = createVector();
    for (const other of neighbors) {
      const d = p5.Vector.dist(this.pos, other.pos);
      if (other !== this && d < 24) {
        const diff = p5.Vector.sub(this.pos, other.pos);
        diff.normalize(); diff.div(d);
        steer.add(diff);
        count++;
      }
    }
    if (count > 0) {
      steer.div(count);
      steer.setMag(separation);
      this.applyForce(steer);
    }
  }

  incrementContradictionDebt(reason = "unspecified") { this.contradictionDebt++; }

  updateConflictAndDebt() {
    let conflict = 0, debt = 0;
    for (const status of this.relationalLedger.values()) {
      if (status === 'denied' || status === 'expired') debt++;
      if (status === 'denied') conflict++;
    }
    this.internalConflict = conflict;
    this.contradictionDebt = debt;
  }

  recordBiography(generation) {
    this.biography.push({
      generation,
      normPreference: this.normPreference,
      acknowledgments: normTypes.reduce((acc, n) => {
        acc[n] = this[`${n}Acknowledges`]; return acc;
      }, {}),
      trustCount: this.trustMap.size,
      trustMax: Math.max(...Array.from(this.trustMap.values()), 0),
      momentum: this.culturalMomentum,
      debt: this.contradictionDebt,
      conflict: this.internalConflict,
      role: this.role,
      temperament: this.temperament,
      moralStance: this.moralStance,
      memoryLength: this.memoryLength
    });
  }

  // --- Visual helpers ---

  computeVisualRadius() {
    const w = VISUALS.size.weights || {};
    const base = VISUALS.size.baseRadius;
    const trustCount = this.trustMap?.size || 0;
    const conflict = this.internalConflict || 0;
    const debt = this.contradictionDebt || 0;
    const momentum = this.culturalMomentum || 0;

    let delta =
      (w.trustCount || 0) * trustCount +
      (w.conflict   || 0) * conflict   +
      (w.debt       || 0) * debt       +
      (w.momentum   || 0) * momentum;

    let target = base + 0.7 * delta;
    target = constrain(target, VISUALS.size.minRadius, VISUALS.size.maxRadius);
    this.visualRadius = lerp(this.visualRadius, target, VISUALS.size.easing);
  }

  drawShape(kind, radius) {
    switch (kind) {
      case 'square':
        rectMode(CENTER);
        rect(0, 0, radius * 2, radius * 2);
        break;
      case 'triangle':
        triangle(-radius, radius, 0, -radius, radius, radius);
        break;
      case 'hex':
        beginShape();
        for (let i = 0; i < 6; i++) {
          const a = (PI / 3) * i;
          vertex(cos(a) * radius, sin(a) * radius);
        }
        endShape(CLOSE);
        break;
      case 'circle':
      default:
        ellipse(0, 0, radius * 2);
    }
  }

  // --- Update / display ---

  update(neighbors = window.agents) {
    // Trust-directed movement
    let moved = false;
    for (const [id, score] of this.trustMap.entries()) {
      if (score > 2) {
        const peer = window.agentMap.get(parseInt(id));
        if (peer) {
          const seek = p5.Vector.sub(peer.pos, this.pos)
            .setMag(SIM_CONFIG.forceParams.trustAttraction * score);
          this.applyForce(seek);
          moved = true;
        }
      }
    }

    // Flocking forces
    this.applySeparationForce(neighbors);
    this.applyCohesionForce(neighbors);
    this.applyAlignmentForce(neighbors);

    // Wander if idle
    if (!moved) {
      this.wander.rotate(random(-0.1, 0.1));
      this.applyForce(p5.Vector.mult(this.wander, 0.03));
    }

    // Integrate motion
    this.acc.limit(0.2);
    this.vel.add(this.acc);
    this.vel.mult(0.95);
    this.vel.limit(1.5);
    this.pos.add(this.vel);
    this.acc.mult(0.6);

    // Trail
    if (Array.isArray(this.trail)) {
      this.trail.push(this.pos.copy());
      if (this.trail.length > 40) this.trail.shift();
    }

    // Colour interpolation: prefer affiliation color, fallback to norm/scenario
    let targetColour;
    if (window.groupColors && window.groupColors[this.affiliation]) {
      targetColour = window.groupColors[this.affiliation];
    } else {
      const scenarioKey = this.scenarioGroup || this.normPreference;
      const ackProp = `${scenarioKey}Acknowledges`;
      const acknowledged = this[ackProp] !== undefined ? this[ackProp] : true;
      targetColour = getNormColor(scenarioKey, acknowledged);
    }
    this.displayColor = lerpColor(this.displayColor, targetColour, 0.05);

    // Dynamic size
    this.computeVisualRadius();

    this.wrapAround();
  }

  wrapAround() {
    const { left, right, top, bottom } = SIM_CONFIG.margins;
    if (this.pos.x < left) this.pos.x = width - right;
    if (this.pos.x > width - right) this.pos.x = left;
    if (this.pos.y < top) this.pos.y = height - bottom;
    if (this.pos.y > height - bottom) this.pos.y = top;
  }

  display() {
    // Optional trust halo
    if (VISUALS.showTrustHalo) {
      const trustSum = Array.from(this.trustMap?.values() || []).reduce((a, b) => a + b, 0);
      const haloAlpha = constrain(map(trustSum, 0, 12, 0, VISUALS.haloMaxAlpha), 0, VISUALS.haloMaxAlpha);
      noStroke();
      const c = this.displayColor;
      push();
      translate(this.pos.x, this.pos.y);
      fill(red(c), green(c), blue(c), haloAlpha);
      ellipse(0, 0, this.visualRadius * 4);
      pop();
    }

    const shapeKind = VISUALS.shapesByRole[this.role] || 'circle';
    const stanceStyle = VISUALS.outlineByStance[this.moralStance] || { weight: 1, alpha: 160 };

    fill(this.displayColor);
    stroke(0, stanceStyle.alpha);
    strokeWeight(stanceStyle.weight);

    push();
    translate(this.pos.x, this.pos.y);
    this.drawShape(shapeKind, this.visualRadius);
    pop();

    // ID label
    push();
    translate(this.pos.x, this.pos.y + this.visualRadius + 6);
    noStroke();
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(10);
    text(this.id, 0, 0);
    pop();
  }

  recordTrust(targetID, fulfilled) {
    const current = this.trustMap.get(targetID) || 0;
    const delta = fulfilled ? SIM_CONFIG.trustGrowth.increment : -SIM_CONFIG.trustGrowth.decrement;
    this.trustMap.set(targetID, current + delta);
  }
}

/**
 * ObligationVector class
 * Represents an obligation from source → target with a norm & strength.
 * Handles enforcement (status changes) and rendering.
 */
// Animated, de-synced obligation line with arrival-gated enforcement + fade-out
export class ObligationVector {
  constructor(source, target, strength, norm) {
    this.source = source;
    this.target = target;
    this.strength = strength;          // 0..1
    this.norm = norm;                  // one of normTypes
    this.status = 'pending';           // 'pending' | 'fulfilled' | 'denied' | 'expired' | 'repaired'
    this.age = 0;
    this.maxAge =
      SIM_CONFIG.enforcementRules.expirationBase +
      floor(random(SIM_CONFIG.enforcementRules.expirationRandom));

    // --- animation ---
    this.animT = 0; // 0..1, how far the line has grown toward the target
    const baseSpeed = SIM_CONFIG?.obligation?.animSpeed ?? 0.035;
    this.animSpeed = baseSpeed * (0.7 + random(0.6)); // slight per-line jitter
    const jitter = SIM_CONFIG?.obligation?.spawnJitter ?? 24; // frames to stagger births
    const now = (typeof frameCount === 'number') ? frameCount : 0;
    this.spawnFrame = now + floor(random(0, jitter)); // don’t all start at once

    this.resolveOnArrival = true; // only decide fulfilled/denied once line reaches target
    this.resolvedAt = null;       // frameCount when resolved
    this.lingerFrames = SIM_CONFIG?.obligation?.lingerFrames ?? 18; // fade-out
  }

  // advance animation even when not rendering (validation/headless)
  stepAnimation() {
    if (typeof frameCount === 'number' && frameCount < this.spawnFrame) return;
    if (this.animT < 1) this.animT = Math.min(1, this.animT + this.animSpeed);
  }

  // Update state based on the registered norm's enforcement rule (or default)
  enforce({ generation, obligationLog }) {
    if (!this.source || !this.target) return;

    // Always age while pending (can expire even before arrival)
    if (this.status === 'pending') {
      this.age++;
      if (this.age > this.maxAge) {
        this.status = 'expired';
        this.source.relationalLedger.set(this.target.id, 'expired');
        this.source.recordTrust(this.target.id, false);
        this.target.recordTrust(this.source.id, false);
        obligationLog?.push({ status: 'expired', norm: this.norm, from: this.source.id, to: this.target.id, generation });
        this.resolvedAt = (typeof frameCount === 'number') ? frameCount : 0;
        return;
      }
    }

    if (this.status !== 'pending') return;

    // keep animation moving even in validation mode
    this.stepAnimation();

    // Gate resolution until the line visually arrives
    if (this.resolveOnArrival && this.animT < 1) return;

    // Use norm-specific enforcement, fallback to default
    const enforceFn = (typeof normRegistry !== 'undefined' && normRegistry[this.norm]?.enforceFn) || defaultEnforce;
    const result = enforceFn(this, { generation, obligationLog });

    // If custom rule didn’t return a canonical status, use baseline
    if (!['fulfilled', 'denied', 'pending'].includes(result)) {
      const d = p5.Vector.dist(this.source.pos, this.target.pos);
      const proximityOK = d < (SIM_CONFIG.enforcementRules.proximityThreshold || 150);
      const ackOK = !!(this.source[`${this.norm}Acknowledges`] && this.target[`${this.norm}Acknowledges`]);
      const p = (this.strength * (proximityOK ? 1.0 : 0.6)) * (ackOK ? 1.0 : 0.5);
      this.status = (random() < p) ? 'fulfilled' : 'denied';
    } else {
      this.status = result;
    }

    if (this.status === 'fulfilled' || this.status === 'denied') {
      this.source.obligationAttempts = (this.source.obligationAttempts || 0) + 1;
      if (this.status === 'fulfilled') {
        this.source.obligationSuccesses = (this.source.obligationSuccesses || 0) + 1;
      }
      this.source.relationalLedger.set(this.target.id, this.status);
      this.source.recordTrust(this.target.id, this.status === 'fulfilled');
      this.target.recordTrust(this.source.id, this.status === 'fulfilled');
      obligationLog?.push({ status: this.status, norm: this.norm, from: this.source.id, to: this.target.id, generation });
      this.resolvedAt = (typeof frameCount === 'number') ? frameCount : 0;
    }
  }

  // Render as an animated line colored by norm & styled by status
  display() {
    if (!this.source || !this.target) return;

    // advance animation when rendering too
    this.stepAnimation();

    const rgb = COLORS.norms[this.norm] || [120, 120, 120];
    const baseAlpha = COLORS.obligations.lineAlpha || 100;

    // core style
    let weight = COLORS.obligations.unfulfilledWeight || 1.2;
    let alpha = baseAlpha;
    let dash = null;

    if (this.status === 'fulfilled') {
      weight = COLORS.obligations.fulfilledWeight || 2.5;
      alpha = baseAlpha + 50;
    } else if (this.status === 'denied') {
      dash = COLORS.obligations.dashDenied || [8, 4];
    } else if (this.status === 'expired') {
      dash = COLORS.obligations.dashExpired || [3, 6];
      alpha = baseAlpha * 0.7;
    }

    // fade after resolve
    if (this.resolvedAt != null) {
      const now = (typeof frameCount === 'number') ? frameCount : 0;
      const t = (now - this.resolvedAt) / this.lingerFrames;
      const k = 1 - constrain(t, 0, 1);
      if (k <= 0) return; // finished showing
      alpha *= k;
    }

    const x1 = this.source.pos.x, y1 = this.source.pos.y;
    const x2 = this.target.pos.x, y2 = this.target.pos.y;

    push();
    stroke(rgb[0], rgb[1], rgb[2], alpha);
    strokeWeight(weight);
    noFill();

    // While pending and not yet arrived, draw only a growing segment
    if (this.status === 'pending' && this.animT < 1) {
      const cx = lerp(x1, x2, this.animT);
      const cy = lerp(y1, y2, this.animT);
      line(x1, y1, cx, cy);
      pop();
      return;
    }

    // Full-length styles (may be dashed)
    if (!dash) {
      line(x1, y1, x2, y2);
    } else {
      const on = dash[0], off = dash[1], seg = on + off;
      const total = dist(x1, y1, x2, y2);
      const steps = Math.max(1, floor(total / seg));
      const vx = (x2 - x1) / steps;
      const vy = (y2 - y1) / steps;
      for (let i = 0; i < steps; i++) {
        const sx = x1 + i * vx;
        const sy = y1 + i * vy;
        const ex = sx + vx * (on / (on + off));
        const ey = sy + vy * (on / (on + off));
        line(sx, sy, ex, ey);
      }
    }
    pop();
  }
}
