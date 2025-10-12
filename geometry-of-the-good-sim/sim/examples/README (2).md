# Examples Directory

This directory contains example configuration files and sample
outputs that demonstrate how to run the agent–obligation simulation
with different starting conditions.  Use these files as starting
points for your own experiments or as templates when constructing
batch runs.

## sample_config.json

This file defines a simple simulation configuration that can be
loaded by an external runner.  At present the simulation reads its
configuration from `config.js`; external runners may parse this JSON
and override the exported values before initialising the sketch.

```
{
  "numAgents": 50,
  "generationInterval": 50,
  "scenario": "utopian",
  "toggles": {
    "enableMoralRepair": true,
    "enableDirectedEmergence": false,
    "enableNonReciprocalTargeting": false
  }
}
```

Feel free to add further examples or sample output logs to this
directory.