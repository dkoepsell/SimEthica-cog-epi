# Geometry of the Good Simulation (SimEthica)

The **Geometry of the Good Simulation** is part of the broader **SimEthica-Cog-Epi** project, which explores how ethical, cognitive, and epistemic properties emerge from agent interactions. This module focuses on modeling *the moral geometry of social being*—how relational obligations, trust, and contradiction debt evolve within pluralistic versus authoritarian conditions. This version runs on a public server at https://davidkoepsell.com/geometry-of-the-good-sim/index.html

---

## 🧭 Overview

**SimEthica: Geometry of the Good** is an agent-based simulation written in JavaScript (p5.js / WebGL) that implements philosophical hypotheses from *The Geometry of the Good* by David Koepsell.  
It visualizes and measures emergent properties such as:

- **Moral Energy** – cumulative measure of ethical coherence  
- **Contradiction Debt** – accumulated unresolved obligations  
- **Trust and Repair** – networked relational stability  
- **Cognitive Agency** –   diversity of reasoning and belief systems
- **Epistemic Autonomy** – freedom of belief updating  

Through these measures, the simulation demonstrates that **pluralism**—the coexistence of diverse cognitive and moral perspectives—is a structural condition for social stability.

---

## ⚙️ Features

- Modular agent-based design (agents, obligations, norms, epistemic modules)
- Configurable simulation parameters via `config.js`
- Real-time visualization in browser (p5.js canvas)
- CSV/JSON logging of generational data
- Support for multi-threaded computation (Web Workers)
- Dynamic tracking of:
  - Obligations issued / fulfilled / denied / expired  
  - Trust and moral repair  
  - Contradiction debt over generations  
  - Cognitive and epistemic autonomy metrics  

---

## 📂 Directory Structure

```
geometry-of-the-good-sim/
│
├── agent.js               # Core agent behavior and epistemic logic
├── obligation.js          # Obligation and moral relation handling
├── norms.js               # Normative structures and enforcement
├── config.js              # Simulation configuration and parameters
├── sketch.js              # Main simulation loop (p5.js)
├── utils.js               # Helper functions for math, randomization, logging
├── data/                  # CSV / JSON logs
├── figures/               # Optional output charts or heatmaps
└── README.md              # You are here
```

---

## 🧪 Installation

Clone the main repository and navigate into this module:

```bash
git clone https://github.com/dkoepsell/SimEthica-cog-epi.git
cd SimEthica-cog-epi/geometry-of-the-good-sim
```

If you’re using Node for bundling or server hosting, install dependencies:

```bash
npm install
```

Or, simply open `index.html` in your browser to run the visualization locally.

---

## 🚀 Running the Simulation

### Option 1 — Browser (recommended)
Open `index.html` in any modern browser.  
You’ll see a field of agents moving and interacting in real time. Use the GUI sliders (if enabled) to adjust parameters such as:

- **Obligation Strength**
- **Moral Repair Rate**
- **Cognitive Agency Weight**
- **Epistemic Autonomy**

Simulation data will be logged automatically to `/data` if configured.

### Option 2 — Node.js
Run the headless simulation mode to log data only:
## 🧪 Batch Mode

SimEthica-cog-epi supports a **batch mode** for running multiple simulation configurations in sequence. This is ideal for benchmarking, comparative analysis, or exploring parameter spaces systematically.

You can configure batch mode in two ways, the easiest is to adjust parameters and run batch mode, even with a deep time option, from the Advanced Settings tab in the GUI. You can also do so by configuring a JSON file as described:

1. **Via JSON file**: Create a JSON file containing an array of configuration objects. Each object should follow the standard simulation config schema. Then run:

   ```bash
   python run_batch.py path/to/batch_config.json
```bash
node sketch.js --headless --output data/run1.csv
```

This mode is suitable for batch experiments or exporting data for analysis.

---

## 🧩 Configuration Parameters

Configuration is handled in `config.js`.  
Here are key adjustable parameters:

| Parameter | Description | Default |
|------------|-------------|----------|
| `NUM_AGENTS` | Total number of agents | 250 |
| `MAX_GENERATIONS` | Number of time steps / generations | 500 |
| `OBLIGATION_RADIUS` | Distance for moral relation formation | 50 |
| `MORAL_REPAIR_RATE` | Likelihood of repairing failed obligations | 0.05 |
| `COGNITIVE_AUTONOMY_WEIGHT` | Strength of independent reasoning | 0.2 |
| `EPISTEMIC_VARIANCE` | Diversity in belief models | 0.15 |
| `TRUST_DECAY` | Rate at which trust diminishes without interaction | 0.01 |
| `CSV_EXPORT` | Whether to save logs per generation | true |

---

## 🧠 Conceptual Framework

This simulation operationalizes central theses from *The Geometry of the Good* and *The Architecture of Justice*:

1. **Obligation is relational and ontological**, not voluntarist or contractual.  
2. **Contradiction debt** measures the structural strain when obligations go unfulfilled.  
3. **Moral repair** reduces contradiction debt and sustains stability.  
4. **Pluralism**—the coexistence of diverse cognitive and epistemic agents—is not merely ethical but ontological, enabling adaptive repair.  
5. **Authoritarian systems** suppress epistemic diversity, producing rapid collapse or moral entropy.

The simulation thus bridges **ontological philosophy** and **empirical modeling**, showing that social stability is a function of epistemic plurality.

---

## 📊 Data Output

The simulation automatically generates `.csv` or `.json` logs per generation containing:

| Column | Meaning |
|---------|----------|
| `generation` | Simulation tick or time step |
| `obligations_issued` | Total obligations formed |
| `fulfilled`, `denied`, `expired` | Outcomes of obligations |
| `avg_trust`, `avg_debt` | Aggregate moral and contradiction metrics |
| `repair_success`, `repair_failure` | Moral repair outcomes |
| `cognitive_autonomy`, `epistemic_agency` | Average agent-level epistemic metrics |
| `moral_energy` | Aggregate moral coherence score |

These datasets can be analyzed using Python, R, or in-browser dashboards to compare regimes (e.g., pluralist vs. authoritarian).

---

## 🧰 Extending the Simulation

Developers can easily build upon this module by:

- Adding new **agent properties** (emotion, resource, territory)
- Extending **norms.js** to introduce additional moral rules
- Implementing **new visualization layers** (heatmaps, vector fields)
- Incorporating **external data sources** for realism (sociological or historical datasets)
- Connecting to **SimEthica Benchmark Framework** for rupture prediction

Example: to model *cognitive contagion* effects, modify `agent.updateBelief()` to include local averaging of epistemic vectors.

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository  
2. Create a feature branch (`git checkout -b feature/my-enhancement`)  
3. Commit your changes (`git commit -m "Add feature"`)  
4. Push to your fork and open a Pull Request  

Please follow existing code style and document any new parameters or modules.

---

## 📚 Citation

If you use this simulation or data in academic work, please cite:

```
@misc{Koepsell_SimEthica_GeometryOfTheGood_2025,
  author       = {David Koepsell},
  title        = {SimEthica: Geometry of the Good Simulation},
  year         = {2025},
  howpublished = {\url{https://github.com/dkoepsell/SimEthica-cog-epi/tree/main/geometry-of-the-good-sim}}
}
```

---

## 📄 License

This repository is released under the **MIT License**.  
See the [LICENSE](../LICENSE) file for details.

---

## 🧩 Acknowledgments

Developed by **David Koepsell** with contributions from **Preston Justice** and others interacting with the *SimEthica* project.  
The simulation is part of the larger research program on **The Architecture of Social Being**, integrating ontology, moral philosophy, and computational modeling.

For documentation, related papers, and data visualizations, visit:  
🌐 [https://davidkoepsell.com/GoG-CD-scenarios/](https://davidkoepsell.com/GoG-CD-scenarios/)

---

> “Pluralism is not a virtue but a condition of being.” — *The Geometry of the Good*
