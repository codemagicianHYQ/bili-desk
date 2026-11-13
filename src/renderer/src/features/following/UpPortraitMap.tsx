import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  UpPortraitGraph,
  UpPortraitLink,
  UpPortraitMember,
  UpPortraitProgress,
} from "@shared/types";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface SimNode {
  id: string;
  parentId: string | null;
  name: string;
  level: 1 | 2;
  count: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const BG = "#2c333d";
const L2_ZOOM = 0.82;
const UP_ZOOM = 1.75;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nodeRadius(count: number): number {
  return clamp(3.6 + Math.sqrt(Math.max(count, 1)) * 0.7, 3.6, 15);
}

function buildSimulation(graph: UpPortraitGraph): {
  nodes: SimNode[];
  neighbors: Map<string, Set<string>>;
} {
  const nodes: SimNode[] = graph.domains.map((domain) => ({
    id: domain.id,
    parentId: domain.parentId,
    name: domain.name,
    level: domain.level,
    count: domain.count,
    color: domain.color,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: nodeRadius(domain.count),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const l1 = nodes.filter((node) => node.level === 1);
  const ring = 280 + l1.length * 42;
  l1.forEach((node, index) => {
    const angle = (index / Math.max(l1.length, 1)) * Math.PI * 2 - Math.PI / 2;
    node.x = Math.cos(angle) * ring;
    node.y = Math.sin(angle) * ring;
  });
  for (const parent of l1) {
    const kids = nodes.filter((node) => node.parentId === parent.id);
    if (kids.length === 0) continue;
    const orbit = Math.max(
      parent.radius + 96,
      (kids.length * 34) / (2 * Math.PI),
    );
    const facing = Math.atan2(parent.y, parent.x);
    kids.forEach((kid, index) => {
      const angle = facing + (index / kids.length) * Math.PI * 2;
      kid.x = parent.x + Math.cos(angle) * orbit;
      kid.y = parent.y + Math.sin(angle) * orbit;
    });
  }

  const neighbors = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const bucket = neighbors.get(from) ?? new Set<string>();
    bucket.add(to);
    neighbors.set(from, bucket);
  };
  for (const link of graph.links) {
    if (!byId.has(link.source) || !byId.has(link.target)) continue;
    add(link.source, link.target);
    add(link.target, link.source);
  }
  return { nodes, neighbors };
}

function stepForces(
  nodes: SimNode[],
  links: UpPortraitLink[],
  byId: Map<string, SimNode>,
  showL2: boolean,
  alpha: number,
  draggedId: string | null,
): void {
  const active = nodes.filter(
    (node) => node.level === 1 || (showL2 && node.level === 2),
  );
  const activeIds = new Set(active.map((node) => node.id));
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 0.5) {
        dx = (i + 3) * 0.2;
        dy = (j + 5) * 0.17;
        dist = Math.hypot(dx, dy);
      }
      const gap = a.radius + b.radius + 16;
      let push = 0;
      if (dist < gap) push = ((gap - dist) / dist) * 0.45;
      else push = (520 * alpha) / (dist * dist);
      const ux = (dx / dist) * push;
      const uy = (dy / dist) * push;
      if (a.id !== draggedId) {
        a.x -= ux;
        a.y -= uy;
      }
      if (b.id !== draggedId) {
        b.x += ux;
        b.y += uy;
      }
    }
  }
  for (const link of links) {
    if (!activeIds.has(link.source) || !activeIds.has(link.target)) continue;
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.hypot(dx, dy) || 1;
    const rest =
      source.radius +
      target.radius +
      (link.kind === "parent" ? 54 : link.kind === "l1" ? 180 : 130);
    const stiffness = link.kind === "parent" ? 0.028 : 0.0035;
    const mag = (dist - rest) * stiffness * Math.max(alpha, 0.15);
    const ux = (dx / dist) * mag;
    const uy = (dy / dist) * mag;
    if (source.id !== draggedId) {
      source.vx += ux;
      source.vy += uy;
    }
    if (target.id !== draggedId) {
      target.vx -= ux;
      target.vy -= uy;
    }
  }
  for (const node of active) {
    if (node.id === draggedId) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += -node.x * 0.0015 * alpha;
    node.vy += -node.y * 0.0015 * alpha;
    node.vx *= 0.62;
    node.vy *= 0.62;
    const speed = Math.hypot(node.vx, node.vy);
    if (speed > 14) {
      node.vx = (node.vx / speed) * 14;
      node.vy = (node.vy / speed) * 14;
    }
    node.x += node.vx;
    node.y += node.vy;
  }
}

export function UpPortraitMap({
  focus = null,
}: {
  focus?: { mid: number; uname: string; l1: string; l2: string } | null;
}) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 0.62 });
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<UpPortraitLink[]>([]);
  const membersRef = useRef<UpPortraitMember[]>([]);
  const neighborsRef = useRef<Map<string, Set<string>>>(new Map());
  const alphaRef = useRef(0.9);
  const showL2Ref = useRef(false);
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<{ id: string | null; mid: number | null }>({
    id: null,
    mid: null,
  });
  const dragRef = useRef<
    | { kind: "node"; id: string; moved: boolean; x: number; y: number }
    | { kind: "pan"; moved: boolean; x: number; y: number }
    | null
  >(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;

  const [graph, setGraph] = useState<UpPortraitGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<UpPortraitProgress | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMid, setSelectedMid] = useState<number | null>(null);

  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    const nodes = nodesRef.current.filter((node) => node.level === 1);
    if (!wrap || nodes.length === 0) {
      viewRef.current = { x: 0, y: 0, scale: 0.62 };
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      minY = Math.min(minY, node.y - node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
    }
    const spanX = Math.max(maxX - minX, 80);
    const spanY = Math.max(maxY - minY, 80);
    viewRef.current = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: clamp(
        Math.min(
          (wrap.clientWidth * 0.72) / spanX,
          (wrap.clientHeight * 0.72) / spanY,
        ),
        0.32,
        0.7,
      ),
    };
    showL2Ref.current = viewRef.current.scale >= L2_ZOOM;
  }, []);

  const applyGraph = useCallback(
    (next: UpPortraitGraph) => {
      const built = buildSimulation(next);
      nodesRef.current = built.nodes;
      neighborsRef.current = built.neighbors;
      linksRef.current = next.links;
      membersRef.current = next.members;
      alphaRef.current = 1;
      setGraph(next);
      setSelectedId(null);
      setSelectedMid(null);
      fit();
    },
    [fit],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.biliDesk.taxonomy
      .getUpPortraitGraph()
      .then((next) => {
        if (!cancelled) applyGraph(next);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(formatDisplayedError(err, undefined, "画像读取失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyGraph]);

  useEffect(() => {
    return window.biliDesk.taxonomy.onUpPortraitProgress(setProgress);
  }, []);

  useEffect(() => {
    selectedRef.current = { id: selectedId, mid: selectedMid };
  }, [selectedId, selectedMid]);

  useEffect(() => {
    if (!focus) return;
    const member = membersRef.current.find((item) => item.mid === focus.mid);
    const node =
      (member
        ? nodesRef.current.find((item) => item.id === member.domainId)
        : undefined) ??
      (focus.l2
        ? nodesRef.current.find(
            (item) => item.level === 2 && item.name === focus.l2,
          )
        : undefined) ??
      (focus.l1
        ? nodesRef.current.find(
            (item) => item.level === 1 && item.name === focus.l1,
          )
        : undefined);
    if (!node) return;
    setSelectedId(node.id);
    setSelectedMid(member?.mid ?? null);
    viewRef.current = {
      x: node.x,
      y: node.y,
      scale: node.level === 2 ? 1.28 : 1.08,
    };
    alphaRef.current = Math.max(alphaRef.current, 0.55);
  }, [focus, graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const overPanel = (clientX: number, clientY: number) => {
      const panel = panelRef.current;
      if (!panel) return false;
      const rect = panel.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    };

    const worldOf = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const view = viewRef.current;
      return {
        x: (clientX - rect.left - rect.width / 2) / view.scale + view.x,
        y: (clientY - rect.top - rect.height / 2) / view.scale + view.y,
        px: clientX - rect.left,
        py: clientY - rect.top,
        width: rect.width,
        height: rect.height,
      };
    };

    const focusedDomain = () => hoverRef.current ?? selectedRef.current.id;

    const pick = (clientX: number, clientY: number) => {
      const point = worldOf(clientX, clientY);
      const view = viewRef.current;
      const showL2 = view.scale >= L2_ZOOM;
      const showUp = view.scale >= UP_ZOOM;
      const focus = focusedDomain();
      if (showUp && focus) {
        const anchor = nodesRef.current.find((node) => node.id === focus);
        const people = membersRef.current.filter(
          (member) => member.domainId === focus || member.also.includes(focus),
        );
        if (anchor) {
          let best: UpPortraitMember | null = null;
          let bestDist = 10 / view.scale;
          people.forEach((member, index) => {
            const angle = index * 2.399963229728653;
            const spiral = anchor.radius + 14 + Math.sqrt(index) * 7;
            const x = anchor.x + Math.cos(angle) * spiral;
            const y = anchor.y + Math.sin(angle) * spiral;
            const dist = Math.hypot(x - point.x, y - point.y);
            if (dist < bestDist) {
              best = member;
              bestDist = dist;
            }
          });
          if (best) return { kind: "up" as const, id: focus, mid: best.mid };
        }
      }
      let bestNode: SimNode | null = null;
      let bestDist = Infinity;
      for (const node of nodesRef.current) {
        if (node.level === 2 && !showL2) continue;
        const dist = Math.hypot(node.x - point.x, node.y - point.y);
        const limit = node.radius + 3 / view.scale;
        if (dist <= limit && dist < bestDist) {
          bestNode = node;
          bestDist = dist;
        }
      }
      if (!bestNode) return null;
      return { kind: "domain" as const, id: bestNode.id, mid: null };
    };

    const paint = () => {
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (width < 2 || height < 2) return;
      const dpr = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.floor(width * dpr) ||
        canvas.height !== Math.floor(height * dpr)
      ) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      const view = viewRef.current;
      const showL2 = view.scale >= L2_ZOOM;
      if (showL2 !== showL2Ref.current) {
        showL2Ref.current = showL2;
        if (showL2) alphaRef.current = Math.max(alphaRef.current, 0.72);
      }
      const nodes = nodesRef.current;
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const dragging =
        dragRef.current?.kind === "node" ? dragRef.current.id : null;
      if (alphaRef.current > 0.018 || dragging) {
        stepForces(
          nodes,
          linksRef.current,
          byId,
          showL2,
          alphaRef.current,
          dragging,
        );
        if (!dragging) alphaRef.current *= 0.985;
      }

      const toScreen = (x: number, y: number) => ({
        x: (x - view.x) * view.scale + width / 2,
        y: (y - view.y) * view.scale + height / 2,
      });
      const hover = hoverRef.current;
      const selected = selectedRef.current;
      const focus = hover ?? selected.id;
      const linked = focus ? neighborsRef.current.get(focus) : undefined;
      const dim = Boolean(focus);

      const visible = (node: SimNode) => node.level === 1 || showL2;
      const highlighted = (id: string) =>
        !dim || id === focus || Boolean(linked?.has(id));

      const drawLink = (source: SimNode, target: SimNode, color: string) => {
        const a = toScreen(source.x, source.y);
        const b = toScreen(target.x, target.y);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const sourceR = Math.max(3, source.radius * view.scale);
        const targetR = Math.max(3, target.radius * view.scale);
        const x1 = a.x + ux * sourceR;
        const y1 = a.y + uy * sourceR;
        const x2 = b.x - ux * (targetR + 1);
        const y2 = b.y - uy * (targetR + 1);
        const span = Math.hypot(x2 - x1, y2 - y1);
        if (span < 6) return;
        const head = Math.min(7, span * 0.45);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2 - ux * head, y2 - uy * head);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - ux * head - uy * head * 0.42,
          y2 - uy * head + ux * head * 0.42,
        );
        ctx.lineTo(
          x2 - ux * head + uy * head * 0.42,
          y2 - uy * head - ux * head * 0.42,
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };

      for (const link of linksRef.current) {
        const source = byId.get(link.source);
        const target = byId.get(link.target);
        if (!source || !target || !visible(source) || !visible(target))
          continue;
        if (!showL2 && link.kind !== "l1") continue;
        if (showL2 && link.kind === "l1") continue;
        const hot =
          !dim ||
          source.id === focus ||
          target.id === focus ||
          (linked?.has(source.id) && linked.has(target.id));
        const from =
          link.kind === "parent"
            ? source
            : source.count >= target.count
              ? source
              : target;
        const to = from === source ? target : source;
        drawLink(
          from,
          to,
          hot ? "rgba(78, 148, 224, 0.82)" : "rgba(78, 148, 224, 0.12)",
        );
      }

      const labelBoxes: Array<{ x: number; y: number; w: number; h: number }> =
        [];
      const ordered = [...nodes]
        .filter(visible)
        .sort((a, b) => a.count - b.count);
      for (const node of ordered) {
        const point = toScreen(node.x, node.y);
        const screenR = Math.max(2.4, node.radius * view.scale);
        const hot = highlighted(node.id);
        const picked = node.id === selected.id || node.id === hover;
        ctx.beginPath();
        ctx.arc(point.x, point.y, screenR, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = hot ? 0.95 : 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = picked ? 2 : 1;
        ctx.strokeStyle = picked
          ? "rgba(255,255,255,0.95)"
          : "rgba(255,255,255,0.35)";
        ctx.stroke();
      }

      ctx.font = "12px Microsoft YaHei, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const labelOrder = [...ordered].sort((a, b) => b.count - a.count);
      for (const node of labelOrder) {
        const hot = node.id === hover || node.id === selected.id;
        const point = toScreen(node.x, node.y);
        const screenR = Math.max(3.5, node.radius * view.scale);
        const text = `${node.name} ${node.count}`;
        const widthText = ctx.measureText(text).width;
        const box = {
          x: point.x - widthText / 2,
          y: point.y + screenR + 3,
          w: widthText,
          h: 14,
        };
        const blocked =
          !hot &&
          labelBoxes.some(
            (other) =>
              box.x < other.x + other.w + 4 &&
              box.x + box.w + 4 > other.x &&
              box.y < other.y + other.h &&
              box.y + box.h > other.y,
          );
        if (blocked) continue;
        labelBoxes.push(box);
        ctx.globalAlpha = highlighted(node.id) ? 1 : 0.2;
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(text, point.x, box.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      const pin = focusRef.current;
      const pinMember = pin
        ? membersRef.current.find((item) => item.mid === pin.mid)
        : undefined;
      const pinNode = pin
        ? (nodesRef.current.find((item) => item.id === pinMember?.domainId) ??
          nodesRef.current.find(
            (item) => item.level === 2 && item.name === pin.l2,
          ) ??
          nodesRef.current.find(
            (item) => item.level === 1 && item.name === pin.l1,
          ))
        : undefined;
      if (pin && pinNode && visible(pinNode) && selected.id === pinNode.id) {
        const point = toScreen(pinNode.x, pinNode.y);
        const screenR = Math.max(2.4, pinNode.radius * view.scale);
        const where = [pin.l1, pin.l2].filter(Boolean).join(" / ");
        const text = where ? `${pin.uname} · ${where}` : pin.uname;
        ctx.font = "12px Microsoft YaHei, Segoe UI, sans-serif";
        const widthText = ctx.measureText(text).width;
        const padX = 8;
        const boxW = widthText + padX * 2;
        const boxH = 22;
        const boxX = point.x - boxW / 2;
        const boxY = point.y - screenR - boxH - 8;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 11);
        ctx.fillStyle = "rgba(15, 18, 24, 0.92)";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = pinNode.color;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(text, point.x, boxY + boxH / 2);
        ctx.beginPath();
        ctx.moveTo(point.x - 5, boxY + boxH);
        ctx.lineTo(point.x + 5, boxY + boxH);
        ctx.lineTo(point.x, boxY + boxH + 6);
        ctx.closePath();
        ctx.fillStyle = pinNode.color;
        ctx.fill();
      }

      if (view.scale >= UP_ZOOM && focus) {
        const anchor = byId.get(focus);
        const people = membersRef.current.filter(
          (member) => member.domainId === focus || member.also.includes(focus),
        );
        if (anchor && people.length > 0) {
          people.forEach((member, index) => {
            const angle = index * 2.399963229728653;
            const spiral = anchor.radius + 14 + Math.sqrt(index) * 7;
            const point = toScreen(
              anchor.x + Math.cos(angle) * spiral,
              anchor.y + Math.sin(angle) * spiral,
            );
            const on = selected.mid === member.mid;
            ctx.beginPath();
            ctx.arc(point.x, point.y, on ? 4 : 2.4, 0, Math.PI * 2);
            ctx.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.82)";
            ctx.fill();
            if (on) {
              ctx.textAlign = "left";
              ctx.font = "12px Microsoft YaHei, Segoe UI, sans-serif";
              ctx.fillStyle = "#f8fafc";
              ctx.fillText(member.uname, point.x + 7, point.y - 6);
              ctx.textAlign = "center";
            }
          });
        }
      }
    };

    let frame = 0;
    let stopped = false;
    const loop = () => {
      if (stopped) return;
      paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = worldOf(event.clientX, event.clientY);
      const view = viewRef.current;
      const next = clamp(view.scale * (event.deltaY < 0 ? 1.1 : 0.9), 0.28, 5);
      viewRef.current = {
        scale: next,
        x: point.x - (point.px - point.width / 2) / next,
        y: point.y - (point.py - point.height / 2) / next,
      };
    };
    const onDown = (event: PointerEvent) => {
      if (overPanel(event.clientX, event.clientY)) return;
      const hit = pick(event.clientX, event.clientY);
      if (hit?.kind === "domain") {
        dragRef.current = {
          kind: "node",
          id: hit.id,
          moved: false,
          x: event.clientX,
          y: event.clientY,
        };
        alphaRef.current = Math.max(alphaRef.current, 0.45);
        const node = nodesRef.current.find((item) => item.id === hit.id);
        if (node) {
          node.vx = 0;
          node.vy = 0;
        }
      } else {
        dragRef.current = {
          kind: "pan",
          moved: false,
          x: event.clientX,
          y: event.clientY,
        };
      }
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current && overPanel(event.clientX, event.clientY)) {
        if (hoverRef.current) {
          hoverRef.current = null;
          canvas.style.cursor = "grab";
        }
        return;
      }
      const drag = dragRef.current;
      if (!drag) {
        const hit = pick(event.clientX, event.clientY);
        const next =
          hit?.kind === "domain" ? hit.id : hit?.kind === "up" ? hit.id : null;
        if (hoverRef.current !== next) {
          hoverRef.current = next;
          canvas.style.cursor = hit ? "pointer" : "grab";
        }
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.kind === "pan") {
        viewRef.current.x -= dx / viewRef.current.scale;
        viewRef.current.y -= dy / viewRef.current.scale;
        return;
      }
      const node = nodesRef.current.find((item) => item.id === drag.id);
      if (!node) return;
      const point = worldOf(event.clientX, event.clientY);
      node.x = point.x;
      node.y = point.y;
      node.vx = 0;
      node.vy = 0;
      alphaRef.current = Math.max(alphaRef.current, 0.28);
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (overPanel(event.clientX, event.clientY)) return;
      if (!drag || drag.moved) return;
      const hit = pick(event.clientX, event.clientY);
      if (!hit) {
        setSelectedId(null);
        setSelectedMid(null);
        return;
      }
      if (hit.kind === "up" && hit.mid != null) {
        setSelectedId(hit.id);
        setSelectedMid(hit.mid);
        return;
      }
      setSelectedMid(null);
      setSelectedId(hit.id);
      const node = nodesRef.current.find((item) => item.id === hit.id);
      if (node?.level === 1 && viewRef.current.scale < L2_ZOOM) {
        const from = { ...viewRef.current };
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 320);
          const eased = 1 - (1 - t) ** 3;
          viewRef.current = {
            x: from.x + (node.x - from.x) * eased,
            y: from.y + (node.y - from.y) * eased,
            scale: from.scale + (1.05 - from.scale) * eased,
          };
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.style.cursor = "grab";
    const observer = new ResizeObserver(() => undefined);
    observer.observe(wrap);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      observer.disconnect();
    };
  }, []);

  const rebuild = async () => {
    setRebuilding(true);
    setError("");
    setProgress({
      running: true,
      phase: "followings",
      done: 0,
      total: 0,
      message: "正在读取关注列表…",
    });
    try {
      const next = await window.biliDesk.taxonomy.rebuildUpPortraits();
      applyGraph(next);
    } catch (err) {
      setError(formatDisplayedError(err, undefined, "画像更新失败"));
    } finally {
      setRebuilding(false);
    }
  };

  const ranked = useMemo(
    () =>
      (graph?.domains ?? []).filter((domain) => domain.level === 1).slice(0, 8),
    [graph],
  );
  const selectedDomain =
    graph?.domains.find((domain) => domain.id === selectedId) ?? null;
  const selectedMember =
    graph?.members.find((member) => member.mid === selectedMid) ?? null;
  const listed = useMemo(() => {
    if (!graph || !selectedDomain) return [];
    return graph.members
      .filter((member) => {
        if (selectedDomain.level === 1) {
          if (selectedDomain.id === "l1:未归类")
            return member.domainId === selectedDomain.id;
          return member.tags.some((tag) =>
            tag.startsWith(`${selectedDomain.name}/`),
          );
        }
        return (
          member.domainId === selectedDomain.id ||
          member.also.includes(selectedDomain.id)
        );
      })
      .sort((a, b) => a.uname.localeCompare(b.uname, "zh"));
  }, [graph, selectedDomain]);
  const readyGraph =
    graph && graph.updatedAt > 0 && graph.domains.length > 0 ? graph : null;
  const bar =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div
      ref={wrapRef}
      className="relative min-h-0 flex-1 overflow-hidden bg-[#2c333d]"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      <div className="pointer-events-none absolute left-3 top-3 max-w-sm">
        <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-slate-200 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">领域图</p>
            <Button
              size="sm"
              className="h-7"
              disabled={rebuilding}
              onClick={() => void rebuild()}
            >
              {rebuilding ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {readyGraph ? "更新画像" : "建立画像"}
            </Button>
          </div>
          <p className="mt-1 leading-relaxed text-slate-400">
            {readyGraph
              ? `${readyGraph.upCount} 位 UP · 拖拽圆点可以挪开，空白处拖动画布，滚轮缩放。缩小只看大方向，放大后展开细分和具体 UP。`
              : "还没有画像。生成时会读取关注列表，并用投稿标题、签名和本地分组贴标签。"}
          </p>
          {(rebuilding || progress?.running) && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                {progress && progress.total > 0 ? (
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{ width: `${bar}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-400" />
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                {progress?.message || "正在建立画像…"}
              </p>
            </div>
          )}
          {readyGraph && (
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
              {ranked.map((domain) => (
                <button
                  key={domain.id}
                  type="button"
                  className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/10"
                  onClick={() => {
                    setSelectedMid(null);
                    setSelectedId(domain.id);
                    const node = nodesRef.current.find(
                      (item) => item.id === domain.id,
                    );
                    if (!node) return;
                    viewRef.current = { x: node.x, y: node.y, scale: 1.05 };
                    alphaRef.current = Math.max(alphaRef.current, 0.6);
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: domain.color }}
                  />
                  <span>
                    {domain.name}
                    <span className="ml-1 text-slate-500">{domain.count}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="mt-2 text-rose-300">{error}</p>}
        </div>
      </div>

      {selectedDomain && (
        <div
          ref={panelRef}
          className="absolute bottom-3 right-3 top-16 z-20 flex w-60 flex-col rounded-xl border border-white/10 bg-black/55 text-slate-100 backdrop-blur-sm"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="border-b border-white/10 px-3 py-2">
            <p className="text-sm font-medium">
              {selectedDomain.level === 2
                ? `${graph?.domains.find((item) => item.id === selectedDomain.parentId)?.name ?? ""} / ${selectedDomain.name}`
                : selectedDomain.name}
            </p>
            <p className="text-[11px] text-slate-400">
              {selectedDomain.count} 位
              {selectedMember ? ` · ${selectedMember.uname}` : ""}
            </p>
            {selectedMember && (
              <>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {selectedMember.headline}
                </p>
                <button
                  type="button"
                  className="mt-1 text-xs text-sky-300 hover:underline"
                  onClick={() => navigate(`/up/${selectedMember.mid}`)}
                >
                  打开主页
                </button>
              </>
            )}
          </div>
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-1.5">
            {listed.map((member) => (
              <button
                key={member.mid}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10 ${
                  member.mid === selectedMid ? "bg-white/10" : ""
                }`}
                onClick={() => {
                  setSelectedMid(member.mid);
                }}
              >
                <img
                  src={member.face}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs">{member.uname}</span>
                  <span className="block truncate text-[10px] text-slate-400">
                    {member.tags
                      .map((tag) => tag.split("/")[1] ?? tag)
                      .join(" · ") || "未归类"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          读取画像…
        </div>
      )}
    </div>
  );
}
