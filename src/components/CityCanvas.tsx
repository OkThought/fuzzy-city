"use client";
import { useEffect, useRef, useState } from "react";
import { COLORS, type Citizen, type Location, type World } from "../sim/types";
import { MAP, NEIGHBORHOODS } from "../sim/cityGenerator";
import { Rng } from "../sim/rng";

type Props = {
  world: World;
  selectedId?: string;
  onSelect: (id: string) => void;
  layer: "activity" | "uncertainty";
  paused: boolean;
};
function drawMap(ctx: CanvasRenderingContext2D, locations: Location[]) {
  ctx.fillStyle = "#171e20";
  ctx.fillRect(0, 0, MAP.width, MAP.height);
  // A quiet river frames the eastern edge of this invented city.
  ctx.beginPath();
  ctx.moveTo(1390, 0);
  ctx.bezierCurveTo(1320, 350, 1460, 610, 1340, 900);
  ctx.bezierCurveTo(1300, 1010, 880, 1075, 730, 1080);
  ctx.lineTo(1440, 1080);
  ctx.lineTo(1440, 0);
  ctx.fillStyle = "#213135";
  ctx.fill();
  ctx.strokeStyle = "#354547";
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let x = 49; x <= 1369; x += 120) {
    ctx.strokeStyle = "#303839";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(x, 25);
    ctx.lineTo(x, 1040);
    ctx.stroke();
    ctx.strokeStyle = "#3a4140";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (let y = 49; y <= 1009; y += 120) {
    ctx.strokeStyle = "#303839";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(25, y);
    ctx.lineTo(1369, y);
    ctx.stroke();
    ctx.strokeStyle = "#3a4140";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const rng = new Rng("map-details");
  for (const l of locations) {
    if (l.kind === "park") {
      ctx.fillStyle = "#2a3d32";
      ctx.fillRect(l.x, l.y, l.width, l.height);
      ctx.strokeStyle = "#56604a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(l.x + 8, l.y + 80);
      ctx.bezierCurveTo(
        l.x + 30,
        l.y + 10,
        l.x + 65,
        l.y + 90,
        l.x + 92,
        l.y + 10,
      );
      ctx.stroke();
      for (let i = 0; i < 22; i++) {
        const x = l.x + 8 + rng.next() * 82,
          y = l.y + 8 + rng.next() * 82;
        ctx.fillStyle = ["#435441", "#4b5b46", "#364c3b"][i % 3];
        ctx.beginPath();
        ctx.arc(x, y, 3 + rng.next() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (l.kind === "plaza") {
      ctx.fillStyle = "#41433b";
      ctx.fillRect(l.x, l.y, l.width, l.height);
      ctx.strokeStyle = "#626252";
      ctx.lineWidth = 1;
      for (let r = 12; r < 49; r += 10) {
        ctx.beginPath();
        ctx.arc(l.x + 49, l.y + 49, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#7a8e89";
      ctx.beginPath();
      ctx.arc(l.x + 49, l.y + 49, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#101719";
      ctx.fillRect(l.x + 4, l.y + 5, l.width, l.height);
      ctx.fillStyle =
        l.kind === "cafe"
          ? "#635445"
          : l.kind === "work"
            ? "#435053"
            : l.kind === "gallery"
              ? "#68645a"
              : l.kind === "landmark"
                ? "#525b56"
                : ["#3b4341", "#414844", "#36403e", "#444a43"][
                    Math.floor(rng.next() * 4)
                  ];
      ctx.fillRect(l.x, l.y, l.width, l.height);
      ctx.strokeStyle = l.kind === "cafe" ? "#b6966a" : "#667067";
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.strokeRect(l.x + 1, l.y + 1, l.width - 2, l.height - 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#242e2d";
      ctx.fillRect(l.x + 6, l.y + 7, l.width - 12, l.height - 14);
      if (l.kind === "gallery" || l.kind === "landmark") {
        ctx.strokeStyle = "#798174";
        ctx.lineWidth = 3;
        for (let i = 14; i < l.width - 10; i += 12) {
          ctx.beginPath();
          ctx.moveTo(l.x + i, l.y + 12);
          ctx.lineTo(l.x + i, l.y + l.height - 12);
          ctx.stroke();
        }
      } else {
        for (let x = 7; x < l.width - 6; x += 8) {
          ctx.fillStyle = rng.next() > 0.35 ? "#9b9474" : "#515d54";
          ctx.fillRect(l.x + x, l.y + l.height - 4, 3, 2);
        }
      }
    }
  }
  // Street trees and crosswalks make the scale legible without extra geometry.
  for (let y = 49; y < 1010; y += 120)
    for (let x = 49; x < 1370; x += 120) {
      ctx.fillStyle = "#768074";
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 5 + i * 3, y + 12, 1, 5);
      ctx.globalAlpha = 1;
      for (const dx of [20, 106]) {
        ctx.fillStyle = "#405641";
        ctx.beginPath();
        ctx.arc(x + dx, y - 12, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  ctx.font = "10px monospace";
  ctx.letterSpacing = "3px";
  ctx.textAlign = "center";
  ctx.fillStyle = "#9a9d8c";
  NEIGHBORHOODS.forEach((name, i) =>
    ctx.fillText(name, i % 2 ? 1040 : 355, 38 + Math.floor(i / 2) * 240),
  );
  ctx.letterSpacing = "0px";
  for (const l of locations.filter((l) =>
    ["park", "plaza", "gallery"].includes(l.kind),
  )) {
    ctx.fillStyle = "#c2c4ae";
    ctx.font = "10px sans-serif";
    ctx.fillText(l.name, l.x + l.width / 2, l.y + l.height + 10);
  }
}
export default function CityCanvas({
  world,
  selectedId,
  onSelect,
  layer,
  paused,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    wrapper = useRef<HTMLDivElement>(null);
  const props = useRef({ world, selectedId, onSelect, layer, paused });
  props.current = { world, selectedId, onSelect, layer, paused };
  const view = useRef({
    scale: 1,
    x: 0,
    y: 0,
    fit: 1,
    stretch: 1,
    width: 0,
    height: 0,
  });
  const hovered = useRef<Citizen | undefined>(undefined);
  const [hoverName, setHoverName] = useState("");
  const reset = () => {
    const v = view.current;
    v.scale = v.fit;
    v.x = (v.width - MAP.width * v.scale * v.stretch) / 2;
    v.y = (v.height - MAP.height * v.scale) / 2;
  };
  const zoom = (
    factor: number,
    x = view.current.width / 2,
    y = view.current.height / 2,
  ) => {
    const v = view.current;
    const scale = Math.max(v.fit * 0.8, Math.min(v.fit * 5, v.scale * factor));
    v.x = x - ((x - v.x) * scale) / v.scale;
    v.y = y - ((y - v.y) * scale) / v.scale;
    v.scale = scale;
  };
  useEffect(() => {
    const el = canvas.current!,
      ctx = el.getContext("2d")!;
    const background = document.createElement("canvas");
    background.width = MAP.width;
    background.height = MAP.height;
    drawMap(background.getContext("2d")!, world.locations);
    let frame = 0;
    let last = performance.now();
    const positions = new Map<string, { x: number; y: number }>();
    const resize = () => {
      const bounds = wrapper.current!.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      el.width = bounds.width * dpr;
      el.height = bounds.height * dpr;
      view.current.width = bounds.width;
      view.current.height = bounds.height;
      view.current.stretch = Math.max(
        1,
        Math.min(1.8, bounds.width / bounds.height / (MAP.width / MAP.height)),
      );
      view.current.fit =
        Math.min(
          bounds.width / (MAP.width * view.current.stretch),
          bounds.height / MAP.height,
        ) * 0.94;
      reset();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper.current!);
    resize();
    function draw(now: number) {
      const dt = Math.min(100, now - last);
      last = now;
      const p = props.current,
        v = view.current;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#171e20";
      ctx.fillRect(0, 0, v.width, v.height);
      ctx.translate(v.x, v.y);
      ctx.scale(v.scale * v.stretch, v.scale);
      ctx.drawImage(background, 0, 0);
      const night = p.world.minute < 420 || p.world.minute > 1260;
      if (night) {
        ctx.fillStyle = "rgba(8,15,21,0.27)";
        ctx.fillRect(0, 0, MAP.width, MAP.height);
      }
      for (const c of p.world.citizens) {
        let position = positions.get(c.id);
        if (!position) {
          position = { ...c.position };
          positions.set(c.id, position);
        }
        const smooth = 1 - Math.exp(-dt / 90);
        position.x += (c.position.x - position.x) * smooth;
        position.y += (c.position.y - position.y) * smooth;
        const active = c.id === p.selectedId || c.id === hovered.current?.id;
        ctx.fillStyle =
          p.layer === "uncertainty"
            ? c.currentPlan
              ? `hsl(${40 + (1 - c.uncertainty) * 120} 44% ${50 + c.uncertainty * 25}%)`
              : "#737e7c"
            : COLORS[c.activity];
        ctx.beginPath();
        ctx.ellipse(
          position.x,
          position.y,
          (active ? 4 : 1.65) / Math.max(0.7, v.scale) / v.stretch,
          (active ? 4 : 1.65) / Math.max(0.7, v.scale),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        if (active) {
          ctx.strokeStyle = "#f1deaf";
          ctx.lineWidth = 1 / v.scale;
          ctx.beginPath();
          ctx.ellipse(
            position.x,
            position.y,
            9 / v.scale / v.stretch,
            9 / v.scale,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          if (c.route.length) {
            ctx.setLineDash([4 / v.scale, 5 / v.scale]);
            ctx.beginPath();
            ctx.moveTo(position.x, position.y);
            for (const stop of c.route) ctx.lineTo(stop.x, stop.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    let drag:
      | { x: number; y: number; startX: number; startY: number; moved: boolean }
      | undefined;
    const point = (event: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    };
    const nearest = (x: number, y: number) => {
      const v = view.current;
      let best: Citizen | undefined;
      let distance = 12;
      for (const c of props.current.world.citizens) {
        const pos = positions.get(c.id) ?? c.position;
        const d = Math.hypot(
          pos.x * v.scale * v.stretch + v.x - x,
          pos.y * v.scale + v.y - y,
        );
        if (d < distance) {
          distance = d;
          best = c;
        }
      }
      return best;
    };
    const down = (event: PointerEvent) => {
      const p = point(event);
      drag = { ...p, startX: p.x, startY: p.y, moved: false };
      el.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const p = point(event);
      if (drag) {
        if (Math.hypot(p.x - drag.startX, p.y - drag.startY) > 5)
          drag.moved = true;
        view.current.x += p.x - drag.x;
        view.current.y += p.y - drag.y;
        drag.x = p.x;
        drag.y = p.y;
      } else {
        hovered.current = nearest(p.x, p.y);
        setHoverName(
          hovered.current
            ? `${hovered.current.firstName} ${hovered.current.lastName}`
            : "",
        );
        el.style.cursor = hovered.current ? "pointer" : "grab";
      }
    };
    const up = (event: PointerEvent) => {
      const p = point(event);
      if (drag && !drag.moved) {
        const citizen = nearest(p.x, p.y);
        if (citizen) props.current.onSelect(citizen.id);
      }
      drag = undefined;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const p = point(event);
      zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [world]);
  return (
    <div ref={wrapper} className="map-wrap">
      <canvas
        ref={canvas}
        aria-label={`City map with ${world.citizens.length.toLocaleString()} simulated citizens. Drag to pan, scroll to zoom, click a citizen to inspect.`}
        data-population={world.citizens.length}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSelect(world.citizens[0].id);
          if (event.key === "+" || event.key === "=") zoom(1.2);
          if (event.key === "-") zoom(1 / 1.2);
        }}
      />
      <div className="map-topline">
        <span>
          <i className="status-dot" />{" "}
          {paused ? "OBSERVATION PAUSED" : "CITY IN MOTION"}
        </span>
        <span>SEED / {world.seed}</span>
      </div>
      <div className="compass">
        N<span>↑</span>
      </div>
      <div className="map-caption">
        {hoverName || "Every point is a person. Every evening, a possibility."}
      </div>
      <div className="map-tools">
        <button title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.25)}>
          +
        </button>
        <button
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoom(0.8)}
        >
          −
        </button>
        <button title="Fit city" aria-label="Fit city" onClick={reset}>
          ⌗
        </button>
      </div>
    </div>
  );
}
