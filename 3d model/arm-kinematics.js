// The elbow and shoulder rotate in the same vertical plane. Coordinates here
// are local to the robot assembly, before its presentation-scale transform.
export function planContact(radius, boardHeight, upperLength, forearmLength, toolDrop, elbowAngle) {
  const x = upperLength + forearmLength * Math.cos(elbowAngle) + toolDrop * Math.sin(elbowAngle);
  const y = forearmLength * Math.sin(elbowAngle) - toolDrop * Math.cos(elbowAngle);
  const reach = Math.hypot(x, y);
  if (radius < 0 || radius > reach) return null;
  const downwardAngle = Math.acos(radius / reach);
  return {
    elbow: elbowAngle,
    pitch: -downwardAngle - Math.atan2(y, x),
    shoulderHeight: boardHeight + Math.sqrt(reach * reach - radius * radius),
    reach,
  };
}
