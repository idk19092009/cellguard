import assert from 'node:assert/strict';
import {
  CANDIDATE_PROFILE,
  COMMAND_TIP_TOLERANCE_CM,
  USER_REPORTED_SERVO_CALIBRATION,
  USER_REPORTED_REACHABILITY,
  REPORTED_STRAIGHT_UP_REFERENCE,
  imagePixelToGrid,
  roundCommandDegrees,
  clampServoCommands,
  forwardTipFromCommands,
  findClosestLegalCommandPose,
  gridToBoardCm,
  solveGridPoint,
  servoCommandsToPose,
  interpolateServoCommands,
} from './arm-candidate-kinematics.js';

let geometricallyReachable = 0;
let inModelCommandDomain = 0;
let boundedVirtualPreviews = 0;
let maxRoundedTipErrorCm = 0;
let maxErrorPoint = null;
let min = {base: Infinity, shoulder: Infinity, elbow: Infinity};
let max = {base: -Infinity, shoulder: -Infinity, elbow: -Infinity};
for (let gx = 0; gx <= 99; gx++) {
  for (let gy = 0; gy <= 99; gy++) {
    // Skip the slower closest-legal-pose search in this 10,000-point analytic sweep.
    const solution = solveGridPoint(gx, gy, CANDIDATE_PROFILE, {computeClosest: false});
    assert.equal(solution.reachable, true, `grid ${gx},${gy} should be geometrically reachable`);
    assert.equal(typeof solution.withinCommandDomain, 'boolean');
    geometricallyReachable++;
    if (solution.withinCommandDomain) inModelCommandDomain++;
    assert.ok(solution.previewCommands);
    assert.ok(Object.values(solution.previewCommands).every(
      angle => angle >= CANDIDATE_PROFILE.commandDomainMinDeg
        && angle <= CANDIDATE_PROFILE.commandDomainMaxDeg,
    ), `bounded preview must stay in domain at grid ${gx},${gy}`);
    assert.equal(solution.previewAdjusted, !solution.withinCommandDomain);
    assert.ok(Number.isFinite(solution.previewMissCm));
    if (solution.previewAdjusted) boundedVirtualPreviews++;
    else assert.deepEqual(solution.previewCommands, solution.rawCommands);
    for (const [axis, value] of Object.entries({
      base: solution.baseCommand,
      shoulder: solution.shoulderCommand,
      elbow: solution.elbowCommand,
    })) {
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
    const pose = servoCommandsToPose({
      base: solution.baseCommand,
      shoulder: solution.shoulderCommand,
      elbow: solution.elbowCommand,
    });
    const radial = CANDIDATE_PROFILE.upperLinkCm * Math.cos(pose.shoulderRad)
      + CANDIDATE_PROFILE.distalTipLengthCm * Math.cos(pose.shoulderRad + pose.elbowRelativeRad);
    const vertical = CANDIDATE_PROFILE.upperLinkCm * Math.sin(pose.shoulderRad)
      + CANDIDATE_PROFILE.distalTipLengthCm * Math.sin(pose.shoulderRad + pose.elbowRelativeRad);
    const roundedX = radial * Math.cos(pose.yawRad);
    const roundedY = radial * Math.sin(pose.yawRad);
    const tipError = Math.hypot(
      roundedX - solution.xCm,
      roundedY - solution.yCm,
      vertical + CANDIDATE_PROFILE.targetDropCm,
    );
    if (tipError > maxRoundedTipErrorCm) {
      maxRoundedTipErrorCm = tipError;
      maxErrorPoint = [gx, gy];
    }
  }
}

assert.equal(geometricallyReachable, 10000);
// This is a mathematical 0..180 command-domain test only, not physical reach/safety approval.
assert.equal(inModelCommandDomain, 2716);
assert.equal(boundedVirtualPreviews, 7284);
assert.ok(maxRoundedTipErrorCm < 0.4, `rounded command tip error ${maxRoundedTipErrorCm} cm at ${maxErrorPoint}`);

const center = solveGridPoint(50, 50);
assert.equal(center.reachable, true);
assert.equal(center.withinCommandDomain, false);
assert.deepEqual([center.baseCommand, center.shoulderCommand, center.elbowCommand], [90, 32, 202]);
assert.ok(center.elbowCommand > CANDIDATE_PROFILE.commandDomainMaxDeg);
assert.equal(center.branch, 'front');
assert.equal(center.candidateBranches.length, 2);
assert.equal(center.candidateBranches.some(branch => branch.withinCommandDomain), false);
assert.deepEqual(center.previewCommands, {base: 90, shoulder: 19, elbow: 180});
assert.deepEqual(center.constrainedCommands, center.previewCommands);
assert.equal(center.constrainedSearchPerformed, true);
assert.equal(center.constrainedReachable, false);
assert.equal(center.previewAdjusted, true);
assert.ok(center.previewMissCm > 4.4 && center.previewMissCm < 4.7,
  `closest legal virtual pose should report its center-target miss: ${center.previewMissCm} cm`);
assert.deepEqual(clampServoCommands({base: -1, shoulder: 90, elbow: 202}), {
  base: 0, shoulder: 90, elbow: 180,
});

// Reproduce the user's reported raw IK example (grid 69,51). The constrained
// search changes S as well as limiting E, improving the virtual pose without
// pretending that the selected point is reachable under this candidate model.
const reportedExample = solveGridPoint(69, 51);
assert.deepEqual(reportedExample.rawCommands, {base: 89, shoulder: 33, elbow: 214});
assert.deepEqual(reportedExample.previewCommands, {base: 89, shoulder: 13, elbow: 180});
assert.equal(reportedExample.constrainedReachable, false);
assert.ok(reportedExample.previewMissCm > 7.2 && reportedExample.previewMissCm < 7.6);
const oldCappedTip = forwardTipFromCommands(clampServoCommands(reportedExample.rawCommands));
const oldCappedMiss = Math.hypot(
  oldCappedTip.xCm - reportedExample.xCm,
  oldCappedTip.yCm - reportedExample.yCm,
  oldCappedTip.zCm,
);
assert.ok(reportedExample.previewMissCm < oldCappedMiss,
  'adjusting S/B/E must improve on simply capping the raw IK angles');

// A just-outside-boundary case can be brought within the explicit simulation
// tolerance by selecting a legal integer pose; this remains simulation-only.
const nearBoundary = solveGridPoint(23, 44);
assert.equal(nearBoundary.withinCommandDomain, false);
assert.equal(nearBoundary.constrainedReachable, true);
assert.ok(nearBoundary.previewMissCm <= COMMAND_TIP_TOLERANCE_CM);
assert.ok(Object.values(nearBoundary.previewCommands).every(angle => angle >= 0 && angle <= 180));
const closest = findClosestLegalCommandPose(reportedExample);
assert.deepEqual(closest.commands, reportedExample.previewCommands);
assert.ok(Math.abs(closest.missCm - reportedExample.previewMissCm) < 1e-9);
const straightTip = forwardTipFromCommands({base: 90, shoulder: 90, elbow: 90});
assert.ok(Math.abs(straightTip.xCm) < 1e-12);
assert.ok(Math.abs(straightTip.yCm) < 1e-12);
assert.ok(Math.abs(straightTip.zCm - 40.5) < 1e-12);
assert.ok(Math.abs(straightTip.radialCm) < 1e-12);
assert.equal(CANDIDATE_PROFILE.xMinCm, 6.5);
assert.equal(CANDIDATE_PROFILE.xMaxCm, 24.5);
assert.equal(CANDIDATE_PROFILE.xMaxCm - CANDIDATE_PROFILE.xMinCm, 18);
assert.equal(CANDIDATE_PROFILE.yMaxCm - CANDIDATE_PROFILE.yMinCm, 18);
assert.equal(CANDIDATE_PROFILE.targetDropCm, 9);
assert.equal(CANDIDATE_PROFILE.modelThicknessCm, 4);
assert.equal(CANDIDATE_PROFILE.targetDropCm + CANDIDATE_PROFILE.modelThicknessCm, 13);
assert.equal(REPORTED_STRAIGHT_UP_REFERENCE.supportCm, 13);
assert.equal(REPORTED_STRAIGHT_UP_REFERENCE.shoulderToTipCm, 31.5);
assert.equal(REPORTED_STRAIGHT_UP_REFERENCE.baseShaftToTipCm, 44.5);
assert.deepEqual(USER_REPORTED_SERVO_CALIBRATION.referenceCommands, {base: 90, shoulder: 90, elbow: 90});
assert.deepEqual(USER_REPORTED_SERVO_CALIBRATION.referenceRoles, {
  base: 'home-reference', shoulder: 'home-reference', elbow: 'park-reference',
});
assert.equal(USER_REPORTED_SERVO_CALIBRATION.straightUpAligned, true);
assert.deepEqual(USER_REPORTED_SERVO_CALIBRATION.direction85to95, {
  base: 'left-to-right', shoulder: 'front-to-back', elbow: 'back-to-front',
});
assert.deepEqual(USER_REPORTED_SERVO_CALIBRATION.reportedCommandRangeDeg, {min: 0, max: 180});
assert.equal(USER_REPORTED_SERVO_CALIBRATION.directModelToServoMappingVerified, false);
assert.equal(REPORTED_STRAIGHT_UP_REFERENCE.referencePoseReportedStraightUp, true);
assert.equal(USER_REPORTED_SERVO_CALIBRATION.safeTravelLimitsVerified, false);
assert.equal(USER_REPORTED_SERVO_CALIBRATION.loadSuitabilityVerified, false);
assert.equal(USER_REPORTED_SERVO_CALIBRATION.combinedClearancesVerified, false);
assert.equal(USER_REPORTED_REACHABILITY.centerPoseElbowValueDeg, 202);
assert.equal(USER_REPORTED_REACHABILITY.centerPoseReachable, true);
assert.equal(USER_REPORTED_REACHABILITY.directServoCommandMappingVerified, false);
assert.equal(CANDIDATE_PROFILE.commandDomainMinDeg, 0);
assert.equal(CANDIDATE_PROFILE.commandDomainMaxDeg, 180);
assert.deepEqual(imagePixelToGrid(0, 0), null);
assert.deepEqual(imagePixelToGrid(0, 512), 0);
assert.deepEqual(imagePixelToGrid(511, 512), 99);
assert.deepEqual(imagePixelToGrid(29, 100), 29);
assert.deepEqual(imagePixelToGrid(76, 100), 76);
assert.deepEqual(imagePixelToGrid(0.5, 100), 1); // exact half rounds upward, like Python floor(v + 0.5)
assert.deepEqual(imagePixelToGrid(100, 100), null);
assert.deepEqual(gridToBoardCm(0, 0), {xCm: 24.5, yCm: 9});
assert.deepEqual(gridToBoardCm(99, 99), {xCm: 6.5, yCm: -9});
assert.equal(CANDIDATE_PROFILE.gridXReversed, true);
assert.equal(CANDIDATE_PROFILE.gridYReversed, true);
assert.equal(roundCommandDegrees(90.5), 91);
assert.equal(roundCommandDegrees(89.5), 90);
assert.equal(roundCommandDegrees(-1.5), -2);
assert.equal(CANDIDATE_PROFILE.stepMsPerDegree, 500);

const reference = {base: 90, shoulder: 90, elbow: 90};
const target = {base: 100, shoulder: 120, elbow: 80};
assert.deepEqual(interpolateServoCommands(reference, target, 0, 30), reference);
assert.deepEqual(interpolateServoCommands(reference, target, 30, 30), target);
assert.deepEqual(interpolateServoCommands(reference, target, 15, 30), {
  base: 95, shoulder: 105, elbow: 85,
});
const pose = servoCommandsToPose(reference);
assert.ok(Math.abs(pose.yawRad) < 1e-12);
assert.ok(Math.abs(pose.shoulderRad - Math.PI / 2) < 1e-12);
assert.ok(Math.abs(pose.elbowRelativeRad) < 1e-12);
const b85 = servoCommandsToPose({base: 85, shoulder: 90, elbow: 90});
const b95 = servoCommandsToPose({base: 95, shoulder: 90, elbow: 90});
assert.ok(b85.yawRad < 0 && b95.yawRad > 0); // local report: B85 left, B95 right
const s85 = servoCommandsToPose({base: 90, shoulder: 85, elbow: 90});
const s95 = servoCommandsToPose({base: 90, shoulder: 95, elbow: 90});
assert.ok(Math.cos(s85.shoulderRad) > 0 && Math.cos(s95.shoulderRad) < 0); // front then back
const e85 = servoCommandsToPose({base: 90, shoulder: 90, elbow: 85});
const e95 = servoCommandsToPose({base: 90, shoulder: 90, elbow: 95});
assert.ok(e85.elbowRelativeRad > 0 && e95.elbowRelativeRad < 0); // back then front at S90
assert.equal(CANDIDATE_PROFILE.elbowReferenceRelativeDeg, 0);

console.log(`PASS: ${geometricallyReachable} grid points pass ideal geometry; ${inModelCommandDomain} rounded analytic branches fit 0..180; ${boundedVirtualPreviews} need constrained search.`);
console.log(`Candidate raw B range ${min.base}..${max.base}; S ${min.shoulder}..${max.shoulder}; E ${min.elbow}..${max.elbow}.`);
console.log(`Centre grid (50,50): raw B${center.baseCommand}/S${center.shoulderCommand}/E${center.elbowCommand}; closest legal B${center.previewCommands.base}/S${center.previewCommands.shoulder}/E${center.previewCommands.elbow}, miss ${center.previewMissCm.toFixed(3)} cm.`);
console.log(`Reported example grid (69,51): raw B${reportedExample.baseCommand}/S${reportedExample.shoulderCommand}/E${reportedExample.elbowCommand}; adjusted B${reportedExample.previewCommands.base}/S${reportedExample.previewCommands.shoulder}/E${reportedExample.previewCommands.elbow}, miss ${reportedExample.previewMissCm.toFixed(3)} cm (not reached).`);
console.log(`Worst rounded-command tip error ${maxRoundedTipErrorCm.toFixed(3)} cm at grid ${maxErrorPoint}.`);
