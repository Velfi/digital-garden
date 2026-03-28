<script lang="ts">
  import {
    tool,
    faunaStance,
    faunaArchetype,
    faunaAutoFootPlacement,
    faunaAnchorOffsetU,
    faunaAnchorOffsetV,
    faunaBodyYaw,
    faunaBodyArch,
    faunaSpineSegments,
    faunaBodyDims,
    faunaNeckDims,
    faunaHeadDims,
    faunaTailLength,
    faunaShoulderOffsetForward,
    faunaHipOffsetForward,
    faunaFrontUpperLength,
    faunaFrontLowerLength,
    faunaHindUpperLength,
    faunaHindLowerLength,
    faunaLimbTargets,
    faunaLimbPoles,
    faunaLimbMids,
    faunaLimbDistals,
    faunaSpinePose,
    FAUNA_DEFAULTS,
    type FaunaArchetypeId,
    type FaunaStanceId
  } from '../store/index';

  function applyFaunaPreset(stance: FaunaStanceId) {
    const p = FAUNA_DEFAULTS[stance];
    faunaStance.set(stance);
    faunaArchetype.set(p.archetype);
    faunaAutoFootPlacement.set(p.autoFootPlacement);
    faunaAnchorOffsetU.set(p.anchorOffsetU);
    faunaAnchorOffsetV.set(p.anchorOffsetV);
    faunaBodyYaw.set(p.bodyYaw);
    faunaBodyArch.set(p.bodyArch);
    faunaSpineSegments.set(p.spineSegments);
    faunaBodyDims.set({ ...p.bodyDims });
    faunaNeckDims.set({ ...p.neckDims });
    faunaHeadDims.set({ ...p.headDims });
    faunaTailLength.set(p.tailLength);
    faunaShoulderOffsetForward.set(p.shoulderOffsetForward);
    faunaHipOffsetForward.set(p.hipOffsetForward);
    faunaFrontUpperLength.set(p.frontUpperLength);
    faunaFrontLowerLength.set(p.frontLowerLength);
    faunaHindUpperLength.set(p.hindUpperLength);
    faunaHindLowerLength.set(p.hindLowerLength);
    faunaLimbTargets.set({ ...p.limbTargets });
    faunaLimbPoles.set({ ...p.limbPoles });
    faunaLimbMids.set({ ...p.limbMids });
    faunaLimbDistals.set({ ...p.limbDistals });
    faunaSpinePose.set({ ...p.spinePose });
  }

  function resetPoseOnly() {
    const p = FAUNA_DEFAULTS[$faunaStance];
    faunaLimbTargets.set({ ...p.limbTargets });
    faunaLimbPoles.set({ ...p.limbPoles });
    faunaLimbMids.set({ ...p.limbMids });
    faunaLimbDistals.set({ ...p.limbDistals });
    faunaSpinePose.set({ ...p.spinePose });
  }

  const biped = $derived($faunaStance === 'biped');
  const shoulderLabel = $derived(biped ? 'Shoulder forward' : 'Front legs · shoulder');
  const hipLabel = $derived(biped ? 'Hip forward' : 'Hind legs · hip');
  const frontUpperLabel = $derived(biped ? 'Upper arm' : 'Front leg · upper');
  const frontLowerLabel = $derived(biped ? 'Forearm' : 'Front leg · lower');
  const hindUpperLabel = $derived(biped ? 'Thigh' : 'Hind leg · upper');
  const hindLowerLabel = $derived(biped ? 'Shin' : 'Hind leg · lower');
</script>

{#if $tool === 'fauna'}
  <section class="tool-panel-section fauna-panel" aria-label="Fauna creature">
    <p class="fauna-steps">
      <strong>Click a face</strong> to plant the creature, then adjust shape here and
      <strong>drag the colored handles</strong> on the model to pose. Use
      <strong>Done</strong> on the canvas (or <kbd>Enter</kbd>) to stamp voxels;
      <strong>Cancel</strong> to pick another face. Handles disappear after Done.
    </p>

    <div class="fauna-card">
      <h4 class="fauna-card-title">Creature type</h4>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Stance</span>
        <select
          class="tool-panel-select"
          value={$faunaStance}
          onchange={(e) => applyFaunaPreset((e.target as HTMLSelectElement).value as FaunaStanceId)}
          title="Quadruped: four legs on the ground. Biped: upright two-legged."
        >
          <option value="quadruped">Quadruped (four legs)</option>
          <option value="biped">Biped (two legs)</option>
        </select>
        <button type="button" class="tool-panel-btn" onclick={resetPoseOnly} title="Reset limb and spine pose to defaults for this stance">
          Reset pose
        </button>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Foot style</span>
        <select
          class="tool-panel-select"
          value={$faunaArchetype}
          onchange={(e) => faunaArchetype.set((e.target as HTMLSelectElement).value as FaunaArchetypeId)}
          title="How the foot meets the ground: flat foot, toe-walk, or hooves"
        >
          <option value="plantigrade">Plantigrade (flat foot)</option>
          <option value="digitigrade">Digitigrade (on toes)</option>
          <option value="ungulate">Ungulate (hooves)</option>
        </select>
      </div>
      {#if !biped}
        <div class="tool-panel-row fauna-row-checkbox">
          <label class="tool-panel-label" for="fauna-auto-feet">Auto feet</label>
          <input
            id="fauna-auto-feet"
            type="checkbox"
            checked={$faunaAutoFootPlacement}
            onchange={(e) => faunaAutoFootPlacement.set((e.target as HTMLInputElement).checked)}
            title="When on, foot positions follow body size; Tip handles are hidden—pose with elbow/knee and wrist/ankle."
          />
          <span class="fauna-checkbox-hint">
            Places feet under shoulders/hips from measurements. Tip handles stay off while this is on.
          </span>
        </div>
      {/if}
    </div>

    <div class="fauna-card">
      <h4 class="fauna-card-title">Placement on the surface</h4>
      <p class="fauna-hint">Slides move the anchor along the clicked face without moving the camera.</p>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Face angle</span>
        <input
          type="range"
          min="-45"
          max="45"
          step="1"
          value={$faunaBodyYaw}
          oninput={(e) => faunaBodyYaw.set(Number((e.target as HTMLInputElement).value))}
          title="Rotate the creature left/right on the surface"
        />
        <span class="tool-panel-value">{$faunaBodyYaw}°</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Slide ↔</span>
        <input
          type="range"
          min="-24"
          max="24"
          step="1"
          value={$faunaAnchorOffsetU}
          oninput={(e) => faunaAnchorOffsetU.set(Number((e.target as HTMLInputElement).value))}
          title="Move anchor along the face U direction (tangent)"
        />
        <span class="tool-panel-value">{$faunaAnchorOffsetU}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Slide ↕</span>
        <input
          type="range"
          min="-24"
          max="24"
          step="1"
          value={$faunaAnchorOffsetV}
          oninput={(e) => faunaAnchorOffsetV.set(Number((e.target as HTMLInputElement).value))}
          title="Move anchor along the face V direction (tangent)"
        />
        <span class="tool-panel-value">{$faunaAnchorOffsetV}</span>
      </div>
    </div>

    <div class="fauna-card">
      <h4 class="fauna-card-title">Body shape</h4>
      <p class="fauna-hint">
        <strong>Length</strong> runs head-to-tail along the spine.
        <strong>Width</strong> and <strong>Depth</strong> are half-thickness in voxels (from the middle out to each side
        and up/down).
      </p>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Spine pieces</span>
        <input
          type="range"
          min="3"
          max="12"
          step="1"
          value={$faunaSpineSegments}
          oninput={(e) => faunaSpineSegments.set(Number((e.target as HTMLInputElement).value))}
          title="How many segments make up the trunk (smoother curve with more)"
        />
        <span class="tool-panel-value">{$faunaSpineSegments}</span>
      </div>

      <p class="fauna-dim-group">Trunk</p>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Length</span>
        <input
          type="range"
          min="8"
          max="48"
          step="1"
          value={$faunaBodyDims.length}
          oninput={(e) =>
            faunaBodyDims.update((d) => ({
              ...d,
              length: Number((e.target as HTMLInputElement).value)
            }))}
        />
        <span class="tool-panel-value">{$faunaBodyDims.length}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Width</span>
        <input
          type="range"
          min="1"
          max="12"
          step="1"
          value={$faunaBodyDims.halfWidth}
          oninput={(e) =>
            faunaBodyDims.update((d) => ({
              ...d,
              halfWidth: Number((e.target as HTMLInputElement).value)
            }))}
          title="Half-width: voxels from center to left/right"
        />
        <span class="tool-panel-value">{$faunaBodyDims.halfWidth}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Depth</span>
        <input
          type="range"
          min="1"
          max="12"
          step="1"
          value={$faunaBodyDims.halfHeight}
          oninput={(e) =>
            faunaBodyDims.update((d) => ({
              ...d,
              halfHeight: Number((e.target as HTMLInputElement).value)
            }))}
          title="Half-depth: voxels from center up and down"
        />
        <span class="tool-panel-value">{$faunaBodyDims.halfHeight}</span>
      </div>

      <p class="fauna-dim-group">Neck</p>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Length</span>
        <input
          type="range"
          min="1"
          max="24"
          step="1"
          value={$faunaNeckDims.length}
          oninput={(e) =>
            faunaNeckDims.update((d) => ({
              ...d,
              length: Number((e.target as HTMLInputElement).value)
            }))}
        />
        <span class="tool-panel-value">{$faunaNeckDims.length}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Width</span>
        <input
          type="range"
          min="1"
          max="12"
          step="1"
          value={$faunaNeckDims.halfWidth}
          oninput={(e) =>
            faunaNeckDims.update((d) => ({
              ...d,
              halfWidth: Number((e.target as HTMLInputElement).value)
            }))}
        />
        <span class="tool-panel-value">{$faunaNeckDims.halfWidth}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Depth</span>
        <input
          type="range"
          min="1"
          max="12"
          step="1"
          value={$faunaNeckDims.halfHeight}
          oninput={(e) =>
            faunaNeckDims.update((d) => ({
              ...d,
              halfHeight: Number((e.target as HTMLInputElement).value)
            }))}
        />
        <span class="tool-panel-value">{$faunaNeckDims.halfHeight}</span>
      </div>

      <p class="fauna-dim-group">Head</p>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Length</span>
        <input
          type="range"
          min="1"
          max="24"
          step="1"
          value={$faunaHeadDims.length}
          oninput={(e) =>
            faunaHeadDims.update((d) => ({
              ...d,
              length: Number((e.target as HTMLInputElement).value)
            }))}
        />
        <span class="tool-panel-value">{$faunaHeadDims.length}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Width</span>
        <input
          type="range"
          min="1"
          max="12"
          step="1"
          value={$faunaHeadDims.halfWidth}
          oninput={(e) =>
            faunaHeadDims.update((d) => ({
              ...d,
              halfWidth: Number((e.target as HTMLInputElement).value)
            }))}
        />
        <span class="tool-panel-value">{$faunaHeadDims.halfWidth}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Depth</span>
        <input
          type="range"
          min="1"
          max="12"
          step="1"
          value={$faunaHeadDims.halfHeight}
          oninput={(e) =>
            faunaHeadDims.update((d) => ({
              ...d,
              halfHeight: Number((e.target as HTMLInputElement).value)
            }))}
        />
        <span class="tool-panel-value">{$faunaHeadDims.halfHeight}</span>
      </div>

      <div class="tool-panel-row">
        <span class="tool-panel-label">Tail</span>
        <input
          type="range"
          min="0"
          max="16"
          step="1"
          value={$faunaTailLength}
          oninput={(e) => faunaTailLength.set(Number((e.target as HTMLInputElement).value))}
          title="Length of tail voxels behind the body"
        />
        <span class="tool-panel-value">{$faunaTailLength}</span>
      </div>
    </div>

    <div class="fauna-card">
      <h4 class="fauna-card-title">Limb length (bones)</h4>
      <p class="fauna-hint">Default bone lengths for IK; drag handles on the model to pose.</p>
      <div class="tool-panel-row">
        <span class="tool-panel-label">{shoulderLabel}</span>
        <input
          type="range"
          min="-12"
          max="12"
          step="1"
          value={$faunaShoulderOffsetForward}
          oninput={(e) => faunaShoulderOffsetForward.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="tool-panel-value">{$faunaShoulderOffsetForward}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">{hipLabel}</span>
        <input
          type="range"
          min="-12"
          max="12"
          step="1"
          value={$faunaHipOffsetForward}
          oninput={(e) => faunaHipOffsetForward.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="tool-panel-value">{$faunaHipOffsetForward}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">{frontUpperLabel}</span>
        <input
          type="range"
          min="1"
          max="16"
          step="1"
          value={$faunaFrontUpperLength}
          oninput={(e) => faunaFrontUpperLength.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="tool-panel-value">{$faunaFrontUpperLength}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">{frontLowerLabel}</span>
        <input
          type="range"
          min="1"
          max="16"
          step="1"
          value={$faunaFrontLowerLength}
          oninput={(e) => faunaFrontLowerLength.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="tool-panel-value">{$faunaFrontLowerLength}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">{hindUpperLabel}</span>
        <input
          type="range"
          min="1"
          max="16"
          step="1"
          value={$faunaHindUpperLength}
          oninput={(e) => faunaHindUpperLength.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="tool-panel-value">{$faunaHindUpperLength}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">{hindLowerLabel}</span>
        <input
          type="range"
          min="1"
          max="16"
          step="1"
          value={$faunaHindLowerLength}
          oninput={(e) => faunaHindLowerLength.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="tool-panel-value">{$faunaHindLowerLength}</span>
      </div>
    </div>
  </section>
{/if}

<style>
  .fauna-steps {
    font-size: 0.78rem;
    line-height: 1.45;
    margin: 0 0 0.65rem 0;
    opacity: 0.95;
  }

  .fauna-steps kbd {
    font-size: 0.72em;
    padding: 0.05rem 0.25rem;
    border-radius: 3px;
    border: 1px solid var(--border-color);
    background: var(--block-quote-bg-color);
  }

  .fauna-card {
    margin-bottom: 0.65rem;
    padding: 0.45rem 0.5rem;
    border: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--block-quote-bg-color) 35%, transparent);
  }

  .fauna-card-title {
    margin: 0 0 0.4rem 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-color);
  }

  .fauna-hint {
    font-size: 0.72rem;
    line-height: 1.4;
    margin: 0 0 0.45rem 0;
    opacity: 0.88;
  }

  .fauna-dim-group {
    margin: 0.5rem 0 0.25rem 0;
    font-size: 0.74rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    opacity: 0.75;
  }

  .fauna-row-checkbox {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .fauna-checkbox-hint {
    flex: 1 1 100%;
    font-size: 0.7rem;
    line-height: 1.35;
    margin: 0.2rem 0 0 0;
    padding-left: 0.15rem;
    opacity: 0.85;
  }
</style>
