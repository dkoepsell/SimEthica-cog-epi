(function(){
  var g = window;

  // Ensure SIM_CONFIG exists
  g.SIM_CONFIG = g.SIM_CONFIG || {};
  // Ensure obligation object
  g.SIM_CONFIG.obligation = g.SIM_CONFIG.obligation || {};

  // Performance profiles (if missing)
  g.SIM_CONFIG.performanceProfiles = g.SIM_CONFIG.performanceProfiles || {
    normal: {
      validationMode: false,
      renderEvery: 1,
      logSample: 0.10,
      snapshotEvery: 250,
      generationInterval: 100,
      obligation: { targetDegree: 6, maxVectors: 500 }
    },
    deepTime: {
      validationMode: true,     // headless
      renderEvery: 0,           // no drawing
      logSample: 0.02,          // lighter logs
      snapshotEvery: 1000,
      generationInterval: 1,    // fast stepping
      obligation: { targetDegree: 7, maxVectors: 200000 },
      forceFullMetrics: true
    }
  };
  g.SIM_CONFIG.activeProfile = g.SIM_CONFIG.activeProfile || 'normal';

  // Parse URL params for early configuration
  (function applyUrlParams(){
    try {
      var params = new URLSearchParams(location.search);
      
      var cap = params.get('cap');
      if (cap !== null) {
        var c = cap.toLowerCase();
        if (c === 'none' || c === '' ) { g.SIM_CONFIG.populationCap = null; }
        else if (!isNaN(+cap)) { g.SIM_CONFIG.populationCap = Math.max(1, Math.floor(+cap)); }
      }
// Uncapped agent count: ?agents=250000
      var agents = params.get('agents');
      if (agents && !isNaN(+agents)) {
        g.SIM_CONFIG.numAgents = Math.max(1, Math.floor(+agents));
      }
      // Deep time flag
      if (params.get('deepTime') === '1') {
        g.SIM_CONFIG.activeProfile = 'deepTime';
        // Apply minimal profile now so sketch.js starts with right cadence
        g.validationMode = true;
        g.SIM_CONFIG.generationInterval = 1;
      }
    } catch(e) {}
  })();

  // Core applier
  function applyProfile(name){
    try{
      var profs = g.SIM_CONFIG.performanceProfiles || {};
      var p = profs[name] || profs.normal || {};
      g.SIM_CONFIG.activeProfile = name;
      if ('validationMode' in p) g.validationMode = !!p.validationMode;
      if ('generationInterval' in p) g.SIM_CONFIG.generationInterval = p.generationInterval;
      if (p.obligation){
        if ('maxVectors' in p.obligation) g.SIM_CONFIG.obligation.maxVectors = p.obligation.maxVectors;
        if ('targetDegree' in p.obligation) g.SIM_CONFIG.obligation.targetDegree = p.obligation.targetDegree;
      }
      g.__snapshotEvery = ('snapshotEvery' in p) ? p.snapshotEvery : (g.__snapshotEvery || 1000);
      g.__logSample     = ('logSample'     in p) ? p.logSample     : (g.__logSample     || 0.02);
      if (typeof g.__applyDeepTimeProfile === 'function') g.__applyDeepTimeProfile(name);
    }catch(e){}
  }

  // Public toggles
  g.setDeepTimeMode = function(on){ applyProfile(on ? 'deepTime' : 'normal'); };
  g.setAgentCount = function(n){
    var v = Math.max(1, Math.floor(+n || 0));
    g.SIM_CONFIG.numAgents = v;
    // Try to reset immediately if the sim exposes a reset hook
    if (typeof g.resetSimulation === 'function') {
      try { g.resetSimulation(); } catch(e){ console && console.warn && console.warn('resetSimulation failed', e); }
    } else {
      // If no reset hook, advise user to hit Reset in GUI
      console && console.log && console.log('Set numAgents =', v, '— click Reset in the UI to apply if changes are not immediate.');
    }
  };

  // Overlay UI
  function makePanel(){
    if (document.getElementById('deep-time-panel')) return;
    var d = document.createElement('div');
    d.id = 'deep-time-panel';
    d.style.cssText = 'position:fixed;right:12px;top:64px;background:#fff;border:1px solid #ccc;border-radius:10px;padding:10px 12px;font:12px Arial,sans-serif;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:220px';
    d.innerHTML = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">'
      + '  <label style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" id="deepTimeToggle"> <b>Deep Time</b></label>'
      + '  <button id="dtClose" title="Hide panel" style="border:none;background:#eee;border-radius:6px;padding:2px 6px;cursor:pointer;">×</button>'
      + '</div>'
      + '<div style="margin:6px 0 8px;color:#555" id="deepTimeStatus">Profile: ' + (g.SIM_CONFIG.activeProfile||'normal') + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;margin-top:4px">'
      + '  <label for="agentCount" style="min-width:56px;color:#333">Agents</label>'
      + '  <input id="agentCount" type="number" min="1" step="1" value="' + (g.SIM_CONFIG.numAgents||500) + '"'
      + '         style="flex:1 1 auto;padding:4px 6px;border:1px solid #ccc;border-radius:6px" />'
      + '  <button id="applyAgents" style="padding:4px 8px;border:1px solid #999;border-radius:6px;background:#f5f5f5;cursor:pointer">Apply</button>'
      + '</div>'
      + '<div style="margin-top:6px;color:#777;font-size:11px">Tip: you can also use <code>?agents=250000&deepTime=1</code> in the URL.</div>';
    document.body.appendChild(d);

    var cb = d.querySelector('#deepTimeToggle');
    var st = d.querySelector('#deepTimeStatus');
    var ac = d.querySelector('#agentCount');
    var ap = d.querySelector('#applyAgents');
    var close = d.querySelector('#dtClose');

    // Init checkbox from active profile
    cb.checked = (g.SIM_CONFIG.activeProfile === 'deepTime');
    cb.addEventListener('change', function(){
      g.setDeepTimeMode(cb.checked);
      st.textContent = cb.checked ? 'Profile: deepTime (headless)' : 'Profile: normal';
    });

    ap.addEventListener('click', function(){
      var n = Math.max(1, Math.floor(+ac.value || 0));
      g.setAgentCount(n);
      // Visual feedback
      ap.textContent = 'Applied';
      setTimeout(function(){ ap.textContent = 'Apply'; }, 1000);
    });

    close.addEventListener('click', function(){
      d.style.display = 'none';
    });

    // If URL specified agents and deepTime, reflect in UI
    var params = new URLSearchParams(location.search);
    if (params.get('deepTime') === '1' && !cb.checked) {
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    }
    var agentsParam = params.get('agents');
    if (agentsParam && !isNaN(+agentsParam)) {
      ac.value = Math.max(1, Math.floor(+agentsParam));
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') makePanel();
  else document.addEventListener('DOMContentLoaded', makePanel);
})();

/** Optional: set a hard population cap at runtime; pass null to uncap. */
window.setPopulationCap = function(n){
  if (n === null || n === undefined) { SIM_CONFIG.populationCap = null; return; }
  var v = Math.max(1, Math.floor(+n||0));
  SIM_CONFIG.populationCap = v;
};
