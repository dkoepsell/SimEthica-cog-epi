// sim/agent-epi-patch.js
(function attachEpistemicsWhenReady() {
  if (typeof window === 'undefined' || typeof window.Agent === 'undefined') {
    return setTimeout(attachEpistemicsWhenReady, 30);
  }

  const ECONF = () => (window.SIM_CONFIG && window.SIM_CONFIG.epistemic) || null;

  const hasP5 = (typeof random === 'function');
  const rand01 = () => (hasP5 ? random() : Math.random());
  function gauss(mu, sigma){
    if (hasP5) return randomGaussian(mu, sigma);
    // Box–Muller fallback
    let u=0,v=0; while(!u) u=Math.random(); while(!v) v=Math.random();
    return mu + sigma * Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }
  const clamp01 = x => (typeof constrain === 'function' ? constrain(x,0,1) : Math.min(1, Math.max(0,x)));

  if (!Agent.prototype.__initEpistemics) {
    Agent.prototype.__initEpistemics = function(){
      if (typeof this.CA !== 'number') this.CA = 0.6 + 0.4*rand01();   // how much you move
      if (typeof this.EA !== 'number') this.EA = 0.2 + 0.6*rand01();   // how widely you look
      if (typeof this.group !== 'number') this.group = (rand01()<0.5?0:1);
      if (typeof this.prefA !== 'number') this.prefA = rand01();
      if (typeof this.belief !== 'number') this.belief = (this.group===0 ? 0.1+0.3*rand01() : 0.6+0.3*rand01());
    };
  }

  if (!Agent.prototype.updateEpistemics) {
    Agent.prototype.updateEpistemics = function(){
      const E = ECONF();
      if (!E || !E.enabled) return;

      this.__initEpistemics();

      const pool = Array.isArray(window.agents) ? window.agents : [];
      const n = pool.length || 0; if (!n) return;

      // sample peers by EA (cap to keep it cheap)
      const m = Math.max(1, Math.min(16, Math.round(1 + this.EA * Math.max(0, n-1))));
      const idx = new Set();
      while (idx.size < m && n>1){ const k = Math.floor(rand01()*n); if (pool[k]!==this) idx.add(k); }
      const peers = Array.from(idx).map(i=>pool[i]);

      // social mix with bounded confidence + optional backfire
      const myB = (typeof this.belief==='number'? this.belief : 0.5);
      let numer=0, denom=0;
      for (const p of peers){
        const pb = (typeof p.belief==='number'? p.belief : 0.5);
        const same = (p.group === this.group);
        let w = same ? E.inTrust : E.outTrust;
        const diff = Math.abs(myB - pb);
        if (E.epsilon>0 && diff>E.epsilon) continue;
        if (E.backfire && diff>E.backfire.theta && rand01() < (E.backfire.prob||0)){
          const g = Math.max(0, (E.backfire.gain==null?1.0:E.backfire.gain));
          numer += (w * -g) * pb; denom += (w * g);     // repulsion
        } else {
          numer += w * pb; denom += w;
        }
      }
      const social = (denom>0 ? numer/denom : myB);

      // evidence (single or dual anchors) with noise + bias
      let anchor = E.truth;
      if (E.dualMode){
        const pA = clamp01(0.5*(E.envMixA||0.5) + 0.5*(typeof this.prefA==='number'? this.prefA : 0.5));
        anchor = (rand01()<pA) ? E.truthA : E.truthB;
      }
      let evidence = anchor + (E.truthBias||0);
      if (E.truthNoise && E.truthNoise>0) evidence += gauss(0, E.truthNoise);
      evidence = clamp01(evidence);

      // blend: self/social by CA, then mix in evidence, add process noise
      let b = (1 - this.CA)*myB + this.CA*social;
      b = (1 - E.eWeight)*b + E.eWeight*evidence;
      if (E.noise && E.noise>0) b += gauss(0, E.noise);
      this.belief = clamp01(b);
    };
  }

  // wrap Agent.update to call the epistemic update afterward
  if (!Agent.prototype.__epiWrapped){
    const _orig = Agent.prototype.update;
    Agent.prototype.update = function(neighbors = window.agents){
      const r = _orig ? _orig.call(this, neighbors) : undefined;
      try { this.updateEpistemics(); } catch(e) { /* keep sim running */ }
      return r;
    };
    Agent.prototype.__epiWrapped = true;
  }
})();
