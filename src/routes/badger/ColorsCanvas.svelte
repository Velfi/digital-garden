<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    document as docStore,
    colorsTool,
    activeColor,
    activeMaterial,
    cells,
    hoveredCellId,
    selectedCellIds,
    showCellBorders,
    outlineClipD,
    updateDocument
  } from './store';
  import type { Vec2, Cell } from './store/types';
  import { effectiveMetalPaths } from './store/effectivePaths';
  import { fontLoadTick } from './store/fontLibrary';
  import {
    flattenPath,
    isEffectivelyClosed,
    pointInPolygon,
    poleOfInaccessibility
  } from './topology/geometry';
  import { effectiveKind } from './topology/planar';
  import { finishHex } from './exportTextures';

  // Recompute expanded paths whenever the document or font library changes.
  // The fontLoadTick dependency makes expansion rerun when a previously
  // missing font finishes loading, without us having to plumb anything else.
  let renderedPaths = $derived((() => {
    void $fontLoadTick;
    return effectiveMetalPaths($docStore);
  })());

  let viewport: HTMLDivElement | null = $state(null);
  let panX = $state(0);
  let panY = $state(0);
  let scale = $state(1);
  let isPanning = $state(false);
  let spaceHeld = $state(false);
  let panStart: { x: number; y: number; ox: number; oy: number } | null = null;

  function fitToView() {
    if (!viewport) return;
    const w = $docStore.canvas.width;
    const h = $docStore.canvas.height;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw <= 0 || vh <= 0) {
      requestAnimationFrame(fitToView);
      return;
    }
    const s = Math.min(vw / w, vh / h) * 0.9;
    scale = s;
    panX = (vw - w * s) / 2;
    panY = (vh - h * s) / 2;
  }

  function screenToWorld(sx: number, sy: number): Vec2 {
    if (!viewport) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    return { x: (sx - rect.left - panX) / scale, y: (sy - rect.top - panY) / scale };
  }

  function pickCell(p: Vec2): Cell | null {
    // Prefer the smallest-area cell that contains the point so nested cells
    // (e.g. the disc inside a ring) win over their containers. A hole in an
    // outer cell belongs to the inner cell, so we also require the point to
    // not fall inside any of this cell's holes.
    let best: Cell | null = null;
    for (const c of $cells) {
      if (!pointInPolygon(p, c.polygon)) continue;
      let inHole = false;
      for (const h of c.holes) {
        if (pointInPolygon(p, h)) {
          inHole = true;
          break;
        }
      }
      if (inHole) continue;
      if (!best || c.area < best.area) best = c;
    }
    return best;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    const delta = Math.max(-50, Math.min(50, e.deltaY * unit));
    const factor = Math.exp(-delta * 0.0015);
    const ns = Math.max(1, Math.min(500, scale * factor));
    panX = vx - (vx - panX) * (ns / scale);
    panY = vy - (vy - panY) * (ns / scale);
    scale = ns;
  }

  function onDown(e: PointerEvent) {
    if (!viewport) return;
    if (e.button === 1 || spaceHeld) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, ox: panX, oy: panY };
      viewport.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    viewport.setPointerCapture(e.pointerId);
    const p = screenToWorld(e.clientX, e.clientY);
    const hit = pickCell(p);
    if (!hit) return;
    if ($colorsTool === 'fill') {
      const color = $activeColor;
      const material = $activeMaterial;
      updateDocument((d) => {
        if (e.shiftKey) {
          // fill all connected same-color region
          const target = d.colorAssignments[hit.id];
          const toFill = floodSame(hit, target);
          for (const id of toFill) {
            d.colorAssignments[id] = color;
            // Materials are sparse — 'plain' means "unset" on disk.
            if (material === 'plain') delete d.materialAssignments[id];
            else d.materialAssignments[id] = material;
          }
        } else {
          d.colorAssignments[hit.id] = color;
          if (material === 'plain') delete d.materialAssignments[hit.id];
          else d.materialAssignments[hit.id] = material;
        }
      });
    } else if ($colorsTool === 'eyedropper') {
      const existing = $docStore.colorAssignments[hit.id];
      if (existing) activeColor.set(existing);
      activeMaterial.set($docStore.materialAssignments[hit.id] ?? 'plain');
    }
  }

  function floodSame(start: Cell, targetColor: string | undefined): string[] {
    const map = new Map<string, Cell>();
    for (const c of $cells) map.set(c.id, c);
    const out: string[] = [];
    const visited = new Set<string>();
    const stack = [start.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const c = map.get(id);
      if (!c) continue;
      const col = $docStore.colorAssignments[id];
      if (col !== targetColor) continue;
      out.push(id);
      for (const n of c.neighbors) if (!visited.has(n)) stack.push(n);
    }
    return out;
  }

  function onMove(e: PointerEvent) {
    if (isPanning && panStart) {
      panX = panStart.ox + (e.clientX - panStart.x);
      panY = panStart.oy + (e.clientY - panStart.y);
      return;
    }
    const p = screenToWorld(e.clientX, e.clientY);
    const hit = pickCell(p);
    hoveredCellId.set(hit?.id ?? null);
  }

  function onUp() {
    isPanning = false;
    panStart = null;
  }

  function handleKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') {
      spaceHeld = true;
      e.preventDefault();
    }
  }
  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') spaceHeld = false;
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp);
    requestAnimationFrame(fitToView);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    window.removeEventListener('keyup', handleKeyUp);
  });

  function cellD(cell: Cell): string {
    if (cell.polygon.length === 0) return '';
    let d = `M ${cell.polygon[0].x} ${cell.polygon[0].y}`;
    for (let i = 1; i < cell.polygon.length; i++) d += ` L ${cell.polygon[i].x} ${cell.polygon[i].y}`;
    d += ' Z';
    for (const hole of cell.holes) {
      if (hole.length === 0) continue;
      d += ` M ${hole[0].x} ${hole[0].y}`;
      for (let i = 1; i < hole.length; i++) d += ` L ${hole[i].x} ${hole[i].y}`;
      d += ' Z';
    }
    return d;
  }

  function pathD(p: import('./store/types').BadgePath): string {
    let d = `M ${p.start.x} ${p.start.y}`;
    for (const n of p.nodes) {
      if (n.type === 'line') d += ` L ${n.to.x} ${n.to.y}`;
      else if (n.type === 'quad') d += ` Q ${n.control.x} ${n.control.y} ${n.to.x} ${n.to.y}`;
      else d += ` C ${n.c1.x} ${n.c1.y} ${n.c2.x} ${n.c2.y} ${n.to.x} ${n.to.y}`;
    }
    if (isEffectivelyClosed(p)) d += ' Z';
    return d;
  }
</script>

<div
  class="viewport"
  bind:this={viewport}
  class:panning={isPanning}
  class:space-pan={spaceHeld && !isPanning}
  onwheel={handleWheel}
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointerleave={() => hoveredCellId.set(null)}
  role="application"
  aria-label="Badger color canvas"
  tabindex="-1"
>
  <svg
    class="canvas-svg"
    viewBox={`${-panX / scale} ${-panY / scale} ${viewport ? viewport.clientWidth / scale : 600} ${viewport ? viewport.clientHeight / scale : 600}`}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="0"
      y="0"
      width={$docStore.canvas.width}
      height={$docStore.canvas.height}
      fill="#2e2e2e"
      stroke="#999"
      stroke-width={1 / scale}
    />
    <defs>
      {#if $outlineClipD}
        <clipPath id="badger-colors-outline-clip" clipPathUnits="userSpaceOnUse">
          <path d={$outlineClipD} clip-rule="nonzero" />
        </clipPath>
      {/if}
      <pattern
        id="badger-material-glitter"
        patternUnits="userSpaceOnUse"
        width="1.6"
        height="1.6"
      >
        <circle cx="0.25" cy="0.35" r="0.11" fill="rgba(255,255,255,0.9)" />
        <circle cx="1.10" cy="0.20" r="0.07" fill="rgba(255,255,255,0.7)" />
        <circle cx="0.70" cy="0.95" r="0.09" fill="rgba(255,255,255,0.8)" />
        <circle cx="1.35" cy="1.25" r="0.06" fill="rgba(255,255,255,0.6)" />
        <circle cx="0.15" cy="1.40" r="0.08" fill="rgba(0,0,0,0.35)" />
        <circle cx="1.00" cy="0.75" r="0.05" fill="rgba(0,0,0,0.25)" />
      </pattern>
      <linearGradient
        id="badger-material-metallic"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
      >
        <stop offset="0" stop-color="rgba(255,255,255,0.55)" />
        <stop offset="0.45" stop-color="rgba(255,255,255,0)" />
        <stop offset="0.55" stop-color="rgba(0,0,0,0)" />
        <stop offset="1" stop-color="rgba(0,0,0,0.35)" />
      </linearGradient>
    </defs>
    {#each $cells as cell (cell.id)}
      {@const material = $docStore.materialAssignments[cell.id]}
      <path
        d={cellD(cell)}
        fill={$docStore.colorAssignments[cell.id] ?? '#e8e2d0'}
        fill-rule="evenodd"
        stroke={$hoveredCellId === cell.id ? '#3c7fb8' : $showCellBorders ? 'rgba(0,0,0,0.3)' : 'none'}
        stroke-width={$hoveredCellId === cell.id ? 2 / scale : 0.5 / scale}
        class:selected={$selectedCellIds.has(cell.id)}
      />
      {#if material === 'glitter' || material === 'metallic'}
        <path
          d={cellD(cell)}
          fill={material === 'glitter'
            ? 'url(#badger-material-glitter)'
            : 'url(#badger-material-metallic)'}
          fill-rule="evenodd"
          stroke="none"
          pointer-events="none"
        />
      {/if}
    {/each}
    {#each renderedPaths as path (path.id)}
      {@const kind = effectiveKind(path)}
      {@const metalColor = finishHex($docStore.render.finish)}
      <path
        d={pathD(path)}
        fill={kind === 'cutout' ? 'rgba(30,30,30,0.75)' : 'none'}
        stroke={kind === 'cutout' ? '#1b1b1b' : metalColor}
        stroke-width={path.strokeWidth}
        stroke-linecap="round"
        stroke-linejoin="round"
        clip-path={kind !== 'cutout' && $outlineClipD
          ? 'url(#badger-colors-outline-clip)'
          : undefined}
      />
      {#if kind === 'cutout'}
        {@const pole = poleOfInaccessibility(flattenPath(path))}
        {@const c = pole.point}
        {@const halfX = (pole.radius / Math.SQRT2) * 0.8}
        {#if halfX > 0}
          <g
            stroke="#1b1b1b"
            stroke-width={Math.max(path.strokeWidth, 1 / scale)}
            stroke-linecap="round"
            pointer-events="none"
          >
            <line x1={c.x - halfX} y1={c.y - halfX} x2={c.x + halfX} y2={c.y + halfX} />
            <line x1={c.x - halfX} y1={c.y + halfX} x2={c.x + halfX} y2={c.y - halfX} />
          </g>
        {/if}
      {/if}
    {/each}
  </svg>
  <div class="hint">
    {$colorsTool === 'fill'
      ? 'Click a cell to fill · Shift+click to fill all connected same-color cells'
      : 'Click a cell to pick its color'}
  </div>
</div>

<style lang="scss">
  .viewport {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #2e2e2e;
    border: 1px solid #a0a0a0;
    cursor: crosshair;

    &.space-pan {
      cursor: grab;
    }
    &.panning {
      cursor: grabbing;
    }
  }

  .canvas-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .hint {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 0.8rem;
    border-radius: 4px;
  }

  .selected {
    stroke: #ff6ec7 !important;
    stroke-width: 2px;
  }
</style>
