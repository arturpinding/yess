# Model verification status

Verified locally on 2026-08-14.

## Working

- Local Python 3.10.20 environment: .venv-model.
- Published runtime: PyTorch 1.13.1 and torchvision 0.14.1.
- Official 14_model.pth.tar checkpoint downloaded from the link in
  SoccerNet/sn-mvfoul.
- Headless CPU inference completed on all five labelled, multi-view examples
  bundled with the published interface.
- Results are saved in outputs/bundled_sample_evaluation.json.
- The Streamlit dashboard loads these real sample predictions and local videos.

The five bundled examples produced 5/5 matching top severity classes. None
crossed the prototype's 0.80 confidence threshold, so all five are correctly
displayed as uncertain and excluded from longitudinal screening. This is only a
smoke check on five curated examples, not a model-accuracy estimate.

## Full dataset access

The official Hugging Face train, validation, and test archives were downloaded
to data/mvfoul (approximately 2.9 GB compressed). Their payload entries are
password-protected. The empty directory entries are visible, but videos and
annotation JSON cannot be extracted without the SoccerNet NDA password.

Consequently, full validation/test metrics and model fine-tuning have **not**
been performed. Supply the official SoccerNet password before claiming either.

## Runtime notes

- CUDA is unavailable on this machine; verified inference ran on CPU.
- The pinned mvtorch==0.1.0 package is no longer available from the package
  registry, but the published interface/model code does not import it. All
  actually imported requirements were installed.
- The bundled PyQt GUI was not needed for verification. infer_mv_foul.py
  reproduces its frame sampling, transforms, model, checkpoint, and label
  dictionaries headlessly.

## Reproduce

~~~bash
source .venv-model/bin/activate
python infer_mv_foul.py \
  --action-dir "vendor/sn-mvfoul/VARS interface/dataset/action_0" \
  --output outputs/real_inference.json
python evaluate_bundled_samples.py
~~~

Run the tested dashboard separately:

~~~bash
source .venv-app/bin/activate
python generate_demo_data.py
pytest -q
streamlit run app.py
~~~
