export function rotate(point, pivot, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const horizontal = point.x - pivot.x;
  const vertical = point.y - pivot.y;
  return {
    x: pivot.x + horizontal * cosine - vertical * sine,
    y: pivot.y + horizontal * sine + vertical * cosine,
  };
}

export function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function fitRotation(hands, targets, pivot, limit = Math.PI) {
  if (!hands.length || hands.length !== targets.length)
    throw new Error("Equal nonempty hand and target lists required");
  if (!Number.isFinite(limit) || limit < 0 || limit > Math.PI)
    throw new Error("Rotation limit must be between zero and pi");
  if (
    [pivot, ...hands, ...targets].some(
      (point) =>
        !point || !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    throw new Error("Finite points required");
  let dot = 0;
  let cross = 0;
  for (let index = 0; index < hands.length; index++) {
    const source = { x: hands[index].x - pivot.x, y: hands[index].y - pivot.y };
    const target = {
      x: targets[index].x - pivot.x,
      y: targets[index].y - pivot.y,
    };
    dot += source.x * target.x + source.y * target.y;
    cross += source.x * target.y - source.y * target.x;
  }
  const angle = Math.max(-limit, Math.min(limit, Math.atan2(cross, dot)));
  const errors = hands.map((point, index) =>
    distance(rotate(point, pivot, angle), targets[index]),
  );
  return { angle, errors, maximumError: Math.max(...errors) };
}

export function reinPoints(hand, bit, sag = 2, segments = 24) {
  if (
    !Number.isFinite(sag) ||
    sag < 0 ||
    !Number.isInteger(segments) ||
    segments < 1
  )
    throw new Error("Nonnegative sag and positive integer segments required");
  if (
    [hand, bit].some(
      (point) =>
        !point || !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    throw new Error("Finite endpoints required");
  return Array.from({ length: segments + 1 }, (_, index) => {
    if (index === 0) return { ...hand };
    if (index === segments) return { ...bit };
    const fraction = index / segments;
    return {
      x: hand.x + (bit.x - hand.x) * fraction,
      y:
        hand.y +
        (bit.y - hand.y) * fraction +
        4 * sag * fraction * (1 - fraction),
    };
  });
}
