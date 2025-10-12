// agent.js
//
// Core agent behaviour and obligation interactions for the Geometry of the Good simulation.
// Includes Cognitive Agency (CA), Epistemic Autonomy (EA), and belief state updates.

const SIM_CONFIG = window.SIM_CONFIG;
const COLORS = window.COLORS;
const VISUALS = window.VISUALS;
const normTypes = window.normTypes;

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

    // --- Position & motion setup ---
    const { left, right, top, bottom } = SIM_CONFIG.margins;
    this.pos = createVector(random(left, width - right), random(top, height - bottom));
    this.vel = createVector();
    this.acc = createVector();
    this.r = 10;
    this.visualRadius = VISUALS.size.baseRadius;
    this.vulnerability = random();
    this.wander = p5.Vector.random2D();

    // --- Normative state ---
    normTypes.forEach(norm => {
      this[`${norm}Acknowledges`] = random() > 0.5;
    });

    this.normPreference = random(normTypes);
    this.scenarioGroup = this.normPreference;
    this.affiliation = `pref_${this.normPreference}`;
    this.displayColor = getNormColor(this.normPreference, this[`${this.normPreference}Acknowledges`]);
    this.lastPref = this.normPreference;
    this.lastAcknowledgments = {};
    normTypes.forEach(norm => (this.lastAcknowledgments[norm] = this[`${norm}Acknowledges`]));

    // --- Relational state ---
    this.trustMap = new Map();
    this.relationalLedger = new Map();
    this.obligationAttempts = 0;
    this.obligationSuccesses = 0;
    this.contradictionDebt = 0;
    this.internalConflict = 0;
    this.culturalMomentum = random(0.3, 1.0);

    // --- Cognitive & epistemic traits ---
    this.CA = random(0.4, 1.0);  // Cognitive Agency: how much you revise beliefs
    this.EA = random(0.4, 1.0);  // Epistemic Autonomy: how broadly you consider others' inputs
    this.belief = random(0.4, 0.6); // Initial belief position (0..1 continuum)

    // --- Temperament & roles ---
    const roles = ['initiator', 'responder', 'mediator', 'disruptor'];
    this.role = random(roles);
    this.temperament = random();
    this.moralStance = random(['reactive', 'proactive']);
    this.memoryLength = random(0.2, 1.0);

    // --- Visuals & logs ---
    this.trail = [];
    this.narrativeLog = [];
    this.conflictLog = new Map();
    this.biography = [];
    this.birthGeneration = 0;
  }

  // --- Forces & motion ---

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

  // --- Core cognitive/epistemic behaviour ---
  updateCognition() {
    const peers = window.agents || [];
    let delta = 0, count = 0;
    for (const other of peers) {
      if (other === this) continue;
      const diff = Math.abs(this.belief - other.belief);
      // Within epistemic horizon: move toward others
      if (diff < this.EA * 0.5) {
        delta += (other.belief - this.belief) * this.CA * 0.05;
        count++;
      }
      // Strong disagreement + low EA → mild backfire
      else if (diff > 0.6 && random() < (1 - this.EA)) {
        delta -= (other.belief - this.belief) * 0.02;
      }
    }
    if (count > 0) this.belief = constrain(this.belief + delta / count, 0, 1);
  }

  // --- Relational metrics ---
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
      memoryLength: this.memoryLength,
      CA: this.CA,
      EA: this.EA,
      belief: this.belief
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
      (w.conflict || 0) * conflict +
      (w.debt || 0) * debt +
      (w.momentum || 0) * momentum;

    let target = base + 0.7 * delta;
    target = constrain(target, VISUALS.size.minRadius, VISUALS.size.maxRadius);
    this.visualRadius = lerp(this.visualRadius, target, VISUALS.size.easing);
  }

  drawShape(kind, radius) {
    switch (kind) {
      case 'square': rectMode(CENTER); rect(0, 0, radius * 2, radius * 2); break;
      case 'triangle': triangle(-radius, radius, 0, -radius, radius, radius); break;
      case 'hex':
        beginShape();
        for (let i = 0; i < 6; i++) { const a = (PI / 3) * i; vertex(cos(a) * radius, sin(a) * radius); }
        endShape(CLOSE);
        break;
      default: ellipse(0, 0, radius * 2);
    }
  }

  update(neighbors = window.agents) {
    this.updateCognition();

    // Trust-directed motion
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

    // Standard flocking forces
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

    // Smooth color interpolation
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
    // Optional halo based on trust
    if (VISUALS.showTrustHalo) {
      const trustSum = Array.from(this.trustMap?.values() || []).reduce((a, b) => a + b, 0);
      const haloAlpha = constrain(map(trustSum, 0, 12, 0, VISUALS.haloMaxAlpha), 0, VISUALS.haloMaxAlpha);
      const c = this.displayColor;
      push();
      noStroke();
      translate(this.pos.x, this.pos.y);
      fill(red(c), green(c), blue(c), haloAlpha);
      ellipse(0, 0, this.visualRadius * 4);
      pop();
    }

    const shapeKind = VISUALS.shapesByRole[this.role] || 'circle';
    const stanceStyle = VISUALS.outlineByStance[this.moralStance] || { weight: 1, alpha: 160 };

    push();
    translate(this.pos.x, this.pos.y);
    stroke(0, stanceStyle.alpha);
    strokeWeight(stanceStyle.weight);
    fill(this.displayColor);
    this.drawShape(shapeKind, this.visualRadius);
    pop();

    // ID label
    push();
    translate(this.pos.x, this.pos.y + this.visualRadius + 6);
    noStroke();
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(10);
    text(`${this.id}`, 0, 0);
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
 */
export class ObligationVector {
  constructor(source, target, strength, norm) {
    this.source = source;
    this.target = target;
    this.strength = strength;
    this.norm = norm;
    this.status = 'pending';
    this.age = 0;
    this.maxAge = SIM_CONFIG.enforcementRules.expirationBase +
      floor(random(SIM_CONFIG.enforcementRules.expirationRandom));
    this.animT = 0;
    this.animSpeed = 0.035 * (0.7 + random(0.6));
    this.spawnFrame = (typeof frameCount === 'number') ? frameCount + floor(random(0, 24)) : 0;
    this.resolveOnArrival = true;
    this.resolvedAt = null;
    this.lingerFrames = 18;
  }

  stepAnimation() {
    if (typeof frameCount === 'number' && frameCount < this.spawnFrame) return;
    if (this.animT < 1) this.animT = Math.min(1, this.animT + this.animSpeed);
  }

  enforce({ generation, obligationLog }) {
    if (!this.source || !this.target) return;
    if (this.status === 'pending') {
      this.age++;
      if (this.age > this.maxAge) {
        this.status = 'expired';
        this.source.relationalLedger.set(this.target.id, 'expired');
        obligationLog?.push({ status: 'expired', norm: this.norm, from: this.source.id, to: this.target.id, generation });
        return;
      }
    }

    if (this.status !== 'pending') return;
    this.stepAnimation();
    if (this.resolveOnArrival && this.animT < 1) return;

    const enforceFn = (normRegistry[this.norm]?.enforceFn) || defaultEnforce;
    const result = enforceFn(this, { generation, obligationLog });
    this.status = ['fulfilled', 'denied'].includes(result) ? result : (random() < 0.5 ? 'fulfilled' : 'denied');

    if (['fulfilled', 'denied'].includes(this.status)) {
      this.source.obligationAttempts++;
      if (this.status === 'fulfilled') this.source.obligationSuccesses++;
      this.source.relationalLedger.set(this.target.id, this.status);
      this.source.recordTrust(this.target.id, this.status === 'fulfilled');
      obligationLog?.push({ status: this.status, norm: this.norm, from: this.source.id, to: this.target.id, generation });
      this.resolvedAt = (typeof frameCount === 'number') ? frameCount : 0;
    }
  }

  display() {
    if (!this.source || !this.target) return;
    this.stepAnimation();
    const rgb = COLORS.norms[this.norm] || [120, 120, 120];
    const baseAlpha = COLORS.obligations.lineAlpha || 100;
    let weight = COLORS.obligations.unfulfilledWeight || 1.2;
    let alpha = baseAlpha;
    let dash = null;

    if (this.status === 'fulfilled') { weight = COLORS.obligations.fulfilledWeight; alpha = baseAlpha + 50; }
    else if (this.status === 'denied') dash = COLORS.obligations.dashDenied;
    else if (this.status === 'expired') { dash = COLORS.obligations.dashExpired; alpha = baseAlpha * 0.7; }

    const x1 = this.source.pos.x, y1 = this.source.pos.y;
    const x2 = this.target.pos.x, y2 = this.target.pos.y;

    push();
    stroke(rgb[0], rgb[1], rgb[2], alpha);
    strokeWeight(weight);
    noFill();

    if (this.status === 'pending' && this.animT < 1) {
      const cx = lerp(x1, x2, this.animT);
      const cy = lerp(y1, y2, this.animT);
      line(x1, y1, cx, cy);
    } else if (!dash) {
      line(x1, y1, x2, y2);
    } else {
      drawingContext.setLineDash(dash);
      line(x1, y1, x2, y2);
      drawingContext.setLineDash([]);
    }
    pop();
  }
}
