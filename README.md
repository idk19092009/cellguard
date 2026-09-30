# CellGuard 3D locator handoff

This zip contains the integrated CellGuard scan page, local locator, and supplied Three.js motion scene. Keep the folder structure when extracting it. The `.venv` folder is created on your own computer; no Python environment is bundled.

## Run on Windows

1. Install **64-bit Python 3.11–3.14**. The package was tested with Python **3.14.3** on Windows.
2. Extract the whole zip. Double-click **Setup-CellGuard.bat** once. It installs the pinned packages in a local `.venv` and needs internet access and several gigabytes of free disk space for PyTorch.
3. Double-click **Start-CellGuard.bat**. Keep its terminal window open.
4. Open <http://localhost:3001/> in a browser with WebGL support. Port 3001 must be free.

The Windows starter binds to `127.0.0.1`, so this copy serves only the same computer. To stop it, press Ctrl+C in the terminal. To run on macOS or Linux, create a Python virtual environment, install `requirements.txt`, then run `python locator/server.py --host 127.0.0.1 --port 3001` from this directory. Windows setup may take a while because the machine-learning packages are large.

The unchanged Teachable Machine classifier and browser libraries load from the internet. The image classification runs in the browser; the location model runs in the local Python server. The file `original-classifier/keras_model.h5` is reference material and is not loaded by this app. The supplied original HTML is also kept for reference.

## Demonstrate

1. Upload a PNG or JPG CT image on the main page. The `demo-scans` folder has three selected examples. These were chosen after checking their outcomes and are **not** an accuracy test.
2. If the result is Normal, the flow stops without a target. For Benign or Malignant, review the AI point. If the locator cannot find a point, choose **Mark location** and click the image.
3. Click **Doctor confirm & move 3D hand** once. The same image and reviewed point transfer to `/3d/`, where the virtual hand starts moving automatically. No second start click is needed.
4. Choose **New scan** to return. Opening or refreshing `/3d/` without a fresh confirmation leaves the hand parked.

The enlarged patient, CT panel, bed, and robot keep their relative proportions in the scene. The arm has a visible mid-arm elbow motor that moves with the base and shoulder during the confirmed approach.
The CT display is turned 180 degrees to align with the patient on the bed; the amber marker is turned with it and still denotes the same reviewed image pixel. In the Simulation tool card, choosing Short, Standard, or Extended changes the visible needle length and reruns the confirmed approach. **Replay motion** and **Park arm** are demo controls for the same confirmed point.

The confirmation button represents human review in this demonstration; it does not verify the user's identity. Image X/Y is converted to a point on the virtual CT panel. It is not a measured 3D patient coordinate, needle depth, or a physical robot instruction. No robot hardware commands are sent.

## What's included

- `locator/server.py`, `locate.py`, `app.js`, `app.css`, `demo.html`, `handoff.js`: local app and model integration.
- `locator/research/unet_candidate.py`: neural network definition required to load the active large-tumour weight.
- `locator/weights/`: the ten nodule detector folds, malignant fallback, large-tumour model, verified configs, and provenance.
- `3d model/`: the supplied motion scene, local Three.js modules, a transparent patient cutout created from the supplied JPEG, and the arm contact planner. The original JPEG is retained.
- `demo-scans/`: one selected Normal, Benign, and Malignant image for presentation.
- `original-classifier/`: supplied original HTML and H5 for reference only.

## Model sources and limits

The nodule folds derive from [Lien-Feng's pretrained LUNA16 detector](https://huggingface.co/Lien-Feng/Lightweight-2-5D-LUNA16) (CC BY 4.0). The malignant fallback was trained on [Medical Segmentation Decathlon Task06 Lung](https://medicaldecathlon.com/) (CC BY-SA 4.0). The large-tumour model used [NSCLC-Radiomics](https://www.cancerimagingarchive.net/collection/nsclc-radiomics/) (CC BY-NC 3.0) and MSD data. LUNGx demo targets come from [TCIA LUNGx](https://www.cancerimagingarchive.net/collection/spie-aapm-lung-ct-challenge/) (CC BY 3.0). The Normal demo image comes from [dorsar/lung-cancer](https://huggingface.co/datasets/dorsar/lung-cancer). The model hashes and source notes are in `locator/weights/provenance.json` and the two config JSON files.

This is a school demonstration, not a medical device or validated clinical targeting system. The classifier requires internet, and an uploaded scan can fail to produce a supported location. The 3D patient and hand are illustrative.
