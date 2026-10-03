# CellGuard 3D locator handoff

This ZIP is an **overlay patch** for the existing CellGuard GitHub project, not a standalone app. Back up the project, then extract the patch into its root while preserving folder paths and allowing the listed files to be replaced. The overlay reuses the project's original Three.js assets, detector weights, model files, and other upstream resources; those are not bundled here.

## Apply and run the preview

1. Merge this patch into the existing CellGuard project root.
2. Install the packages from `requirements.txt` in that root. PyTorch and the detector packages require internet access and can take several gigabytes of disk space.
3. Start the Python server from the project root: `python locator/server.py --host 127.0.0.1 --port 3001`.
4. Open <http://localhost:3001/> in a browser with WebGL support.

The unchanged Teachable Machine classifier and browser libraries load from the internet. The image classifier runs in the browser; the 2D location model runs in the local Python server. This patch does not include the upstream weights or every original project file, so it will not run correctly if used by itself.

### If Python reports it cannot import `EnsembleLocator`

The server now loads the detector only from the project's sibling `locator/locate.py`; it will not accidentally import the unrelated PyPI package named `locate`. It looks for weights in the project-level `weights/` folder first (beside `locator/`), then falls back to `locator/weights/`. If the local detector, weights, or dependencies are missing, the server can still show the manual/3D demo, but `/api/locate` returns a clear 503. The scan page displays server error messages and offers manual point marking for the demo when automatic location fails; this still requires human review and sends no Arduino command. Restore missing files from the full CellGuard project; do not `pip install locate` as a fix.

`Start-CellGuard-Arduino.bat` is deliberately disabled; it sends no commands and does not launch the preview. Hardware actions remain blocked until the redesigned arm is measured and calibrated.

## Current arm preview: simulation only

The existing CellGuard 3D room and review scene use a **candidate** kinematics profile. It is not connected to the Arduino. The website does not send `MOVE`, `HOME`, or `STOP` commands; the server rejects Arduino API commands and refuses to open a serial port. The included Arduino sketch now uses the candidate geometry for diagnostics only; servo motion is disabled by a compile-time lock, so it does not attach or move servos.

Candidate values used in the preview:

- Flat target surface: **18 × 18 cm**. The physical lung model is **4 cm high**; the 3D scene shows a plain block of that thickness and uses only its top face as the target plane, not a reconstructed lung volume.
- Board X: **6.5–24.5 cm** and board Y: **−9–+9 cm**, relative to the base yaw axis. The X offset keeps the base housing outside the board footprint while retaining the 18 × 18 cm target area.
- Shoulder-to-elbow link: **14.5 cm**; elbow-to-pointer-tip reach: **17 cm**; shoulder pivot: **9 cm** above the top target surface. The base-servo shaft is about **13 cm** vertically below the shoulder shaft (4 cm block thickness + 9 cm above its top). The user confirmed these model/link dimensions; board X/Y offsets and scene mounting remain candidate assumptions.
- **Reported calibration:** B90/S90 are individual home references and E90 is the individual park reference; the user/expert confirms the combined B90/S90/E90 pose aligns the support, upper link, distal link, and pointer straight upward. Local direction checks were E85 back/E95 front; S85 front/S95 back; B85 left/B95 right. The expert reports the centre pose represented by E202 is reachable by the arm. The solver uses E90 as zero-relative elbow rotation and applies the reported local signs; the 1:1 command-to-joint scale and full-frame coordinate mapping remain assumptions.
- **Reported straight-up dimensions:** 31.5 cm from shoulder shaft to pointer tip and about **44.5 cm** from base shaft to tip (13 + 14.5 + 17 cm). This describes the reported pose only. The expert reports load and path checks separately; the geometry module cannot independently validate them or establish a HOME procedure.
- The expert reports a **0–180° command interval for B/S/E**. The project records that as a command-domain limit, not as an independently measured mechanical travel envelope or calibrated 3D-to-servo mapping. The expert also reports load and full-path checks; this software does not independently verify those checks. Hardware motion remains disabled and HOME locked.
- Grid values are integers **0–99**. Joint commands use half-up integer-degree rounding. Candidate-timing mode ramps at **1° per 500 ms**. The default **5× fast preview** uses 100 ms per degree for on-screen animation only; it does not change hardware timing.
- In the room scene, the flat board is centred over the stylized chest. The yaw base has been moved outboard, separated from the board footprint and patient arm, and shown on a compact left-rail clamp. This is a visual layout only; the CT panel is not reconstructed anatomy.
- The bed-facing CT display is rotated **180°**. The candidate reverses both grid-to-board axes so the point marker stays on the same displayed pixel. Any future calibrated firmware must use that same reversed grid conversion.

Under the updated reference, all 10,000 points fit the ideal two-link geometry, but only **2,716/10,000** rounded analytic IK solutions fit the reported 0–180° command domain directly. For the other points, the 3D simulator searches integer B/E commands over the legal range and chooses the best legal S command for each pair; if the nearest legal pose still misses by more than the 1.5 cm user-reported simulation tolerance, the target is explicitly marked **not reached**. At centre grid (50,50), raw IK is **B90/S32/E202**; the closest legal virtual pose found is **B90/S19/E180**, with a **4.501 cm** miss. The screenshot case matching raw **B89/S33/E214** (grid 69,51) now previews **B89/S13/E180** and reduces the miss from **9.824 cm** under simple capping to **7.379 cm**—still not target contact. A near-boundary example (grid 23,44) reaches within the stated 1.5 cm user-reported tolerance at B93/S26/E180 (0.174 cm model error). These are model calculations, not calibrated commands. `CHECK` still reports raw geometric angles, while physical `MOVE` remains locked and sends no servo output. The direct 3D-to-servo mapping remains unverified. Do not use the preview to move hardware.

Run the candidate math test from the `3d model` folder with:

```sh
node --experimental-default-type=module test-arm-candidate.mjs
```

It checks all 10,000 geometric points and analytic command-domain counts, legal bounds on preview commands, the constrained-search outputs for the centre and B89/S33/E214 example, a near-boundary pose within the explicit 1.5 cm user-reported model tolerance, the reported all-90 straight-up pose, direction signs, rounded tip error, and synchronized interpolation. The search/tolerance are simulation aids only; a residual miss is never presented as target contact.

## Image-point mapping and limits

A detector suggestion can supply a **human-confirmed 2D image point** for the flat board. Image X and Y are rounded to 0–99 with the same half-up formula in the browser and Python server. The 3D page dims and rotates the scan 180° for the bed-facing view; the candidate mirrors both grid-to-board axes so the marker still overlays the selected pixel. The Arduino diagnostic sketch uses this same mapping for angle previews only; servo motion is locked. The 0–99 values are board coordinates only—not millimetres, CT depth, diagnosis, or patient coordinates. A target must be reviewed by a person. The uploaded CT is display-only; the system does not infer depth.

## GitHub malignant-case sample batch

The overlay includes only eight exact copies of selected root JPEGs from `idk19092009/cellguard` on `main`: `Malignant case (9).jpg`, `Malignant case (14).jpg`, `Malignant case (15).jpg`, `Malignant case (16).jpg`, `Malignant case (19).jpg`, `Malignant case (22).jpg`, `Malignant case (30).jpg`, and `Malignant case (34).jpg`. They were selected from the 50-image batch using a **1.5 cm simulation-only residual cutoff**. The full source batch was verified against Git tree `37d6cccaabeba39cd2d9fc99acab2071e10fc3a2`; all source images are 512 × 512 RGB. The scan-page picker and `/api/demo-scan/` route expose only these eight cases. The report at <http://localhost:3001/reachability.html> contains only the included cases and links the filtered JSON/CSV. “Review in scan page” loads a sample into the usual browser classifier and review flow; it does not pre-confirm a point.

The recorded batch used the upstream `locator/locate.py` `locate_scan` pipeline and repo-pinned weights: the 10-fold LUNA16 ensemble, configured malignant fallback, and large-tumour override, on CPU. All 50 images were evaluated; filenames were routed through the malignant locator path based on their names only, not a diagnosis or confirmation of malignancy. The upstream locator requires human review. The filtered results include each selected image’s source Git blob ID, detector status, point, candidate commands, and model residual.

The locator proposed a point in **40/50** images and abstained in **10/50**. At the user-selected **1.5 cm simulation-only cutoff**, **8** points fit: **2** with raw legal candidate commands and **6** after constrained search. The eight included cases are **9, 14, 15, 16, 19, 22, 30, and 34**. The other **32** located points miss by more than 1.5 cm; the 10 abstentions have no point to test. The cutoff is not measured physical accuracy or a clinical tolerance.

These are **image-space and candidate-model calculations only**: image pixels have no calibrated image-to-robot transform or depth, the current 1:1 command model is not physically calibrated, and the 18 × 18 cm board mapping is a software assumption. “Candidate fit” does not establish real-arm reachability, safe clearance, target identity, or contact. Hardware remains locked; this batch sent no commands.

Short, Standard, and Extended tool choices are illustrative tip appearances in the preview. They do not alter the candidate 17 cm reach or represent a calibrated tool. Motion is contact-only on the flat display/board—there is no insertion, treatment, force sensing, or clinical positioning.

## Hardware files and test status

- `arduino/CellGuardSerialReceiver.ino` is a buttonless three-servo diagnostic candidate using the updated dimensions, reported local directions, and reported B90/S90/E90 straight-up reference. `HARDWARE_MOTION_ENABLED` is `false`; the sketch attaches no servo. `CHECK` prints raw candidate angles and flags values outside the reported 0–180° command domain; `MOVE` remains locked and sends no servo output. `HOME` remains hard-locked. The expert's range/load/clearance statements are recorded as reports; the 3D-to-servo scale and full hardware mapping are still not calibrated.
- `wokwi-rebuild-no-screen/sketch.ino` is included and kept byte-for-byte identical to `arduino/CellGuardSerialReceiver.ino`; the Wokwi diagram has a breadboard and three servos, with no screen or buttons.
- `3d model/arm-kinematics.js` is the earlier scene planner; the current preview imports `arm-candidate-kinematics.js` instead.
- `locator/test_arduino_handoff.py` covers image-to-grid mapping, locked serial actions, and the fallback when the original local detector module is absent. The server loads `locator/locate.py` by explicit path rather than importing the unrelated PyPI `locate` package; physical serial endpoints remain disabled.
- No physical movement was made as part of this software update.

## What this overlay contains

It updates selected `3d model/` files and includes the candidate math test, locator/server handoff files and API tests, only the eight 1.5 cm-filtered GitHub sample images, the filtered batch-reachability report/results, a diagnostic-only Arduino sketch, the matching no-screen/no-button Wokwi project, requirements list, and these notes. The Arduino and Wokwi sketches are byte-for-byte identical. It does **not** include upstream Three.js modules, detector weights, original classifier assets, or the upstream location-model source. Apply it over the complete original project, not as a replacement for that project.

This is a school demonstration, not a medical device or validated clinical targeting system. A point or class label from the model is not a diagnosis. The 3D patient, scan overlay, and arm are illustrative.
