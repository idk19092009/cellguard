// Simulation-only design candidate for the CellGuard 18 x 18 cm demo board.
// The diagnostic firmware mirrors this candidate solver but cannot command servos.
// This is not a validated hardware profile; the app can show angle-limited virtual
// previews, but it does not test physical travel, load, or collisions.

// User/expert reports B/S/E=90/90/90 align the support, links, and pointer straight up.
// Reported local directions: B85 left/B95 right; S85 front/S95 back; E85 back/E95 front.
// The expert now reports a 0..180 command interval for all three SG90 axes. The app
// records that as a reported command domain. It is not an independently measured
// mechanical safe envelope, and the complete command-to-joint mapping is provisional.
export const USER_REPORTED_SERVO_CALIBRATION = Object.freeze({
  referenceCommands: Object.freeze({base: 90, shoulder: 90, elbow: 90}),
  referenceRoles: Object.freeze({base: 'home-reference', shoulder: 'home-reference', elbow: 'park-reference'}),
  straightUpAligned: true,
  direction85to95: Object.freeze({
    base: 'left-to-right',
    shoulder: 'front-to-back',
    elbow: 'back-to-front',
  }),
  reportedCommandRangeDeg: Object.freeze({min: 0, max: 180}),
  directModelToServoMappingVerified: false,
  safeTravelLimitsVerified: false,
  loadSuitabilityVerified: false,
  combinedClearancesVerified: false,
});

// User/expert additionally reports that the center pose represented by E202
// is physically reachable. That does not make 202 a valid direct Servo.write()
// command. The virtual preview below caps display commands and reports the miss.
export const USER_REPORTED_REACHABILITY = Object.freeze({
  centerPoseElbowValueDeg: 202,
  centerPoseReachable: true,
  directServoCommandMappingVerified: false,
});

export const CANDIDATE_PROFILE = Object.freeze({
  upperLinkCm: 14.5,              // shoulder pivot to elbow pivot
  distalTipLengthCm: 17.0,        // elbow pivot to blunt pointer tip, total
  targetDropCm: 9.0,              // shoulder pivot is 9 cm above the model's top target plane
  modelThicknessCm: 4.0,          // physical target block thickness; IK uses its top face
  xMinCm: 6.5,                    // keeps the yaw housing clear of the bed-top board
  xMaxCm: 24.5,                   // 18 cm wide, starts 6.5 cm ahead of base yaw axis
  yMinCm: -9.0,
  yMaxCm: 9.0,                     // 18 cm deep
  gridXReversed: true,             // the scan panel is displayed rotated 180 degrees
  gridYReversed: true,             // grid-to-board mapping mirrors the same rotation
  baseReferenceDeg: 90,
  shoulderReferenceDeg: 90,
  elbowReferenceDeg: 90,
  commandDomainMinDeg: 0,          // user/expert-reported command domain, not a verified mechanical safe range
  commandDomainMaxDeg: 180,
  stepMsPerDegree: 500,
  elbowReferenceRelativeDeg: 0,    // reported E90 straight-link reference; increasing E turns the distal link toward the front
});

// User/expert-reported straight-up geometry and reference commands.
// This is a reported reference, not a safety-approved HOME; full travel, load,
// combined clearances, and complete IK-to-hardware mapping are not independently verified.
export const REPORTED_STRAIGHT_UP_REFERENCE = Object.freeze({
  supportCm: CANDIDATE_PROFILE.modelThicknessCm + CANDIDATE_PROFILE.targetDropCm,
  shoulderToTipCm: CANDIDATE_PROFILE.upperLinkCm + CANDIDATE_PROFILE.distalTipLengthCm,
  baseShaftToTipCm: CANDIDATE_PROFILE.modelThicknessCm + CANDIDATE_PROFILE.targetDropCm
    + CANDIDATE_PROFILE.upperLinkCm + CANDIDATE_PROFILE.distalTipLengthCm,
  reportedReferenceCommands: USER_REPORTED_SERVO_CALIBRATION.referenceCommands,
  referencePoseReportedStraightUp: USER_REPORTED_SERVO_CALIBRATION.straightUpAligned,
  safeTravelLimitsVerified: USER_REPORTED_SERVO_CALIBRATION.safeTravelLimitsVerified,
  loadSuitabilityVerified: USER_REPORTED_SERVO_CALIBRATION.loadSuitabilityVerified,
  combinedClearancesVerified: USER_REPORTED_SERVO_CALIBRATION.combinedClearancesVerified,
});

export function roundCommandDegrees(value) {
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

// Returns a command-bounded vector for visual comparison only. It is not a
// hardware command and clamping does not preserve the requested endpoint.
export function clampServoCommands(commands, profile = CANDIDATE_PROFILE) {
  const clamp = value => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const rounded = roundCommandDegrees(value);
    return Math.max(profile.commandDomainMinDeg,
      Math.min(profile.commandDomainMaxDeg, rounded));
  };
  return {
    base: clamp(commands.base),
    shoulder: clamp(commands.shoulder),
    elbow: clamp(commands.elbow),
  };
}

// Forward kinematics for the displayed, bounded virtual pose. Coordinates are
// in cm relative to the board; z=0 is the target plane. No hardware is driven.
export function forwardTipFromCommands(commands, profile = CANDIDATE_PROFILE) {
  if (!commands || !['base', 'shoulder', 'elbow'].every(key =>
    typeof commands[key] === 'number' && Number.isFinite(commands[key]))) return null;
  const pose = servoCommandsToPose(commands, profile);
  const distalAbsoluteRad = pose.shoulderRad + pose.elbowRelativeRad;
  const radialCm = profile.upperLinkCm * Math.cos(pose.shoulderRad)
    + profile.distalTipLengthCm * Math.cos(distalAbsoluteRad);
  const verticalFromShoulderCm = profile.upperLinkCm * Math.sin(pose.shoulderRad)
    + profile.distalTipLengthCm * Math.sin(distalAbsoluteRad);
  return {
    xCm: radialCm * Math.cos(pose.yawRad),
    yCm: radialCm * Math.sin(pose.yawRad),
    zCm: profile.targetDropCm + verticalFromShoulderCm,
    radialCm,
  };
}

// User-reported 1.5 cm target tolerance, used only to label candidate simulation
// poses. This is not measured physical accuracy or a clinical safety tolerance.
export const COMMAND_TIP_TOLERANCE_CM = 1.5;

function wrapRadians(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// Find the nearest virtual pose using only integer commands inside the reported
// command interval. Base and elbow are enumerated; for every pair, the closest
// shoulder command is selected analytically. This is a complete search over
// the integer B/E domain and the optimal integer S for each pair. It cannot
// make an unreachable target reachable: a nonzero residual stays a miss.
export function findClosestLegalCommandPose(point, profile = CANDIDATE_PROFILE) {
  if (!point || !Number.isFinite(point.xCm) || !Number.isFinite(point.yCm)) return null;
  const minCommand = Math.ceil(profile.commandDomainMinDeg);
  const maxCommand = Math.floor(profile.commandDomainMaxDeg);
  if (!Number.isFinite(minCommand) || !Number.isFinite(maxCommand) || minCommand > maxCommand) return null;

  const degreeToRad = Math.PI / 180;
  const baseOptions = [];
  for (let base = minCommand; base <= maxCommand; base++) {
    const yawRad = (base - profile.baseReferenceDeg) * degreeToRad;
    baseOptions.push({base, yawRad, cosYaw: Math.cos(yawRad), sinYaw: Math.sin(yawRad)});
  }
  const elbowOptions = [];
  for (let elbow = minCommand; elbow <= maxCommand; elbow++) {
    const elbowRelativeRad = (profile.elbowReferenceRelativeDeg
      - (elbow - profile.elbowReferenceDeg)) * degreeToRad;
    const linkX = profile.upperLinkCm + profile.distalTipLengthCm * Math.cos(elbowRelativeRad);
    const linkZ = profile.distalTipLengthCm * Math.sin(elbowRelativeRad);
    elbowOptions.push({elbow, length: Math.hypot(linkX, linkZ), phaseRad: Math.atan2(linkZ, linkX)});
  }

  const targetVerticalCm = -profile.targetDropCm;
  const shoulderMinDeg = minCommand;
  const shoulderMaxDeg = maxCommand;
  let best = null;

  for (const baseOption of baseOptions) {
    const radialTargetCm = point.xCm * baseOption.cosYaw + point.yCm * baseOption.sinYaw;
    const crossTrackCm = -point.xCm * baseOption.sinYaw + point.yCm * baseOption.cosYaw;
    const targetDistanceCm = Math.hypot(radialTargetCm, targetVerticalCm);
    const targetDirectionRad = Math.atan2(targetVerticalCm, radialTargetCm);
    const fixedCrossTrackSquared = crossTrackCm * crossTrackCm;
    const targetDistanceSquared = targetDistanceCm * targetDistanceCm;

    for (const elbowOption of elbowOptions) {
      const idealShoulderDeg = profile.shoulderReferenceDeg - 90
        + (targetDirectionRad - elbowOption.phaseRad) / degreeToRad;
      // Shoulder is a revolute angle, so consider wrapped equivalents before
      // clipping to the legal command interval. Rounding picks the nearest
      // integer-degree command; boundaries are included explicitly by clamping.
      let localBestShoulder = null;
      let localBestDelta = Infinity;
      for (let turn = -2; turn <= 2; turn++) {
        const wrappedIdeal = idealShoulderDeg + turn * 360;
        const shoulder = Math.max(shoulderMinDeg, Math.min(shoulderMaxDeg,
          roundCommandDegrees(wrappedIdeal)));
        const shoulderRad = (90 + shoulder - profile.shoulderReferenceDeg) * degreeToRad;
        const delta = wrapRadians(shoulderRad + elbowOption.phaseRad - targetDirectionRad);
        if (Math.abs(delta) < localBestDelta) {
          localBestDelta = Math.abs(delta);
          localBestShoulder = shoulder;
        }
      }
      if (localBestShoulder === null) continue;

      const shoulderRad = (90 + localBestShoulder - profile.shoulderReferenceDeg) * degreeToRad;
      const delta = wrapRadians(shoulderRad + elbowOption.phaseRad - targetDirectionRad);
      const planarErrorSquared = Math.max(0, targetDistanceSquared
        + elbowOption.length * elbowOption.length
        - 2 * targetDistanceCm * elbowOption.length * Math.cos(delta));
      const missSquared = fixedCrossTrackSquared + planarErrorSquared;
      if (!best || missSquared < best.missSquared - 1e-12) {
        best = {
          commands: {base: baseOption.base, shoulder: localBestShoulder, elbow: elbowOption.elbow},
          missSquared,
        };
      }
    }
  }

  if (!best) return null;
  const tip = forwardTipFromCommands(best.commands, profile);
  const missCm = Math.hypot(tip.xCm - point.xCm, tip.yCm - point.yCm, tip.zCm);
  return {commands: best.commands, tip, missCm};
}

// Matches locator/server.py image_point_to_grid: image origin is top-left,
// each axis is normalized independently, and ties round half-up.
export function imagePixelToGrid(pixel, size) {
  if (typeof pixel !== 'number' || !Number.isFinite(pixel) || !Number.isInteger(size) ||
      size < 2 || pixel < 0 || pixel >= size) return null;
  return Math.max(0, Math.min(99, Math.floor(99 * pixel / (size - 1) + 0.5)));
}

export function gridToBoardCm(gridX, gridY, profile = CANDIDATE_PROFILE) {
  if (!Number.isInteger(gridX) || !Number.isInteger(gridY) ||
      gridX < 0 || gridX > 99 || gridY < 0 || gridY > 99) return null;
  const mappedGridX = profile.gridXReversed ? 99 - gridX : gridX;
  const mappedGridY = profile.gridYReversed ? 99 - gridY : gridY;
  return {
    xCm: profile.xMinCm + (mappedGridX / 99) * (profile.xMaxCm - profile.xMinCm),
    yCm: profile.yMinCm + (mappedGridY / 99) * (profile.yMaxCm - profile.yMinCm),
  };
}

function solveElbowBranch(radialCm, verticalCm, baseYawRad,
                           elbowRelativeRad, branch, profile) {
  const shoulderLinkRad = Math.atan2(verticalCm, radialCm) - Math.atan2(
    profile.distalTipLengthCm * Math.sin(elbowRelativeRad),
    profile.upperLinkCm + profile.distalTipLengthCm * Math.cos(elbowRelativeRad),
  );
  // Candidate frame treats +board Y as the B-increasing/right direction.
  const baseExactDeg = profile.baseReferenceDeg + baseYawRad * 180 / Math.PI;
  // S90 is vertical; S- tips toward the board/front, S+ toward the back.
  const shoulderExactDeg = profile.shoulderReferenceDeg
    + (shoulderLinkRad * 180 / Math.PI - 90);
  // E90 is straight; E+ bends the distal link toward the front.
  const elbowExactDeg = profile.elbowReferenceDeg
    - (elbowRelativeRad * 180 / Math.PI - profile.elbowReferenceRelativeDeg);
  const baseCommand = roundCommandDegrees(baseExactDeg);
  const shoulderCommand = roundCommandDegrees(shoulderExactDeg);
  const elbowCommand = roundCommandDegrees(elbowExactDeg);
  const withinCommandDomain = [baseCommand, shoulderCommand, elbowCommand].every(
    angle => angle >= profile.commandDomainMinDeg && angle <= profile.commandDomainMaxDeg,
  );
  return {
    branch,
    baseExactDeg,
    shoulderExactDeg,
    elbowExactDeg,
    baseCommand,
    shoulderCommand,
    elbowCommand,
    withinCommandDomain,
    baseYawRad,
    shoulderLinkRad,
    elbowRelativeRad,
  };
}

export function solveGridPoint(gridX, gridY, profile = CANDIDATE_PROFILE, options = {}) {
  const point = gridToBoardCm(gridX, gridY, profile);
  if (!point) return {reachable: false, withinCommandDomain: false, reason: 'invalid-grid'};

  const radialCm = Math.hypot(point.xCm, point.yCm);
  const verticalCm = -profile.targetDropCm;
  const distanceSquared = radialCm * radialCm + verticalCm * verticalCm;
  let cosineElbow = (distanceSquared - profile.upperLinkCm ** 2 - profile.distalTipLengthCm ** 2)
    / (2 * profile.upperLinkCm * profile.distalTipLengthCm);
  if (cosineElbow < -1.0000001 || cosineElbow > 1.0000001) {
    return {...point, radialCm, reachable: false, withinCommandDomain: false, reason: 'unreachable-geometry'};
  }
  cosineElbow = Math.max(-1, Math.min(1, cosineElbow));
  const baseYawRad = Math.atan2(point.yCm, point.xCm);
  const elbowMagnitudeRad = Math.acos(cosineElbow);
  // Try both exact geometric branches first, preferring the reported front-bending
  // branch. If neither lies in the reported command interval, search legal integer
  // B/E values and the best legal S for each pair; never treat clipping as contact.
  const branches = [
    solveElbowBranch(radialCm, verticalCm, baseYawRad,
      -elbowMagnitudeRad, 'front', profile),
    solveElbowBranch(radialCm, verticalCm, baseYawRad,
      elbowMagnitudeRad, 'back', profile),
  ];
  const selected = branches.find(branch => branch.withinCommandDomain) || branches[0];
  const {baseExactDeg, shoulderExactDeg, elbowExactDeg,
    baseCommand, shoulderCommand, elbowCommand, withinCommandDomain,
    baseYawRad: selectedBaseYawRad, shoulderLinkRad, elbowRelativeRad, branch} = selected;

  const rawCommands = {base: baseCommand, shoulder: shoulderCommand, elbow: elbowCommand};
  const constrainedSearchPerformed = !withinCommandDomain && options.computeClosest !== false;
  const constrainedPose = constrainedSearchPerformed
    ? findClosestLegalCommandPose(point, profile)
    : null;
  const previewCommands = withinCommandDomain
    ? rawCommands
    : constrainedPose?.commands ?? clampServoCommands(rawCommands, profile);
  const previewTip = forwardTipFromCommands(previewCommands, profile);
  const previewMissCm = previewTip ? Math.hypot(
    previewTip.xCm - point.xCm,
    previewTip.yCm - point.yCm,
    previewTip.zCm,
  ) : null;
  const constrainedReachable = Boolean(!withinCommandDomain && constrainedPose
    && previewMissCm <= COMMAND_TIP_TOLERANCE_CM);

  return {
    ...point,
    radialCm,
    baseExactDeg,
    shoulderExactDeg,
    elbowExactDeg,
    baseCommand,
    shoulderCommand,
    elbowCommand,
    rawCommands,
    candidateBranches: branches.map(candidate => ({
      branch: candidate.branch,
      baseCommand: candidate.baseCommand,
      shoulderCommand: candidate.shoulderCommand,
      elbowCommand: candidate.elbowCommand,
      withinCommandDomain: candidate.withinCommandDomain,
    })),
    branch,
    previewCommands,
    previewTip,
    previewMissCm,
    previewAdjusted: !withinCommandDomain,
    constrainedSearchPerformed,
    constrainedReachable,
    constrainedCommands: constrainedPose?.commands ?? null,
    constrainedMissCm: constrainedPose?.missCm ?? null,
    baseYawRad: selectedBaseYawRad,
    shoulderLinkRad,
    elbowRelativeRad,
    reachable: true,
    withinCommandDomain,
    reason: withinCommandDomain ? 'ok'
      : constrainedReachable ? 'within-command-tolerance' : 'outside-command-domain',
  };
}

// Converts integer commands into the 3D rotations. These affine angle-to-joint
// mappings are candidate assumptions beyond the reported 85/90/95 direction checks.
export function servoCommandsToPose(commands, profile = CANDIDATE_PROFILE) {
  return {
    yawRad: (commands.base - profile.baseReferenceDeg) * Math.PI / 180,
    shoulderRad: (90 + commands.shoulder - profile.shoulderReferenceDeg) * Math.PI / 180,
    elbowRelativeRad: (profile.elbowReferenceRelativeDeg
      - (commands.elbow - profile.elbowReferenceDeg)) * Math.PI / 180,
  };
}

// Candidate synchronized interpolation for later firmware matching; not hardware-synced yet.
export function interpolateServoCommands(start, target, tick, totalTicks) {
  const interpolate = (a, b) => {
    if (totalTicks <= 0 || tick >= totalTicks) return b;
    const fraction = tick / totalTicks;
    return roundCommandDegrees(a + (b - a) * fraction);
  };
  return {
    base: interpolate(start.base, target.base),
    shoulder: interpolate(start.shoulder, target.shoulder),
    elbow: interpolate(start.elbow, target.elbow),
  };
}
