// Fixed-support inverse kinematics for the base-yaw, shoulder-pitch, and
// elbow-pitch axes. The distal vector includes the forearm, fixed wrist offset,
// selected visible tool length, and needle-shaped tip.
export function planContact(radius, boardHeight, shoulderHeight, upperLength, forearmLength, toolDrop) {
  const values = [radius, boardHeight, shoulderHeight, upperLength, forearmLength, toolDrop];
  if (!values.every(Number.isFinite) || radius < 0 || upperLength <= 0 || forearmLength <= 0 || toolDrop < 0) return null;

  const vertical = boardHeight - shoulderHeight;
  const distance = Math.hypot(radius, vertical);
  const distalLength = Math.hypot(forearmLength, toolDrop);
  const cosine = (distance * distance - upperLength * upperLength - distalLength * distalLength)
    / (2 * upperLength * distalLength);
  if (cosine < -1 - 1e-9 || cosine > 1 + 1e-9) return null;

  const relativeElbow = Math.acos(Math.max(-1, Math.min(1, cosine)));
  const bearing = Math.atan2(vertical, radius);
  const pitch = bearing - Math.atan2(
    distalLength * Math.sin(relativeElbow),
    upperLength + distalLength * Math.cos(relativeElbow),
  );
  const distalOffset = Math.atan2(-toolDrop, forearmLength);
  const elbow = relativeElbow - distalOffset;
  return {elbow, pitch, shoulderHeight, reach: upperLength + distalLength, distance};
}
