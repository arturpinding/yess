# FairCall Audit

FairCall Audit is a 36-hour hackathon prototype that screens repeated,
directional referee/model disagreements and recommends cases for independent
human review. It does **not** infer intent or prove corruption.

## Demo scope

- Published SoccerNet VARS architecture for candidate-incident classification.
- Four outputs: no offence, foul/no card, yellow, and red.
- Confidence threshold that excludes uncertain predictions.
- Original longitudinal referee/team anomaly screening.
- Benjamini-Hochberg correction for testing many referee/team pairs.
- Deterministic fictional referee histories; no real referee is accused.

The prototype evaluates already selected five-second incidents. Automatic
discovery of every possible incident in a full match is out of scope.

## Run the dashboard

```bash
source .venv-app/bin/activate
python generate_demo_data.py
pytest -q
streamlit run app.py
```

The dashboard has three views:

1. Incident review with probability and uncertainty display.
2. Referee monitoring heatmap and screening statistics.
3. Audit case with the underlying directional disagreements.

See MODEL_STATUS.md for the exact verified model and dataset status.

## Model environment

The published SoccerNet code pins Python-era dependencies, so model inference
uses an isolated Python 3.10 environment:

```bash
source .venv-model/bin/activate
cd "vendor/sn-mvfoul/VARS interface"
python main.py
```

The dashboard remains in `.venv-app`. Model predictions are exchanged through
`outputs/predictions.json`, allowing a reliable offline presentation.
For headless verified inference and the bundled-sample smoke check, run:

~~~bash
python infer_mv_foul.py --action-dir "vendor/sn-mvfoul/VARS interface/dataset/action_0"
python evaluate_bundled_samples.py
~~~

## Data and provenance

- Dataset: `SoccerNet/SN-MVFouls-2024`.
- Published model: `SoccerNet/sn-mvfoul`.
- Referee histories in `data/demo/incidents.csv`: synthetic, seed 42.
- The first five probability records in `outputs/predictions.json`: verified
  inference on labelled samples bundled with SoccerNet.
- Remaining probability records and all longitudinal referee histories:
  explicitly synthetic.

The large dataset, model weights, and video clips are intentionally excluded
from Git.

## Screening rule

Only predictions with confidence of at least 0.80 are included. A referee/team
pair is flagged when all of these prototype thresholds are crossed:

- at least 30 accepted incidents;
- at least 10 model/referee disagreements;
- at least 75% of disagreements favour the same team;
- false-discovery-rate-corrected q-value below 0.05.

This simple binomial screen demonstrates the workflow; it is not suitable for
investigating real people. Production analysis must control for incident
opportunities, team style, match state, home advantage, referee strictness,
competition, camera quality, and rules version. Every alert requires blinded,
multi-referee review.

## Pitch line

> We do not detect corruption. We detect statistically unusual decision
> patterns that deserve an independent audit.
