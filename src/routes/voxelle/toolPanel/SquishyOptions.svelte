<script lang="ts">
  import {
    tool,
    squishyDefaultRadius,
    squishyMetaballs,
    squishyMode,
    squishySelectedId,
    squishyHollow,
    squishyHollowWallThickness,
    PLANE_CUBOID_HOLLOW_WALL_MAX
  } from '../store/index';

  const squishyPanelVisible = $derived($tool === 'squishy');

  const selectedMetaball = $derived(
    $squishyMode === 'edit' && $squishySelectedId
      ? ($squishyMetaballs.find((b) => b.id === $squishySelectedId) ?? null)
      : null
  );

  /** Edit + selection: selected ball radius; otherwise default for new balls in Add. */
  const radiusSliderValue = $derived(
    selectedMetaball !== null ? selectedMetaball.radius : $squishyDefaultRadius
  );

  function clampRadius(v: number): number {
    return Math.max(0.5, Math.min(32, Math.round(v)));
  }

  function onRadiusInput(raw: number) {
    const r = clampRadius(raw);
    if ($squishyMode === 'edit' && $squishySelectedId) {
      const id = $squishySelectedId;
      squishyMetaballs.update((balls) =>
        balls.map((b) => (b.id === id ? { ...b, radius: r } : b))
      );
    } else {
      squishyDefaultRadius.set(r);
    }
  }
</script>

{#if squishyPanelVisible}
  <section class="tool-panel-section" aria-label="Squishy">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Radius</span>
      <input
        type="range"
        min="1"
        max="32"
        step="1"
        value={radiusSliderValue}
        oninput={(e) => onRadiusInput(Number((e.target as HTMLInputElement).value))}
        title={selectedMetaball
          ? 'Radius of the selected metaball'
          : 'Default radius for newly added metaballs (Add mode)'}
      />
      <span class="tool-panel-value">{Math.round(radiusSliderValue)}</span>
    </div>
    <label class="tool-panel-check">
      <input
        type="checkbox"
        checked={$squishyHollow}
        onchange={(e) => squishyHollow.set((e.target as HTMLInputElement).checked)}
        title="Hollow: keep only outer voxel layers when voxelizing (Done / preview)"
      />
      Hollow
    </label>
    {#if $squishyHollow}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Wall thickness</span>
        <input
          type="range"
          min="1"
          max={PLANE_CUBOID_HOLLOW_WALL_MAX}
          step="1"
          value={Math.min(
            PLANE_CUBOID_HOLLOW_WALL_MAX,
            Math.max(1, Math.floor($squishyHollowWallThickness))
          )}
          oninput={(e) =>
            squishyHollowWallThickness.set(Number((e.target as HTMLInputElement).value))}
          title="Shell depth in voxels from the outside air interface"
        />
        <span class="tool-panel-value"
          >{Math.min(
            PLANE_CUBOID_HOLLOW_WALL_MAX,
            Math.max(1, Math.floor($squishyHollowWallThickness))
          )}</span
        >
      </div>
    {/if}
    <p class="tool-panel-copy">
      Modes: <strong>Add</strong> (A), <strong>Edit</strong> (E), <strong>Delete</strong> (D). Done
      voxelizes; Cancel or Escape discards.
    </p>
    <p class="tool-panel-copy">
      Current: <strong>{$squishyMode}</strong>, metaballs: <strong>{$squishyMetaballs.length}</strong>.
    </p>
  </section>
{/if}

<style>
  .tool-panel-copy {
    margin: 0;
    font-size: 0.78rem;
    opacity: 0.85;
    line-height: 1.35;
  }
</style>
