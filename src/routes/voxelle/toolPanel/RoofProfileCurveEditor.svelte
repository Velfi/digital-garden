<script lang="ts">
  import {
    roofProfileCurve,
    type RoofProfilePoint
  } from '../store/index';
  import {
    clamp01,
    normalizeRoofProfilePoints,
    ROOF_PROFILE_CURVE_DEFAULT
  } from '../store/generators/roofProfileCurve';

  const W = 200;
  const H = 118;
  const padL = 24;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const MAX_POINTS = 14;
  const MIN_GAP = 0.04;

  let svgEl = $state<SVGSVGElement | null>(null);
  let dragIdx = $state<number | null>(null);

  const pts = $derived(normalizeRoofProfilePoints($roofProfileCurve));

  function toSvg(p: RoofProfilePoint): { sx: number; sy: number } {
    const pw = W - padL - padR;
    const ph = H - padT - padB;
    return {
      sx: padL + p.x * pw,
      sy: padT + (1 - p.y) * ph
    };
  }

  /** Viewport → SVG viewBox user units (getScreenCTM maps user space → screen; inverse expects client coords). */
  function clientToData(clientX: number, clientY: number): RoofProfilePoint | null {
    if (!svgEl) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    let inv: DOMMatrix;
    try {
      inv = ctm.inverse();
    } catch {
      return null;
    }
    const loc = pt.matrixTransform(inv);
    const pw = W - padL - padR;
    const ph = H - padT - padB;
    return {
      x: clamp01((loc.x - padL) / pw),
      y: clamp01(1 - (loc.y - padT) / ph)
    };
  }

  function commit(next: RoofProfilePoint[]) {
    roofProfileCurve.set(normalizeRoofProfilePoints(next));
  }

  function onPointerDown(i: number, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const n = normalizeRoofProfilePoints($roofProfileCurve).length;
    if (e.shiftKey && i > 0 && i < n - 1) {
      removeInterior(i);
      return;
    }
    dragIdx = i;
    svgEl?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (dragIdx === null) return;
    const raw = clientToData(e.clientX, e.clientY);
    if (!raw) return;
    const cur = normalizeRoofProfilePoints($roofProfileCurve);
    const n = cur.length;
    const next = cur.map((p) => ({ ...p }));
    const i = dragIdx;
    if (i < 0 || i >= n) return;

    if (i === 0) {
      next[0] = { x: 0, y: clamp01(raw.y) };
    } else if (i === n - 1) {
      next[n - 1] = { x: 1, y: clamp01(raw.y) };
    } else {
      const xMin = next[i - 1]!.x + MIN_GAP;
      const xMax = next[i + 1]!.x - MIN_GAP;
      next[i] = {
        x: clamp01(Math.min(xMax, Math.max(xMin, raw.x))),
        y: clamp01(raw.y)
      };
    }
    const edited = { ...next[i]! };
    const normalized = normalizeRoofProfilePoints(next);
    roofProfileCurve.set(normalized);
    if (i === 0) {
      dragIdx = 0;
    } else if (i === n - 1) {
      dragIdx = normalized.length - 1;
    } else {
      const j = normalized.findIndex(
        (p) => Math.abs(p.x - edited.x) < 1e-5 && Math.abs(p.y - edited.y) < 1e-5
      );
      if (j >= 0) dragIdx = j;
    }
  }

  function endDrag(e: PointerEvent) {
    if (dragIdx === null) return;
    try {
      svgEl?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragIdx = null;
  }

  function onDblClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const raw = clientToData(e.clientX, e.clientY);
    if (!raw) return;
    const cur = normalizeRoofProfilePoints($roofProfileCurve);
    if (cur.length >= MAX_POINTS) return;
    if (raw.x <= MIN_GAP || raw.x >= 1 - MIN_GAP) return;
    for (const p of cur) {
      if (Math.abs(p.x - raw.x) < MIN_GAP && Math.abs(p.y - raw.y) < MIN_GAP) return;
    }
    const merged = [...cur, raw].sort((a, b) => a.x - b.x);
    commit(merged);
  }

  function removeInterior(i: number) {
    const cur = normalizeRoofProfilePoints($roofProfileCurve);
    if (i <= 0 || i >= cur.length - 1) return;
    const next = cur.filter((_, j) => j !== i);
    commit(next);
  }

  function resetCurve() {
    commit([...ROOF_PROFILE_CURVE_DEFAULT]);
  }

  const lineD = $derived.by(() => {
    if (pts.length < 2) return '';
    return pts
      .map((p, i) => {
        const { sx, sy } = toSvg(p);
        return `${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`;
      })
      .join(' ');
  });
</script>

<div class="roof-curve-editor" aria-label="Roof height profile editor">
  <div class="roof-curve-toolbar">
    <button type="button" class="roof-curve-reset" onclick={resetCurve} title="Reset to straight ramp">
      Reset curve
    </button>
  </div>
  <svg
    bind:this={svgEl}
    class="roof-curve-svg"
    viewBox="0 0 {W} {H}"
    role="img"
    aria-label="Height vs distance from eave. Double-click to add a point."
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onlostpointercapture={endDrag}
    ondblclick={onDblClick}
  >
    <rect
      x={padL}
      y={padT}
      width={W - padL - padR}
      height={H - padT - padB}
      class="roof-curve-plot-bg"
      rx="3"
    />
    <text x={padL} y={H - 4} class="roof-curve-axis roof-curve-axis--x">Eave → center</text>
    <text x="6" y={padT + 42} class="roof-curve-axis roof-curve-axis--y">H</text>
    <path d={lineD} class="roof-curve-line" fill="none" />
    {#each pts as p, i (i)}
      {@const { sx, sy } = toSvg(p)}
      <circle
        cx={sx}
        cy={sy}
        r={dragIdx === i ? 6 : 5}
        class="roof-curve-handle"
        class:roof-curve-handle--end={i === 0 || i === pts.length - 1}
        role="button"
        tabindex="0"
        aria-label={i === 0
          ? 'Eave height'
          : i === pts.length - 1
            ? 'Center height'
            : `Control point ${i + 1}; Shift+click to remove`}
        onpointerdown={(e) => onPointerDown(i, e)}
      />
    {/each}
  </svg>
  <p class="roof-curve-hint">
    Drag to edit. Double-click plot to add a point (max {MAX_POINTS}). Shift+click a middle point to remove.
  </p>
</div>

<style>
  .roof-curve-editor {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }

  .roof-curve-toolbar {
    display: flex;
    justify-content: flex-end;
  }

  .roof-curve-reset {
    padding: 0.2rem 0.45rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .roof-curve-reset:hover {
    filter: brightness(1.06);
  }

  .roof-curve-svg {
    width: 100%;
    max-width: 220px;
    height: auto;
    display: block;
    touch-action: none;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background: var(--bg-color);
  }

  .roof-curve-plot-bg {
    fill: color-mix(in srgb, var(--bg-color) 92%, var(--text-color) 8%);
    stroke: var(--border-color);
    stroke-width: 0.5;
  }

  .roof-curve-axis {
    fill: var(--text-color);
    font-size: 8px;
    opacity: 0.65;
    pointer-events: none;
  }

  .roof-curve-line {
    stroke: var(--accent-color, #5b8cff);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .roof-curve-handle {
    fill: var(--accent-color, #5b8cff);
    stroke: var(--bg-color);
    stroke-width: 1.5;
    cursor: grab;
  }

  .roof-curve-handle--end {
    fill: color-mix(in srgb, var(--accent-color, #5b8cff) 75%, var(--text-color) 25%);
  }

  .roof-curve-handle:active {
    cursor: grabbing;
  }

  .roof-curve-hint {
    margin: 0;
    font-size: 0.7rem;
    opacity: 0.75;
    line-height: 1.25;
  }
</style>
