import { MAP } from "./cityGenerator";
import type { Citizen, Location, Vec2 } from "./types";
import type { Rng } from "./rng";
export function roadPoint(point: Vec2): Vec2 {
  return {
    x: Math.max(49, Math.floor((point.x - 49) / MAP.block) * MAP.block + 49),
    y: Math.max(49, Math.floor((point.y - 49) / MAP.block) * MAP.block + 49),
  };
}
export function travel(c: Citizen, location: Location, rng: Rng) {
  if (
    c.destinationId === location.id &&
    (c.route.length || c.currentLocationId === location.id)
  )
    return;
  const start = roadPoint(c.position),
    end = roadPoint(location);
  c.destinationId = location.id;
  c.route = [
    start,
    { x: end.x, y: start.y },
    end,
    {
      x: location.x + 5 + rng.next() * (location.width - 10),
      y: location.y + 5 + rng.next() * (location.height - 10),
    },
  ];
  c.currentLocationId = "";
  c.activity = "commute";
}
export function move(c: Citizen, distance = 26): boolean {
  if (!c.route.length) return false;
  while (c.route.length && distance > 0) {
    const next = c.route[0];
    const dx = next.x - c.position.x,
      dy = next.y - c.position.y,
      d = Math.hypot(dx, dy);
    if (d <= distance) {
      c.position = { ...next };
      c.route.shift();
      distance -= d;
    } else {
      c.position.x += (dx / d) * distance;
      c.position.y += (dy / d) * distance;
      distance = 0;
    }
  }
  if (!c.route.length) {
    c.currentLocationId = c.destinationId;
    return true;
  }
  return false;
}
