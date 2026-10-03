# Arduino calibration checkpoint — motion locked

**The included Arduino sketch is diagnostic-only; servo output is compile-time locked (`HARDWARE_MOTION_ENABLED=false`).** The expert reports a 0–180° command interval for B/S/E, a completed load assessment and full-path clearance check, and an accessible power cutoff. These are recorded as user-reported checks; this software does not independently verify them. The direct 3D-angle-to-SG90 mapping—especially the raw E202 result—still lacks calibrated numeric values, so physical `MOVE` and `HOME` remain locked. B90/S90/E90 remains a reported straight-up reference, not a sensor-confirmed homing position. Keep the expert supervising wiring/tests and use only the approved supply arrangement; the website and server also block Arduino serial actions.

## Existing hardware record (old geometry only)

The historical values below describe the **old** arm, not the new candidate. The updated diagnostic sketch is `arduino/CellGuardSerialReceiver.ino`; its byte-identical Wokwi copy is `wokwi-rebuild-no-screen/sketch.ino`. Both use D9 base, D10 shoulder, D11 elbow and send no servo output.

- Previous software reference angles for the old geometry: B90 / S90 / E90. At that time these were not a confirmed physical park pose; the later user/expert report for the rebuilt setup is recorded in the next section.
- L1: 15 cm, shoulder pivot to elbow pivot.
- Old rigid elbow-to-tip home vector: 9.5 cm horizontally and 4 cm down (about 10.31 cm straight-line length).
- Old support height: H=8 cm; old surface X=2..20 cm and Y=−9..+9 cm.
- Earlier ranges were B/E15..165 and S75..175. The 175° ceiling was not physically verified; it must not be treated as a safe limit.
- Historical direction check on the old hardware: increasing S raises the upper link. A previous modelled centre move asked for an invalid shoulder angle and was rejected. This old observation is not the current rebuilt-setup report below; no physical X/Y motion is authorized while safety checks remain open.

## Candidate preview (software only)

The 3D scene imports `3d model/arm-candidate-kinematics.js`. Candidate geometry remains L1=14.5 cm, elbow-to-tip=17 cm, H=9 cm above the target surface, board X=6.5..24.5 cm and Y=−9..+9 cm; the target block is 4 cm high, giving about 13 cm vertically from base shaft to shoulder shaft. The scene shows a plain block, not reconstructed lung anatomy.

**New user/expert report:** B90/S90 are individual home references and E90 is the individual park reference. Together, B90/S90/E90 aligns the support, upper link, distal link, and pointer straight upward.

| Axis | 85° | 90° reported reference | 95° |
|---|---|---|---|
| B (base) | Left | Home reference | Right |
| S (shoulder) | Front | Home reference | Back |
| E (elbow) | Back | Park reference | Front |

The candidate solver has been reconciled to use E90 as zero relative elbow rotation and the reported shoulder/elbow direction signs. The expert reports the centre pose represented by E202 is physically reachable; this does not establish that `Servo.write(202)` is valid or calibrated. The expert now reports 0–180° commands for B/S/E and a swept-path clearance check, but the assumed linear 1° command-to-joint mapping outside the observed 85/90/95 directions and the full board-coordinate/yaw mapping remain provisional. Reported straight-up lengths are 31.5 cm shoulder-to-tip and about 44.5 cm base-shaft-to-tip (13+14.5+17 cm).

The math-only sweep finds all 10,000 grid points inside the ideal two-link geometry, but only **2,716** rounded analytic branches fit the reported 0–180° command domain directly. When neither exact branch fits, the 3D simulator searches the legal integer B/E domain and selects the best legal S command for each pair. It labels a result within **1.5 cm** as within user-reported simulation tolerance; otherwise it reports the closest legal virtual pose and its remaining miss, without claiming contact. At centre grid (50,50), raw IK is B90/S32/E202 and the closest legal pose is B90/S19/E180, with a **4.501 cm** miss. The reported screenshot case (grid 69,51) changes raw B89/S33/E214 to B89/S13/E180, improving the miss from 9.824 cm under simple capping to **7.379 cm**—the target is still not reached in the current candidate geometry. The diagnostic firmware prints raw geometric angles and refuses physical motion. The expert-reported load and swept-clearance checks do not supply the missing numeric angle-to-servo map; `Servo.write(202)` is not accepted.

To run only the software test, use Node.js 20 or later from `3d model`:

```sh
node --experimental-default-type=module test-arm-candidate.mjs
```

The post-build observations recorded here are the user/expert-reported 85/90/95 directions, all-90 straight-up alignment, 0–180° command interval, load review, and swept-clearance check. This patch did not test full travel, loaded motion, or physical clearance, and no assembled-arm motion or Wokwi run was performed. Before any later hardware enablement, the supervising expert must provide the exact per-axis mapping and permitted commands for the actual SG90s, then review the changed profile; update browser and firmware together. Keep a physical power disconnect available during any future bench test; software STOP is not an emergency cutoff.
