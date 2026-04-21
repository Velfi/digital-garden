<script lang="ts">
  import { setSkipStartup } from './store';

  let {
    open = $bindable(false),
    showDontShowCheckbox = false,
    title = 'Badger help'
  }: {
    open: boolean;
    showDontShowCheckbox?: boolean;
    title?: string;
  } = $props();

  let dontShow = $state(false);

  function close() {
    if (showDontShowCheckbox && dontShow) setSkipStartup(true);
    open = false;
  }
</script>

{#if open}
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && close()}
    onkeydown={(e) => e.key === 'Escape' && close()}
  >
    <div class="modal help-modal">
      <h3>{title}</h3>
      <div class="content">
        <p>
          <strong>Badger</strong> is a vector-first enamel-badge designer. You draw metal boundaries; the app detects the enamel cells between them and lets you paint each one.
        </p>

        <h4>Three modes</h4>
        <ul>
          <li>
            <strong>Metal</strong> — draw the badge silhouette and the dividers that separate enamel regions. Pen (click-click), Pencil (drag for smoothed freehand), Line/Rect/Ellipse/Polygon (click-drag), Outline (one-click circle). Press <kbd>Enter</kbd> to finish a pen path, <kbd>Esc</kbd> to cancel, <kbd>Delete</kbd> to remove selected paths.
          </li>
          <li>
            <strong>Colors</strong> — click a cell to fill it with the active color. <kbd>Shift</kbd>+click to flood-fill all connected same-color cells. Use the Pick tool to grab an existing color.
          </li>
          <li>
            <strong>Render</strong> — a 3D preview with metal finish and enamel material. Drag to orbit; scroll to zoom.
          </li>
        </ul>

        <h4>Metal path kinds</h4>
        <ul>
          <li>
            <strong>Shape</strong> — the default. A closed shape becomes the badge silhouette (enamel cells only appear inside it); an open shape becomes a metal wall between cells, with <em>Stroke width</em> controlling the wall thickness.
          </li>
          <li><strong>Cutout</strong> — a closed hole through the badge.</li>
        </ul>

        <h4>Tips</h4>
        <ul>
          <li>Hold <kbd>Space</kbd> and drag to pan the canvas.</li>
          <li>
            Hold <kbd>Ctrl</kbd> (or <kbd>Cmd</kbd>) while dragging to constrain
            the shape: ellipses and polygons square up (circle / regular polygon),
            and lines snap to 15° increments.
          </li>
          <li>Scroll to zoom. Middle-drag also pans.</li>
          <li>
            Click a vertex or control handle on the selected path to select it;
            <kbd>Shift</kbd>+click adds to the selection.
          </li>
          <li>
            Arrow keys nudge the selected vertices (or, if none, whole paths)
            by 0.1&nbsp;mm; hold <kbd>Shift</kbd> for 1&nbsp;mm.
            <kbd>Delete</kbd> removes selected vertices.
          </li>
          <li>
            <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>C</kbd>, <kbd>X</kbd>, <kbd>V</kbd>
            copy, cut, and paste selected paths. Pasted paths land slightly
            offset from the originals.
          </li>
          <li>All changes autosave to your browser.</li>
        </ul>

        {#if showDontShowCheckbox}
          <label class="dont-show">
            <input type="checkbox" bind:checked={dontShow} />
            Don't show this on startup
          </label>
        {/if}
      </div>
      <div class="modal-buttons">
        <button type="button" onclick={close}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .help-modal {
    max-width: 600px;
    max-height: 80vh;
  }

  .content {
    overflow-y: auto;
    flex: 1;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .content h4 {
    margin-top: 1rem;
    margin-bottom: 0.25rem;
  }

  kbd {
    display: inline-block;
    padding: 0 0.35rem;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--block-quote-bg-color);
    font-family: monospace;
    font-size: 0.85em;
  }

  .dont-show {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 1rem;
  }
</style>
