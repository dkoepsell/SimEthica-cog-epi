// gui.js
//
// Responsible for constructing the user interface for interacting
// with the simulation.  The GUI presents scenario selectors, toggle
// switches and control buttons.  Callbacks supplied by the caller
// ensure that GUI actions propagate outwards without directly
// coupling this module to the simulation state.
// gui.js — browser-safe global access
const SIM_CONFIG = window.SIM_CONFIG;


/**
 * Build the control panel.  Buttons are created using p5.js helper
 * functions.  When clicked they invoke the corresponding callback
 * passed in through the options object.
 *
 * @param {Object} options Configuration for the GUI
 * @param {Array} options.scenarios Array of scenario names to build buttons for
 * @param {Array} options.toggles Array of toggle names to build buttons for
 * @param {Function} options.onScenarioSelect Called with the scenario name when a scenario button is pressed
 * @param {Function} options.onToggleChange Called with the toggle name when a toggle button is pressed
 * @param {Function} options.onPauseResume Called when the Pause/Resume button is pressed
 * @param {Function} options.onStop Called when the Stop button is pressed
 * @param {Function} options.onReset Called when the Reset button is pressed
 * @param {Function} options.onDownloadAgentLog Called when the agent log download button is pressed
 * @param {Function} options.onDownloadObligationLog Called when the obligation log download button is pressed
 */
export function createGUI({
  scenarios = [],
  toggles = [],
  onScenarioSelect = () => {},
  onToggleChange = () => {},
  onPauseResume = () => {},
  onStop = () => {},
  onReset = () => {},
  onDownloadAgentLog = () => {},
  onDownloadObligationLog = () => {},
  onAdvancedChange = () => {},
  onAddNorm = () => {}
  , onShowAbout = () => {}
} = {}) {
  const panel = createDiv()
    .id('guiPanel')
    // Make the panel a regular block element so it appears below the
    // canvas instead of overlaying it.  Using default static
    // positioning allows the panel to take its place in the normal
    // document flow after the sketch-holder element.
    .style('position', 'static')
    .style('margin', '10px auto 0 auto')
    .style('font-family', 'Arial')
    .style('background', '#f7f7f7')
    .style('padding', '14px')
    .style('border-radius', '10px')
    .style('box-shadow', '0 2px 6px rgba(0,0,0,0.1)')
    .style('max-width', '95vw')
    .style('text-align', 'center');

  // Scenario selectors
  createP('🧭 <strong>Scenario Modes</strong>')
    .parent(panel)
    .style('margin-bottom', '8px');
  const scenarioRow = createDiv()
    .parent(panel)
    .style('display', 'flex')
    .style('flex-wrap', 'wrap')
    .style('justify-content', 'center')
    .style('gap', '8px')
    .style('margin-bottom', '12px');
  scenarios.forEach(type => {
    const btn = createButton(type)
      .parent(scenarioRow)
      .style('padding', '6px 16px')
      .style('font-size', '14px');
    // Provide a tooltip explaining what selecting a scenario does
    btn.attribute('title', `Switch to the ${type} normative model`);
    btn.mousePressed(() => onScenarioSelect(type));
  });

  // Toggle switches
  if (toggles.length > 0) {
    createP('🧪 <strong>Toggle Experiments</strong>')
      .parent(panel)
      .style('margin-bottom', '8px');
    const toggleRow = createDiv()
      .parent(panel)
      .style('display', 'flex')
      .style('flex-wrap', 'wrap')
      .style('justify-content', 'center')
      .style('gap', '8px')
      .style('margin-bottom', '12px');
    toggles.forEach(toggleName => {
      const toggleBtn = createButton(toggleName)
        .parent(toggleRow);
      // Descriptions for each toggle button
      const toggleDescriptions = {
        'Moral Repair': 'Enable or disable the moral repair process when obligations fail.',
        'Directed Norms': 'Allow obligations to be directed based on agents\' norm preferences.',
        'Vulnerability Targeting': 'Permit obligations to target the most vulnerable agent first.',
        'Trust Heatmap': 'Show or hide the trust intensity heatmap overlay.',
        'Affiliation Heatmap': 'Show or hide a heatmap indicating the density of affiliation groups.',
        'Conflict Heatmap': 'Show or hide a heatmap highlighting regions of high inter‑group conflict.',
        'Trails': 'Show or hide motion trails behind agents.'
      };
      toggleBtn.attribute('title', toggleDescriptions[toggleName] || 'Toggle this behaviour');
      toggleBtn.mousePressed(() => onToggleChange(toggleName));
    });
  }

  // Simulation controls
  createP('🎛 <strong>Simulation Controls</strong>')
    .parent(panel)
    .style('margin-bottom', '8px');
  const controlRow = createDiv()
    .parent(panel)
    .style('display', 'flex')
    .style('flex-wrap', 'wrap')
    .style('justify-content', 'center')
    .style('gap', '8px');
  createButton('Pause/Resume')
    .parent(controlRow)
    .attribute('title', 'Pause or resume the simulation')
    .mousePressed(onPauseResume);
  createButton('Stop')
    .parent(controlRow)
    .attribute('title', 'Stop the simulation and show an interpretive summary')
    .mousePressed(onStop);
  createButton('Reset')
    .parent(controlRow)
    .attribute('title', 'Reset the simulation to its initial state')
    .mousePressed(onReset);
  createButton('Download CSV')
    .parent(controlRow)
    .attribute('title', 'Download the agent log as a CSV file')
    .mousePressed(onDownloadAgentLog);
  createButton('Download Obligations')
    .parent(controlRow)
    .attribute('title', 'Download the obligation log as a CSV file')
    .mousePressed(onDownloadObligationLog);

// Submission consent toggle
const submitToggle = createCheckbox("Submit run data anonymously", false)
  .parent(controlRow)
  .style('margin-top', '6px')
  .style('margin-bottom', '6px')
  .attribute('title', 'Allow this run to be submitted anonymously for research aggregation');
submitToggle.changed(() => {
  SIM_CONFIG.allowSubmission = submitToggle.checked();
});

// Tag input field
const tagInput = createInput("")
  .parent(controlRow)
  .style('margin-top', '6px')
  .style('margin-bottom', '6px')
  .style('width', '60%')
  .attribute('placeholder', 'Tags (comma-separated)')
  .attribute('title', 'Add descriptive tags for this run (e.g., “repair enabled”, “fragmented trust”)');
tagInput.input(() => {
  SIM_CONFIG.runTags = tagInput.value().split(",").map(t => t.trim()).filter(t => t.length > 0);
});


  // About button to open a modal with a description of the simulation.
  createButton('About')
    .parent(controlRow)
    .attribute('title', 'Show a description of the simulation and its theoretical background')
    .mousePressed(onShowAbout);

  // Button to download the current simulation settings as a JSON file.
  createButton('Download Settings')
    .parent(controlRow)
    .attribute('title', 'Download the current slider and toggle values for later analysis')
    .mousePressed(() => {
      // Assemble the current settings into an object
      const current = {
        numAgents: agentSlider.value(),
        proximityThreshold: proxSlider.value(),
        defaultNormDistribution: normSelect.value(),
        trustIncrement: trustIncSlider.value(),
        trustDecrement: trustDecSlider.value(),
        expirationBase: expireBaseSlider.value(),
        expirationRandom: expireRandSlider.value(),
        reproductionChance: reproSlider.value(),
        deathRate: deathSlider.value(),
        cohesion: cohesionSlider.value(),
        separation: separationSlider.value(),
        alignment: alignmentSlider.value(),
        trustAttraction: trustAttrSlider.value(),
        memoryBase: memorySlider.value(),
        moralStanceDistribution: stanceSelect.value(),
        validationMode: validationCheckbox.checked()
      };
      const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = createA(url, 'settings');
      link.attribute('download', 'simulation_settings.json');
      link.hide();
      link.elt.click();
    });

  // Button to start batch mode.  Reads the batch run count and
  // generations per run from the sliders and invokes the global
  // startBatch() function defined in sketch.js.  During batch
  // mode the simulation runs headlessly and exports logs for each
  // run automatically.
  createButton('Start Batch')
    .parent(controlRow)
    .attribute('title', 'Run the simulation headlessly for the specified number of runs and generations per run')
    .mousePressed(() => {
      // Call the globally defined startBatch() in sketch.js
      if (typeof window.startBatch === 'function') {
        window.startBatch(batchRunsSlider.value(), batchGenSlider.value());
      }
    });

  // Advanced settings panel
  // A collapsible section that exposes sliders and selectors for
  // modifiable simulation parameters.  Users can adjust the initial
  // number of agents, the distance threshold for obligation
  // fulfilment and the default distribution used when selecting a
  // preferred norm.  Each control dispatches updates via
  // onAdvancedChange.
  const advancedContainer = createDiv()
    .parent(panel)
    .style('margin-top', '12px')
    .style('text-align', 'left');
  const advToggle = createButton('▼ Advanced Settings')
    .parent(advancedContainer)
    .style('margin-bottom', '4px');
  const advancedPanel = createDiv()
    .parent(advancedContainer)
    .style('display', 'none')
    .style('padding', '8px')
    .style('background', '#ffffff')
    .style('border', '1px solid #ddd')
    .style('border-radius', '6px');
  advToggle.mousePressed(() => {

  // Seed for reproducible randomness
  const seedRow = createDiv().parent(advancedPanel).style('margin: 6px 0');
  createSpan('Random Seed: ').parent(seedRow);
  const seedInput = createInput('').parent(seedRow).style('width','120px');
  const seedApply = createButton('Apply').parent(seedRow).style('margin-left','6px');
  const seedClear = createButton('Randomize').parent(seedRow).style('margin-left','4px');
  seedApply.mousePressed(() => {
    options.onAdvancedChange && options.onAdvancedChange({ seed: seedInput.value() });
  });
  seedClear.mousePressed(() => {
    seedInput.value('');
    options.onAdvancedChange && options.onAdvancedChange({ seed: '' });
  });

    const currently = advancedPanel.style('display');
    const expanded = currently === 'none';
    advancedPanel.style('display', expanded ? 'block' : 'none');
    advToggle.html((expanded ? '▲' : '▼') + ' Advanced Settings');
  });
  // Number of agents slider
  createSpan('Number of agents').parent(advancedPanel).style('display', 'block');
  const agentSlider = createSlider(10, 500, 100, 1).parent(advancedPanel);
  agentSlider.style('width', '100%');
  agentSlider.attribute('title', 'Initial number of agents in the simulation');
  // Proximity threshold slider
  createSpan('Obligation proximity').parent(advancedPanel).style('display', 'block').style('margin-top', '8px');
  const proxSlider = createSlider(50, 300, 150, 1).parent(advancedPanel);
  proxSlider.style('width', '100%');
  proxSlider.attribute('title', 'Distance threshold for obligation fulfilment');
  // Default norm distribution select
  createSpan('Default norm distribution').parent(advancedPanel).style('display', 'block').style('margin-top', '8px');
  const normSelect = createSelect().parent(advancedPanel);
  normSelect.option('Uniform');
  normSelect.option('Legal biased');
  normSelect.option('Care biased');
  normSelect.option('A Priori biased');
  normSelect.option('Epistemic biased');

  // Expose the select element globally so that the simulation can
  // append options when custom norms are registered at runtime.
  // Without attaching to window the reference would be lost outside
  // of this closure.  See sketch.js onAddNorm handler for usage.
  window.normSelect = normSelect;
  normSelect.attribute('title', 'Controls how agents choose their initial preferred norm');
  // Notify function collects current values
  function notifyAdvanced() {
    onAdvancedChange({
      numAgents: agentSlider.value(),
      proximityThreshold: proxSlider.value(),
      defaultNormDistribution: normSelect.value().toLowerCase().replace(/ .*/, '')
    });
  }
  agentSlider.input(notifyAdvanced);
  proxSlider.input(notifyAdvanced);
  normSelect.changed(notifyAdvanced);

  // Custom norm injection controls.  Users can define a new norm by
  // specifying its name and a colour (as a hex string without the
  // leading '#').  When the Add button is pressed, the onAddNorm
  // callback is invoked with an object containing the name and
  // colour.
  createSpan('Add custom norm').parent(advancedPanel).style('display', 'block').style('margin-top', '12px');
  const normNameInput = createInput('').parent(advancedPanel);
  normNameInput.attribute('placeholder', 'Name');
  normNameInput.style('width', '48%');
  // Tooltip for the name input
  normNameInput.attribute('title', 'Enter a short name for the new norm (no special characters)');
  const normColorInput = createInput('').parent(advancedPanel);
  normColorInput.attribute('placeholder', 'RGB (e.g., 255,0,0)');
  normColorInput.style('width', '48%').style('margin-left', '4%');
  // Tooltip for the colour input
  normColorInput.attribute('title', 'Enter RGB values separated by commas to define the norm colour (0-255 per channel)');
  const addNormButton = createButton('Add Norm').parent(advancedPanel).style('margin-top', '4px');
  // Tooltip for the Add Norm button
  addNormButton.attribute('title', 'Register the custom norm with the provided name and colour');
  addNormButton.mousePressed(() => {
    const name = normNameInput.value().trim();
    const colourText = normColorInput.value().trim();
    if (!name) return;
    const parts = colourText.split(',').map(p => parseInt(p.trim(), 10));
    if (parts.length !== 3 || parts.some(p => isNaN(p))) return;
    onAddNorm({ name, color: parts });
    // Clear inputs after adding
    normNameInput.value('');
    normColorInput.value('');
  });

  // Model parameter controls.  This section exposes internal
  // simulation constants to the user via sliders.  Adjusting these
  // values through the GUI modifies the global SIM_CONFIG at runtime.
  createSpan('Model parameters').parent(advancedPanel).style('display','block').style('margin-top','14px').style('font-weight','bold');
  // Trust growth increment
  createSpan('Trust increment').parent(advancedPanel).style('display','block').style('margin-top','8px');
  const trustIncSlider = createSlider(0, 5, 1, 0.1).parent(advancedPanel);
  trustIncSlider.style('width','100%');
  // Explain what the trust increment slider does
  trustIncSlider.attribute('title', 'Amount by which trust increases when obligations are fulfilled (0 = no increase, 5 = large increase)');
  // Show current value next to the slider
  const trustIncValue = createSpan(trustIncSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // Trust growth decrement
  createSpan('Trust decrement').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const trustDecSlider = createSlider(0, 5, 1, 0.1).parent(advancedPanel);
  trustDecSlider.style('width','100%');
  // Explain what the trust decrement slider does
  trustDecSlider.attribute('title', 'Amount by which trust decreases when obligations are denied (0 = no change, 5 = sharp decrease)');
  // Show current value next to the slider
  const trustDecValue = createSpan(trustDecSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // Obligation expiration base
  createSpan('Expiration base').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const expireBaseSlider = createSlider(1, 30, 10, 1).parent(advancedPanel);
  expireBaseSlider.style('width','100%');
  // Explain what the expiration base slider does
  expireBaseSlider.attribute('title', 'Minimum number of generations before obligations expire');
  // Show current value next to the slider
  const expireBaseValue = createSpan(expireBaseSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // Obligation expiration random range
  createSpan('Expiration random').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const expireRandSlider = createSlider(0, 20, 10, 1).parent(advancedPanel);
  expireRandSlider.style('width','100%');
  // Explain what the expiration random slider does
  expireRandSlider.attribute('title', 'Random additional generations added to the expiration time of obligations');
  // Show current value next to the slider
  const expireRandValue = createSpan(expireRandSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // Reproduction chance
  createSpan('Reproduction chance').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const reproSlider = createSlider(0, 1, 0.25, 0.01).parent(advancedPanel);
  reproSlider.style('width','100%');
  // Explain what the reproduction chance slider does
  reproSlider.attribute('title', 'Probability that each agent reproduces per generation (0 = never, 1 = always)');
  // Show current value next to the slider
  const reproValue = createSpan(reproSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // Death base rate
  createSpan('Death base rate').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const deathSlider = createSlider(0, 0.3, 0.05, 0.01).parent(advancedPanel);
  deathSlider.style('width','100%');
  // Explain what the death base rate slider does
  deathSlider.attribute('title', 'Base probability that agents die each generation (0 = no death, 0.3 = high death rate)');
  // Show current value next to the slider
  const deathValue = createSpan(deathSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // Force parameters
  createSpan('Cohesion').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const cohesionSlider = createSlider(0, 0.2, 0.02, 0.01).parent(advancedPanel);
  cohesionSlider.style('width','100%');
  // Explain what the cohesion slider does
  cohesionSlider.attribute('title', 'Cohesion coefficient: attraction strength between nearby agents');
  // Show current value next to the slider
  const cohesionValue = createSpan(cohesionSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  createSpan('Separation').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const separationSlider = createSlider(0, 0.2, 0.05, 0.01).parent(advancedPanel);
  separationSlider.style('width','100%');
  // Explain what the separation slider does
  separationSlider.attribute('title', 'Separation coefficient: repulsion strength to avoid crowding');
  // Show current value next to the slider
  const separationValue = createSpan(separationSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  createSpan('Alignment').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const alignmentSlider = createSlider(0, 0.2, 0.02, 0.01).parent(advancedPanel);
  alignmentSlider.style('width','100%');
  // Explain what the alignment slider does
  alignmentSlider.attribute('title', 'Alignment coefficient: tendency to align velocity with neighbours');
  // Show current value next to the slider
  const alignmentValue = createSpan(alignmentSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  createSpan('Trust attraction').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const trustAttrSlider = createSlider(0, 0.2, 0.05, 0.01).parent(advancedPanel);
  trustAttrSlider.style('width','100%');
  // Explain what the trust attraction slider does
  trustAttrSlider.attribute('title', 'Trust attraction coefficient: additional attraction towards trusted agents');
  // Show current value next to the slider
  const trustAttrValue = createSpan(trustAttrSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // Memory length base
  createSpan('Memory length (base)').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const memorySlider = createSlider(0.1, 1.0, 0.6, 0.05).parent(advancedPanel);
  memorySlider.style('width','100%');
  // Explain what the memory length slider does
  memorySlider.attribute('title', 'Base memory length for new agents (higher = remember obligations longer)');
  // Show current value next to the slider
  const memoryValue = createSpan(memorySlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // Moral stance distribution
  createSpan('Moral stance distribution').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const stanceSelect = createSelect().parent(advancedPanel);
  stanceSelect.option('Uniform');
  stanceSelect.option('Reactive-biased');
  stanceSelect.option('Proactive-biased');
  // Explain the moral stance distribution selector
  stanceSelect.attribute('title', 'Bias new agents toward reactive or proactive moral stance');
  // Validation mode toggle
  createSpan('Validation mode').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const validationCheckbox = createCheckbox('', false).parent(advancedPanel);
  // Explain the validation mode checkbox
  validationCheckbox.attribute('title', 'When checked, run in dry-run validation mode (no rendering)');

  // Batch run controls
  createSpan('Batch runs').parent(advancedPanel).style('display','block').style('margin-top','8px');
  const batchRunsSlider = createSlider(1, 50, 5, 1).parent(advancedPanel);
  batchRunsSlider.style('width','100%');
  batchRunsSlider.attribute('title', 'Number of consecutive runs to execute in batch mode');
  const batchRunsValue = createSpan(batchRunsSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  createSpan('Generations per run').parent(advancedPanel).style('display','block').style('margin-top','6px');
  const batchGenSlider = createSlider(1, 200, 25, 1).parent(advancedPanel);
  batchGenSlider.style('width','100%');
  batchGenSlider.attribute('title', 'Number of generations to simulate in each batch run');
  const batchGenValue = createSpan(batchGenSlider.value()).parent(advancedPanel).style('margin-left','6px').style('color','#555');
  // On any parameter change, assemble an update object and invoke the
  // provided onAdvancedChange callback.  This ensures that the
  // simulation state updates dynamically.  Many parameters are stored
  // in the SIM_CONFIG directly (e.g. force constants), while others
  // reside in advancedSettings to influence agent initialisation.
  function notifyParams() {
    onAdvancedChange({
      trustIncrement: trustIncSlider.value(),
      trustDecrement: trustDecSlider.value(),
      expirationBase: expireBaseSlider.value(),
      expirationRandom: expireRandSlider.value(),
      reproductionChance: reproSlider.value(),
      deathRate: deathSlider.value(),
      cohesion: cohesionSlider.value(),
      separation: separationSlider.value(),
      alignment: alignmentSlider.value(),
      trustAttraction: trustAttrSlider.value(),
      memoryBase: memorySlider.value(),
      moralStanceDistribution: stanceSelect.value().toLowerCase(),
      validationMode: validationCheckbox.checked()
    });
    // Refresh the value indicators whenever parameters change
    updateValueDisplays();
  }
  trustIncSlider.input(notifyParams);
  trustDecSlider.input(notifyParams);
  expireBaseSlider.input(notifyParams);
  expireRandSlider.input(notifyParams);
  reproSlider.input(notifyParams);
  deathSlider.input(notifyParams);
  cohesionSlider.input(notifyParams);
  separationSlider.input(notifyParams);
  alignmentSlider.input(notifyParams);
  trustAttrSlider.input(notifyParams);
  memorySlider.input(notifyParams);
  stanceSelect.changed(notifyParams);
  validationCheckbox.changed(notifyParams);

  // Update displays when batch sliders change
  batchRunsSlider.input(() => {
    updateValueDisplays();
  });
  batchGenSlider.input(() => {
    updateValueDisplays();
  });

  // Initialise the numerical displays with the current slider values
  updateValueDisplays();

  // Update the number displays next to each slider.  This helper
  // function is called whenever any model parameter changes.
  function updateValueDisplays() {
    trustIncValue.html(parseFloat(trustIncSlider.value()).toFixed(2));
    trustDecValue.html(parseFloat(trustDecSlider.value()).toFixed(2));
    expireBaseValue.html(parseInt(expireBaseSlider.value()));
    expireRandValue.html(parseInt(expireRandSlider.value()));
    reproValue.html(parseFloat(reproSlider.value()).toFixed(2));
    deathValue.html(parseFloat(deathSlider.value()).toFixed(2));
    cohesionValue.html(parseFloat(cohesionSlider.value()).toFixed(2));
    separationValue.html(parseFloat(separationSlider.value()).toFixed(2));
    alignmentValue.html(parseFloat(alignmentSlider.value()).toFixed(2));
    trustAttrValue.html(parseFloat(trustAttrSlider.value()).toFixed(2));
    memoryValue.html(parseFloat(memorySlider.value()).toFixed(2));
    batchRunsValue.html(parseInt(batchRunsSlider.value()));
    batchGenValue.html(parseInt(batchGenSlider.value()));
  }

  return panel;
}