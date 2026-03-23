<script lang="ts">
  import { untrack } from 'svelte';
  import {
    selection,
    voxels,
    selectionToStampEntries,
    saveSelectionAsStamp,
    applyStampRecordToSelection,
    updateStampName,
    updateStampTags,
    removeStamp,
    reorderStamps,
    stampMatchesSearch,
    normalizeStampTags,
    parseStampLibraryJson,
    stampRecordsToLibraryJson,
    importStampsFromParsed,
    downloadTextFile,
    listStampsOrdered
  } from '../store/index';
  import type { StampBookRecord } from '../store/index';
  import { isStampBookIndexedDBAvailable } from '../stampBookStorage';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let stamps = $state<StampBookRecord[]>([]);
  let thumbUrlById = $state<Record<string, string>>({});
  let selectedStampId = $state<string | null>(null);
  let newStampName = $state('Stamp');
  let busy = $state(false);
  let message = $state('');
  let importInputRef: HTMLInputElement | null = $state(null);
  let exportSelectionById = $state<Record<string, boolean>>({});
  let tileSelectionAnchorId = $state<string | null>(null);
  let nameEdit = $state<Record<string, string>>({});
  let searchQuery = $state('');
  let newStampTags = $state('');
  let tagEditDraft = $state('');
  /** Right page: share (import/export), manage selected stamp, or create new */
  let libraryTab = $state<'share' | 'manage' | 'new'>('manage');
  let loadGen = 0;

  const selectedStamp = $derived(
    selectedStampId ? stamps.find((s) => s.id === selectedStampId) ?? null : null
  );

  const visibleStamps = $derived(stamps.filter((s) => stampMatchesSearch(s, searchQuery)));

  const searchActive = $derived(searchQuery.trim().length > 0);

  function revokeThumbs() {
    for (const u of Object.values(thumbUrlById)) {
      URL.revokeObjectURL(u);
    }
    thumbUrlById = {};
  }

  async function refreshList() {
    const g = ++loadGen;
    if (!isStampBookIndexedDBAvailable()) {
      stamps = [];
      message = 'IndexedDB is not available in this context.';
      return;
    }
    message = '';
    const list = await listStampsOrdered();
    if (g !== loadGen) return;
    revokeThumbs();
    stamps = list;
    const m: Record<string, string> = {};
    for (const s of list) {
      if (s.previewBlob) {
        m[s.id] = URL.createObjectURL(s.previewBlob);
      }
    }
    thumbUrlById = m;
    const allowedIds = new Set(list.map((s) => s.id));
    const nextExportSelection: Record<string, boolean> = {};
    for (const [id, selected] of Object.entries(exportSelectionById)) {
      if (selected && allowedIds.has(id)) nextExportSelection[id] = true;
    }
    exportSelectionById = nextExportSelection;
    nameEdit = {};
    if (selectedStampId && !list.some((s) => s.id === selectedStampId)) {
      selectedStampId = null;
      tagEditDraft = '';
    } else if (selectedStampId) {
      const u = list.find((x) => x.id === selectedStampId);
      if (u) tagEditDraft = (u.tags ?? []).join(', ');
    }
  }

  $effect(() => {
    if (open) {
      untrack(() => {
        void refreshList();
      });
    } else {
      untrack(() => {
        loadGen++;
        revokeThumbs();
        stamps = [];
        selectedStampId = null;
        tagEditDraft = '';
        searchQuery = '';
        newStampTags = '';
        libraryTab = 'manage';
        message = '';
        busy = false;
        exportSelectionById = {};
        tileSelectionAnchorId = null;
      });
    }
  });

  const saveEnabled = $derived(selectionToStampEntries($voxels, $selection) !== null);

  const selectedExportCount = $derived(
    stamps.filter((s) => exportSelectionById[s.id]).length
  );

  function safeFileStem(name: string): string {
    const t = name.trim().replace(/[^\w\-]+/g, '_').slice(0, 64);
    return t || 'stamp';
  }

  async function onSaveFromSelection() {
    if (!saveEnabled || busy) return;
    busy = true;
    message = '';
    try {
      const rec = await saveSelectionAsStamp(newStampName, newStampTags);
      if (!rec) {
        message = 'Could not save (empty selection or no voxels at selected cells).';
      } else {
        newStampName = 'Stamp';
        newStampTags = '';
        await refreshList();
        selectedStampId = rec.id;
        tagEditDraft = (rec.tags ?? []).join(', ');
        libraryTab = 'manage';
      }
    } catch {
      message = 'Failed to save stamp.';
    } finally {
      busy = false;
    }
  }

  function onApply(s: StampBookRecord) {
    applyStampRecordToSelection(s);
    open = false;
  }

  async function onDelete(id: string) {
    if (busy) return;
    const rec = stamps.find((s) => s.id === id);
    const label = (rec?.name ?? '').trim() || 'this stamp';
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete stamp “${label}”? This cannot be undone.`)
    ) {
      return;
    }
    busy = true;
    try {
      if (selectedStampId === id) selectedStampId = null;
      await removeStamp(id);
      await refreshList();
    } finally {
      busy = false;
    }
  }

  async function commitTags(s: StampBookRecord) {
    const next = normalizeStampTags(tagEditDraft);
    const prev = normalizeStampTags(s.tags);
    if (
      next.length === prev.length &&
      next.every((t, i) => t === prev[i])
    ) {
      return;
    }
    busy = true;
    try {
      await updateStampTags(s.id, tagEditDraft);
      await refreshList();
    } finally {
      busy = false;
    }
  }

  async function commitRename(s: StampBookRecord) {
    const draft = nameEdit[s.id];
    if (draft === undefined) return;
    const v = draft.trim();
    if (!v || v === s.name) {
      const next = { ...nameEdit };
      delete next[s.id];
      nameEdit = next;
      return;
    }
    busy = true;
    try {
      await updateStampName(s.id, v);
      await refreshList();
    } finally {
      busy = false;
    }
  }

  function displayName(s: StampBookRecord): string {
    return nameEdit[s.id] ?? s.name;
  }

  function onDragStart(e: DragEvent, id: string) {
    e.dataTransfer?.setData('text/plain', id);
    e.dataTransfer!.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  async function onDropOnTile(e: DragEvent, targetId: string) {
    e.preventDefault();
    const draggedId = e.dataTransfer?.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;
    if (searchActive) return;
    const ids = stamps.map((x) => x.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, draggedId);
    busy = true;
    try {
      await reorderStamps(ids);
      await refreshList();
    } finally {
      busy = false;
    }
  }

  async function onDropEnd(e: DragEvent) {
    e.preventDefault();
    if (searchActive) return;
    const draggedId = e.dataTransfer?.getData('text/plain');
    if (!draggedId) return;
    const ids = stamps.map((x) => x.id);
    const from = ids.indexOf(draggedId);
    if (from < 0 || from === ids.length - 1) return;
    ids.splice(from, 1);
    ids.push(draggedId);
    busy = true;
    try {
      await reorderStamps(ids);
      await refreshList();
    } finally {
      busy = false;
    }
  }

  function exportOne(s: StampBookRecord) {
    downloadTextFile(
      `${safeFileStem(s.name)}.voxelle-stamps.json`,
      stampRecordsToLibraryJson([s])
    );
  }

  function exportAll() {
    if (stamps.length === 0) return;
    downloadTextFile('voxelle-stamp-library.json', stampRecordsToLibraryJson(stamps));
  }

  function exportSelected() {
    const picked = stamps.filter((s) => exportSelectionById[s.id]);
    if (picked.length === 0) return;
    downloadTextFile(
      picked.length === 1
        ? `${safeFileStem(picked[0]!.name)}.voxelle-stamps.json`
        : 'voxelle-stamps-export.json',
      stampRecordsToLibraryJson(picked)
    );
  }

  function selectAllVisibleForExport() {
    if (visibleStamps.length === 0) return;
    const next = { ...exportSelectionById };
    for (const s of visibleStamps) {
      next[s.id] = true;
    }
    exportSelectionById = next;
    const lastVisible = visibleStamps[visibleStamps.length - 1];
    if (lastVisible) tileSelectionAnchorId = lastVisible.id;
  }

  function clearExportSelection() {
    exportSelectionById = {};
    tileSelectionAnchorId = null;
  }

  async function onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    busy = true;
    message = '';
    try {
      const text = await file.text();
      const parsed = parseStampLibraryJson(text);
      if (!parsed.ok) {
        message = parsed.error;
        return;
      }
      await importStampsFromParsed(parsed.stamps);
      await refreshList();
    } catch {
      message = 'Import failed.';
    } finally {
      busy = false;
    }
  }

  function selectOnlyForExport(id: string) {
    exportSelectionById = { [id]: true };
  }

  function toggleExportSelection(id: string) {
    const next = { ...exportSelectionById };
    if (next[id]) {
      delete next[id];
    } else {
      next[id] = true;
    }
    exportSelectionById = next;
  }

  function addRangeToExportSelection(id: string) {
    const ids = visibleStamps.map((s) => s.id);
    const fallbackAnchor =
      (selectedStampId && ids.includes(selectedStampId) && selectedStampId) || id;
    const anchorId =
      (tileSelectionAnchorId && ids.includes(tileSelectionAnchorId) && tileSelectionAnchorId) ||
      fallbackAnchor;
    const anchorIndex = ids.indexOf(anchorId);
    const targetIndex = ids.indexOf(id);
    if (anchorIndex < 0 || targetIndex < 0) {
      selectOnlyForExport(id);
      return;
    }
    const [start, end] =
      anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    const next = { ...exportSelectionById };
    for (let i = start; i <= end; i++) {
      next[ids[i]!] = true;
    }
    exportSelectionById = next;
  }

  function truncateLabel(name: string, max = 14): string {
    const t = name.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
  }

  function selectStampTile(e: MouseEvent, s: StampBookRecord) {
    selectedStampId = s.id;
    tagEditDraft = (s.tags ?? []).join(', ');
    if (e.shiftKey) {
      addRangeToExportSelection(s.id);
      tileSelectionAnchorId = s.id;
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      toggleExportSelection(s.id);
      tileSelectionAnchorId = s.id;
      return;
    }
    selectOnlyForExport(s.id);
    tileSelectionAnchorId = s.id;
  }

  function tagSummary(s: StampBookRecord): string {
    const t = s.tags ?? [];
    if (t.length === 0) return '';
    return t.slice(0, 2).join(' · ');
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay stamp-book-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Stamp book"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal book-folio">
      <div class="book-folio-header">
        <h3 class="book-title">Stamp book</h3>
        <button
          type="button"
          class="book-folio-close"
          aria-label="Close stamp book"
          onclick={() => (open = false)}
        >
          ×
        </button>
      </div>

      <div class="book-spread">
        <div class="book-page book-page--left">
          <h4 class="book-page-label">Collection</h4>
          {#if stamps.length === 0}
            <p class="empty-page">
              No stamps yet. On the Library page, open the <strong>New stamp</strong> tab and save your
              selection.
            </p>
          {:else}
            <label class="search-row field-label">
              Search
              <input
                type="search"
                class="input-recess"
                placeholder="Name or tags…"
                bind:value={searchQuery}
                autocomplete="off"
              />
            </label>
            <p class="collection-hint">
              Click a stamp to select for export. Cmd/Ctrl-click adds more, Shift-click selects a
              range.
            </p>
            {#if visibleStamps.length === 0}
              <p class="empty-page">No stamps match this search.</p>
            {:else}
              <div
                class="stamp-grid"
                role="list"
                aria-label="Stamp thumbnails"
              >
                {#each visibleStamps as s (s.id)}
                  <div class="stamp-grid-cell" role="listitem">
                    <button
                      type="button"
                      class="stamp-tile"
                      class:stamp-tile--selected={!!exportSelectionById[s.id]}
                      class:stamp-tile--active={selectedStampId === s.id}
                      draggable={!searchActive}
                      aria-pressed={!!exportSelectionById[s.id]}
                      aria-label={`Select stamp ${s.name}`}
                      ondragstart={(e) => onDragStart(e, s.id)}
                      ondragover={onDragOver}
                      ondrop={(e) => onDropOnTile(e, s.id)}
                      onclick={(e) => selectStampTile(e, s)}
                    >
                      <span class="stamp-matte">
                        {#if thumbUrlById[s.id]}
                          <img
                            src={thumbUrlById[s.id]}
                            alt=""
                            class="stamp-tile-img"
                            width="64"
                            height="64"
                          />
                        {:else}
                          <span class="stamp-tile-ph" aria-hidden="true">◫</span>
                        {/if}
                      </span>
                      <span class="stamp-tile-caption">{truncateLabel(s.name)}</span>
                      {#if tagSummary(s)}
                        <span class="stamp-tile-tags">{tagSummary(s)}</span>
                      {/if}
                    </button>
                  </div>
                {/each}
              </div>
              <div
                class="grid-drop-end"
                class:grid-drop-end--disabled={searchActive}
                role="region"
                aria-label="Drop to move stamp to end"
                ondragover={(e) => {
                  if (!searchActive) onDragOver(e);
                }}
                ondrop={(e) => {
                  if (!searchActive) onDropEnd(e);
                }}
              >
                {searchActive
                  ? 'Clear search to reorder stamps'
                  : 'Drop here to move to end'}
              </div>
            {/if}
          {/if}
        </div>

        <div class="book-spine" aria-hidden="true"></div>

        <div class="book-page book-page--right">
          <div class="library-tabbed">
            <div class="library-page-header">
              <div class="library-tabs" role="tablist" aria-label="Library">
                <button
                  type="button"
                  class="library-tab"
                  class:library-tab--active={libraryTab === 'manage'}
                  role="tab"
                  aria-selected={libraryTab === 'manage'}
                  id="tab-manage"
                  tabindex={libraryTab === 'manage' ? 0 : -1}
                  onclick={() => (libraryTab = 'manage')}
                >
                  Manage stamps
                </button>
                <button
                  type="button"
                  class="library-tab"
                  class:library-tab--active={libraryTab === 'share'}
                  role="tab"
                  aria-selected={libraryTab === 'share'}
                  id="tab-share"
                  tabindex={libraryTab === 'share' ? 0 : -1}
                  onclick={() => (libraryTab = 'share')}
                >
                  Share stamps
                </button>
                <button
                  type="button"
                  class="library-tab"
                  class:library-tab--active={libraryTab === 'new'}
                  role="tab"
                  aria-selected={libraryTab === 'new'}
                  id="tab-new"
                  tabindex={libraryTab === 'new' ? 0 : -1}
                  onclick={() => (libraryTab = 'new')}
                >
                  Save a stamp
                </button>
              </div>
            </div>

            <div class="library-sheet">
              <div class="library-sheet-inner">
                {#if message}
                  <p class="msg library-msg" role="status">{message}</p>
                {/if}

                {#if libraryTab === 'share'}
                  <div
                    class="library-tab-panel"
                    role="tabpanel"
                    id="panel-share"
                    aria-labelledby="tab-share"
                  >
                    <p class="hint">
                      Import or export stamp libraries as <code>.json</code> (<code>voxelleStampLibrary: 1</code>).
                      Select stamps to export from the collection page on the left.
                    </p>

                    <div class="panel-block toolbar-bevel">
                      <button
                        type="button"
                        class="btn-bevel"
                        disabled={visibleStamps.length === 0 || busy}
                        onclick={selectAllVisibleForExport}
                      >
                        Select all visible ({visibleStamps.length})
                      </button>
                      <button
                        type="button"
                        class="btn-bevel"
                        disabled={selectedExportCount === 0 || busy}
                        onclick={clearExportSelection}
                      >
                        Clear selection
                      </button>
                      <button
                        type="button"
                        class="btn-bevel"
                        disabled={busy}
                        onclick={() => importInputRef?.click()}
                      >
                        Import Stamp Library…
                      </button>
                      <input
                        bind:this={importInputRef}
                        type="file"
                        accept=".json,application/json"
                        class="visually-hidden"
                        onchange={onImportFile}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        class="btn-bevel"
                        disabled={stamps.length === 0 || busy}
                        onclick={exportAll}
                      >
                        Export Stamp Library…
                      </button>
                      <button
                        type="button"
                        class="btn-bevel"
                        disabled={selectedExportCount === 0 || busy}
                        onclick={exportSelected}
                      >
                        Export selected ({selectedExportCount})
                      </button>
                    </div>
                  </div>
                {:else if libraryTab === 'manage'}
                  <div
                    class="library-tab-panel"
                    role="tabpanel"
                    id="panel-manage"
                    aria-labelledby="tab-manage"
                  >
                    <div class="detail-card">
                      {#if selectedStamp}
                        <div class="detail-preview-wrap">
                          {#if thumbUrlById[selectedStamp.id]}
                            <img
                              src={thumbUrlById[selectedStamp.id]}
                              alt=""
                              class="detail-preview"
                            />
                          {:else}
                            <div class="detail-preview detail-preview--ph" aria-hidden="true">◫</div>
                          {/if}
                        </div>
                        <label class="field-label">
                          Name
                          <input
                            type="text"
                            class="input-recess"
                            value={displayName(selectedStamp)}
                            disabled={busy}
                            maxlength="120"
                            aria-label="Stamp name"
                            oninput={(e) =>
                              (nameEdit = {
                                ...nameEdit,
                                [selectedStamp.id]: (e.currentTarget as HTMLInputElement).value
                              })}
                            onblur={() => commitRename(selectedStamp)}
                            onkeydown={(e) =>
                              e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                          />
                        </label>
                        <label class="field-label">
                          Tags
                          <input
                            type="text"
                            class="input-recess"
                            placeholder="Comma-separated"
                            bind:value={tagEditDraft}
                            disabled={busy}
                            maxlength="500"
                            aria-label="Stamp tags"
                            onblur={() => commitTags(selectedStamp)}
                            onkeydown={(e) =>
                              e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                          />
                        </label>
                        <div class="detail-actions">
                          <button
                            type="button"
                            class="btn-bevel btn-bevel--primary"
                            disabled={busy}
                            onclick={() => onApply(selectedStamp)}
                          >
                            Use
                          </button>
                          <button
                            type="button"
                            class="btn-bevel"
                            disabled={busy}
                            onclick={() => exportOne(selectedStamp)}
                          >
                            Export
                          </button>
                          <button
                            type="button"
                            class="btn-bevel btn-bevel--danger"
                            disabled={busy}
                            onclick={() => onDelete(selectedStamp.id)}
                          >
                            Delete
                          </button>
                        </div>
                      {:else}
                        <p class="detail-placeholder">Choose a stamp from the collection page.</p>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <div
                    class="library-tab-panel library-tab-panel--new"
                    role="tabpanel"
                    id="panel-new"
                    aria-labelledby="tab-new"
                  >
                    <p class="hint hint--compact">
                      Save the current voxel selection as a stamp. Add comma-separated <strong>tags</strong> for
                      search.
                    </p>
                    <div class="panel-block panel-block--new-stamp-only">
                      <label class="field-label">
                        New stamp name
                        <input
                          type="text"
                          class="input-recess"
                          bind:value={newStampName}
                          disabled={busy}
                          maxlength="120"
                        />
                      </label>
                      <label class="field-label">
                        Tags (optional)
                        <input
                          type="text"
                          class="input-recess"
                          placeholder="e.g. nature, building"
                          bind:value={newStampTags}
                          disabled={busy}
                          maxlength="500"
                        />
                      </label>
                      <button
                        type="button"
                        class="btn-bevel btn-bevel--primary"
                        disabled={!saveEnabled || busy}
                        onclick={onSaveFromSelection}
                      >
                        Save selection
                      </button>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .stamp-book-overlay {
    background:
      radial-gradient(circle at 18% 14%, rgba(255, 236, 198, 0.12), transparent 42%),
      radial-gradient(circle at 84% 82%, rgba(120, 70, 34, 0.18), transparent 40%),
      rgba(8, 5, 2, 0.72);
  }

  .book-folio {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    width: min(96vw, calc(100vw - 1.5rem));
    min-width: min(92vw, calc(100vw - 1.5rem));
    max-width: min(98vw, calc(100vw - 1rem));
    height: min(90vh, calc(100vh - 2rem));
    max-height: min(92vh, calc(100vh - 1.5rem));
    overflow: hidden;
    padding: 1rem 1.2rem 1.15rem;
    border-radius: 18px;
    background:
      repeating-linear-gradient(
        172deg,
        rgba(255, 255, 255, 0.03) 0 2px,
        transparent 2px 8px
      ),
      linear-gradient(
        120deg,
        rgba(38, 20, 9, 0.92) 0%,
        rgba(82, 45, 26, 0.98) 18%,
        rgba(120, 72, 42, 0.94) 54%,
        rgba(60, 31, 16, 0.98) 100%
      ),
      linear-gradient(
        18deg,
        rgba(255, 222, 170, 0.12) 0%,
        transparent 30%,
        rgba(18, 8, 2, 0.2) 100%
      );
    border: 1px solid rgba(22, 11, 4, 0.9);
    box-shadow:
      inset 0 1px 0 rgba(255, 219, 168, 0.22),
      inset 0 -2px 6px rgba(0, 0, 0, 0.4),
      0 24px 56px rgba(0, 0, 0, 0.58),
      0 6px 14px rgba(0, 0, 0, 0.35);
  }

  .book-folio::before,
  .book-folio::after {
    content: '';
    position: absolute;
    pointer-events: none;
    z-index: 0;
  }

  .book-folio::before {
    inset: 7px;
    border-radius: 12px;
    border: 1px solid rgba(243, 188, 119, 0.24);
    box-shadow:
      inset 0 0 0 1px rgba(40, 20, 10, 0.72),
      inset 0 0 16px rgba(0, 0, 0, 0.35);
  }

  .book-folio::after {
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(circle at 6% 8%, rgba(255, 245, 224, 0.12), transparent 18%),
      radial-gradient(circle at 94% 90%, rgba(24, 12, 4, 0.28), transparent 24%);
    mix-blend-mode: screen;
    opacity: 0.5;
  }

  :global(body.light-mode) .book-folio {
    background:
      repeating-linear-gradient(170deg, rgba(255, 255, 255, 0.2) 0 2px, transparent 2px 8px),
      linear-gradient(
        122deg,
        #96623d 0%,
        #bd8b58 38%,
        #d1a772 62%,
        #8e5c36 100%
      ),
      linear-gradient(
        10deg,
        rgba(255, 244, 220, 0.2),
        rgba(68, 34, 14, 0.12)
      );
    border-color: rgba(72, 40, 20, 0.8);
    box-shadow:
      inset 0 1px 0 rgba(255, 250, 238, 0.5),
      inset 0 -2px 6px rgba(0, 0, 0, 0.2),
      0 16px 36px rgba(0, 0, 0, 0.28),
      0 4px 8px rgba(0, 0, 0, 0.18);
  }

  .book-folio-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0 0 0.65rem;
    padding: 0.2rem 0.2rem 0.35rem;
    position: relative;
    z-index: 1;
  }

  .book-folio-header::after {
    content: '';
    position: absolute;
    left: 0.2rem;
    right: 0.2rem;
    bottom: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(244, 206, 146, 0.35) 15%,
      rgba(40, 20, 9, 0.65) 52%,
      rgba(244, 206, 146, 0.3) 85%,
      transparent 100%
    );
  }

  .book-title {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #efd5aa;
    text-shadow:
      0 1px 0 rgba(34, 17, 6, 0.9),
      0 -1px 0 rgba(255, 224, 170, 0.2),
      0 3px 7px rgba(0, 0, 0, 0.45);
  }

  .book-folio-close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    margin: -0.2rem -0.15rem 0 0;
    padding: 0;
    border: 1px solid rgba(90, 54, 22, 0.95);
    border-radius: 999px;
    background:
      radial-gradient(circle at 34% 28%, rgba(255, 239, 208, 0.9), rgba(218, 170, 93, 0.78) 44%, rgba(120, 72, 26, 0.92) 100%);
    color: #472a10;
    font-size: 1.35rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255, 248, 227, 0.95),
      inset 0 -2px 2px rgba(85, 40, 12, 0.38),
      0 1px 0 rgba(255, 224, 168, 0.32),
      0 2px 4px rgba(0, 0, 0, 0.35);
  }

  .book-folio-close:hover {
    filter: brightness(1.12);
  }

  .book-folio-close:focus-visible {
    outline: 2px solid #ffde99;
    outline-offset: 2px;
  }

  :global(body.light-mode) .book-folio-close {
    color: #5b3516;
  }

  .book-spread {
    display: flex;
    align-items: stretch;
    gap: 0;
    flex: 1;
    min-height: 0;
    position: relative;
    z-index: 1;
    padding: 0.15rem;
    border-radius: 12px;
    background:
      linear-gradient(180deg, rgba(255, 231, 185, 0.08), rgba(12, 6, 3, 0.18)),
      linear-gradient(105deg, rgba(23, 10, 4, 0.64), rgba(59, 29, 15, 0.54));
    box-shadow:
      inset 0 1px 0 rgba(248, 210, 150, 0.2),
      inset 0 -1px 0 rgba(0, 0, 0, 0.4);
  }

  @media (max-width: 42rem) {
    .book-spread {
      flex-direction: column;
      max-height: none;
      min-height: auto;
    }

    .book-spine {
      width: 100% !important;
      min-height: 10px;
      background: linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0.2),
        transparent 40%,
        rgba(255, 255, 255, 0.04) 100%
      ) !important;
    }

    .book-page {
      flex: none;
      max-height: min(40vh, 18rem);
    }

    .book-page--right {
      max-height: none;
    }
  }

  .book-page {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 0.7rem 0.8rem;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    color: #4f3018;
    border: 1px solid rgba(138, 104, 60, 0.45);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      inset 0 -1px 0 rgba(116, 80, 43, 0.3),
      0 4px 10px rgba(0, 0, 0, 0.18);
  }

  .book-page::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 12% 9%, rgba(255, 255, 255, 0.32), transparent 20%),
      radial-gradient(circle at 90% 90%, rgba(114, 77, 43, 0.16), transparent 24%),
      repeating-linear-gradient(
        0deg,
        rgba(117, 83, 44, 0.03) 0 1px,
        transparent 1px 6px
      );
  }

  .book-page--left {
    background: linear-gradient(
      140deg,
      #f2e1c1 0%,
      #ead6b3 42%,
      #e1cba5 100%
    );
  }

  .book-page--right {
    /* No top padding so Library tabs sit on the top edge of the page */
    padding: 0 0.8rem 0.7rem;
    overflow: visible;
    background: linear-gradient(
      220deg,
      #efdfbf 0%,
      #e5d1a9 48%,
      #dbc193 100%
    );
  }

  :global(body.light-mode) .book-page--left {
    background: linear-gradient(
      140deg,
      #f8e9cb,
      #edd9b3
    );
  }

  :global(body.light-mode) .book-page--right {
    background: linear-gradient(
      220deg,
      #f7e7c8,
      #ebd5ad
    );
  }

  .book-spine {
    flex: 0 0 20px;
    width: 20px;
    background: linear-gradient(
      90deg,
      rgba(56, 30, 14, 0.95) 0%,
      rgba(115, 68, 39, 0.98) 40%,
      rgba(71, 37, 18, 0.98) 60%,
      rgba(36, 17, 8, 0.95) 100%
    );
    box-shadow:
      inset 1px 0 0 rgba(244, 206, 136, 0.16),
      inset -1px 0 0 rgba(18, 8, 3, 0.7),
      inset 0 0 12px rgba(0, 0, 0, 0.45);
    position: relative;
  }

  .book-spine::before {
    content: '';
    position: absolute;
    left: 47%;
    top: 7%;
    bottom: 7%;
    width: 2px;
    border-radius: 999px;
    background: rgba(238, 187, 112, 0.25);
    box-shadow:
      -6px 0 0 rgba(26, 12, 4, 0.42),
      6px 0 0 rgba(26, 12, 4, 0.42);
  }

  .book-page-label {
    margin: 0 0 0.4rem;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(71, 39, 18, 0.98);
    text-shadow: 0 1px 0 rgba(255, 246, 223, 0.55);
    font-weight: 700;
  }

  .library-page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.5rem;
    flex-shrink: 0;
    margin-bottom: -1px;
    margin-top: -0.15rem;
    padding-top: 0.35rem;
    position: relative;
    z-index: 4;
  }

  .library-tabbed {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .library-sheet {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    border: 1px solid rgba(131, 96, 59, 0.45);
    background: linear-gradient(
      170deg,
      #f3e3c4 0%,
      #ebd8b1 56%,
      #ddc59b 100%
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 252, 241, 0.9),
      inset 0 -1px 0 rgba(144, 98, 52, 0.28),
      0 3px 10px rgba(0, 0, 0, 0.16),
      0 1px 0 rgba(255, 255, 255, 0.28);
  }

  :global(body.light-mode) .library-sheet {
    border-color: rgba(145, 107, 67, 0.56);
  }

  .library-tabs {
    display: flex;
    align-items: flex-end;
    gap: 0;
    flex-shrink: 0;
    margin-left: auto;
  }

  .library-tab {
    position: relative;
    padding: 0.45rem 0.8rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #f5e6c8;
    cursor: pointer;
    border-radius: 10px 10px 0 0;
    border: 1px solid rgba(82, 48, 22, 0.88);
    border-bottom: none;
    background: linear-gradient(
      180deg,
      #9a6239 0%,
      #6f3f20 58%,
      #4d2a14 100%
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 226, 176, 0.35),
      inset 0 -2px 4px rgba(33, 15, 6, 0.55),
      0 3px 5px rgba(0, 0, 0, 0.35);
    transform: translateY(5px);
    opacity: 0.88;
    z-index: 1;
  }

  .library-tab:nth-child(2) {
    z-index: 2;
    margin-left: -5px;
  }

  .library-tab:nth-child(3) {
    z-index: 3;
    margin-left: -5px;
  }

  .library-tab:hover {
    filter: brightness(1.08);
    opacity: 0.95;
  }

  .library-tab--active {
    z-index: 5 !important;
    transform: translateY(0);
    opacity: 1;
    padding-bottom: 0.55rem;
    border-color: rgba(126, 91, 54, 0.65);
    background: linear-gradient(
      180deg,
      #f8e8c8 0%,
      #ebd2aa 22%,
      #debe8d 100%
    );
    color: #4c2b13;
    box-shadow:
      inset 0 1px 0 rgba(255, 252, 238, 0.88),
      inset 0 -1px 2px rgba(146, 103, 54, 0.28),
      0 -2px 6px rgba(0, 0, 0, 0.12),
      0 2px 4px rgba(0, 0, 0, 0.1);
  }

  :global(body.light-mode) .library-tab {
    color: #f8ebd4;
  }

  :global(body.light-mode) .library-tab--active {
    color: #543017;
  }

  .library-tab:focus-visible {
    outline: 2px solid var(--link-color);
    outline-offset: 2px;
  }

  .library-sheet-inner {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0.55rem 0.6rem 0.45rem;
  }

  .library-tab-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .library-tab-panel--new {
    padding-top: 0.15rem;
  }

  .library-msg {
    margin: 0 0 0.45rem;
  }

  .panel-block--new-stamp-only {
    margin-bottom: 0;
  }

  .search-row {
    flex-shrink: 0;
    margin-bottom: 0.4rem;
  }

  .collection-hint {
    margin: 0 0 0.45rem;
    font-size: 0.72rem;
    line-height: 1.35;
    color: rgba(90, 54, 28, 0.9);
  }

  .empty-page {
    margin: auto 0;
    text-align: center;
    font-size: 0.88rem;
    color: rgba(82, 48, 23, 0.95);
    opacity: 1;
    line-height: 1.5;
    padding: 1rem;
  }

  .stamp-tile-tags {
    display: block;
    font-size: 0.6rem;
    line-height: 1.15;
    text-align: center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(86, 54, 29, 0.92);
    opacity: 0.82;
  }

  .grid-drop-end--disabled {
    opacity: 0.55;
    font-style: italic;
  }

  .stamp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
    gap: 0.55rem;
    overflow-y: auto;
    flex: 1;
    padding: 0.3rem;
    align-content: start;
    border-radius: 8px;
    background:
      repeating-linear-gradient(
        90deg,
        rgba(140, 97, 55, 0.06) 0 1px,
        transparent 1px 12px
      ),
      color-mix(in srgb, #e9d3ac 84%, transparent);
    box-shadow: inset 0 1px 4px rgba(115, 76, 34, 0.16);
  }

  .stamp-grid-cell {
    min-width: 0;
  }

  .stamp-tile {
    width: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.45rem 0.28rem 0.5rem;
    margin: 0;
    cursor: grab;
    border: 1px solid rgba(146, 101, 53, 0.62);
    background:
      radial-gradient(circle at 15% 16%, rgba(255, 255, 255, 0.66), transparent 20%),
      radial-gradient(circle at 82% 86%, rgba(146, 101, 53, 0.14), transparent 28%),
      linear-gradient(180deg, #f7ebd2 0%, #efdcb8 100%);
    color: #472b17;
    font: inherit;
    border-radius: 4px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.88),
      inset 0 -1px 0 rgba(141, 98, 50, 0.25),
      0 3px 7px rgba(63, 33, 14, 0.22);
    transition:
      box-shadow 0.12s ease,
      transform 0.12s ease;
    background-clip: padding-box;
  }

  .stamp-tile:hover {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.92),
      inset 0 -1px 0 rgba(141, 98, 50, 0.3),
      0 0 0 1px rgba(157, 107, 54, 0.46),
      0 5px 10px rgba(63, 33, 14, 0.24);
    transform: translateY(-1px);
  }

  .stamp-tile--selected {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.92),
      inset 0 -1px 0 rgba(141, 98, 50, 0.42),
      0 0 0 2px #be8453,
      0 0 0 4px rgba(235, 199, 132, 0.42),
      0 8px 14px rgba(64, 36, 16, 0.28);
  }

  .stamp-tile--active {
    border-color: rgba(88, 49, 25, 0.88);
    transform: translateY(-1px);
  }

  .stamp-tile:active {
    cursor: grabbing;
  }

  .stamp-tile:focus-visible {
    outline: 2px solid #b77a44;
    outline-offset: 2px;
  }

  .stamp-tile::before {
    content: '';
    position: absolute;
    inset: 1px;
    pointer-events: none;
    border-radius: 3px;
    background:
      radial-gradient(circle, rgba(136, 93, 51, 0.52) 1.05px, transparent 1.1px) 0 0 / 9px 9px;
    opacity: 0.38;
    mask:
      linear-gradient(to bottom, transparent 0 2px, #000 2px calc(100% - 2px), transparent calc(100% - 2px) 100%),
      linear-gradient(to right, transparent 0 2px, #000 2px calc(100% - 2px), transparent calc(100% - 2px) 100%);
  }

  .stamp-matte {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5px;
    background: linear-gradient(145deg, #f9f3e7, #eee1c7);
    border-radius: 4px;
    box-shadow:
      0 1px 2px rgba(68, 41, 18, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  :global(body:not(.light-mode)) .stamp-matte {
    background: linear-gradient(145deg, #f4e5c7, #e2c89f);
    box-shadow: 0 1px 3px rgba(49, 27, 10, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }

  .stamp-tile-img {
    display: block;
    width: 64px;
    height: 64px;
    object-fit: contain;
    border-radius: 2px;
    filter: contrast(1.05) saturate(1.06);
  }

  .stamp-tile-ph {
    display: flex;
    width: 64px;
    height: 64px;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    opacity: 0.45;
  }

  .stamp-tile-caption {
    font-size: 0.68rem;
    line-height: 1.2;
    text-align: center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.95;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .grid-drop-end {
    flex-shrink: 0;
    margin-top: 0.35rem;
    padding: 0.4rem;
    font-size: 0.72rem;
    text-align: center;
    color: rgba(97, 57, 27, 0.92);
    opacity: 1;
    border-radius: 8px;
    border: 1px dashed rgba(142, 97, 49, 0.7);
    box-shadow:
      inset 0 2px 5px rgba(124, 84, 44, 0.16),
      inset 0 1px 0 rgba(255, 245, 225, 0.58);
    background: rgba(240, 220, 183, 0.25);
  }

  .hint {
    font-size: 0.78rem;
    color: rgba(86, 49, 24, 0.94);
    opacity: 1;
    margin: 0 0 0.5rem;
    line-height: 1.45;
  }

  .hint code {
    font-size: 0.72rem;
  }

  .msg {
    margin: 0 0 0.45rem;
    color: #6d4a25;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .panel-block {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-bottom: 0.55rem;
  }

  .hint--compact {
    margin: 0 0 0.4rem;
    font-size: 0.74rem;
    line-height: 1.4;
    color: rgba(86, 49, 24, 0.95);
  }

  .field-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: rgba(74, 43, 20, 0.98);
  }

  .input-recess {
    padding: 0.4rem 0.5rem;
    border-radius: 7px;
    border: 1px solid rgba(143, 101, 56, 0.7);
    background: linear-gradient(180deg, #f8edd8 0%, #f1e1c0 100%);
    color: #432512;
    box-shadow:
      inset 0 1px 2px rgba(116, 72, 33, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.75);
  }

  .input-recess::placeholder {
    color: rgba(112, 79, 49, 0.9);
  }

  :global(body.light-mode) .input-recess {
    background: linear-gradient(180deg, #fdf4e3 0%, #f4e5c5 100%);
  }

  .input-recess:focus {
    outline: 2px solid color-mix(in srgb, var(--link-color) 70%, transparent);
    outline-offset: 1px;
  }

  .btn-bevel {
    padding: 0.4rem 0.65rem;
    font-size: 0.82rem;
    border-radius: 7px;
    cursor: pointer;
    border: 1px solid rgba(108, 66, 31, 0.9);
    background: linear-gradient(
      180deg,
      #f6e5c4 0%,
      #ddbc89 58%,
      #ba8f56 100%
    );
    color: #4a2c15;
    box-shadow:
      inset 0 1px 0 rgba(255, 245, 220, 0.86),
      inset 0 -1px 0 rgba(130, 88, 42, 0.38),
      0 2px 3px rgba(0, 0, 0, 0.2);
  }

  :global(body.light-mode) .btn-bevel {
    color: #502f15;
  }

  .btn-bevel:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  .btn-bevel:active:not(:disabled) {
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
    transform: translateY(1px);
  }

  .btn-bevel:disabled {
    opacity: 0.48;
    cursor: not-allowed;
    transform: none;
  }

  .btn-bevel--primary {
    border-color: rgba(99, 66, 31, 0.95);
    background: linear-gradient(
      180deg,
      #8fa752 0%,
      #678038 100%
    );
    color: #f8f4e8;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
  }

  :global(body.light-mode) .btn-bevel--primary {
    color: #fff;
  }

  .btn-bevel--danger {
    border-color: color-mix(in srgb, var(--border-color) 36%, #6c2316);
    background: linear-gradient(
      180deg,
      #cb6554 0%,
      #983526 100%
    );
    color: #fff;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.3);
  }

  .toolbar-bevel {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.65rem;
  }

  .detail-card {
    flex: 1;
    min-height: 8rem;
    padding: 0.65rem 0.55rem;
    border-radius: 10px;
    background:
      linear-gradient(180deg, rgba(252, 240, 214, 0.86) 0%, rgba(234, 212, 170, 0.9) 100%);
    border: 1px solid rgba(145, 104, 58, 0.4);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 247, 0.75),
      inset 0 -1px 0 rgba(138, 96, 51, 0.3),
      0 2px 7px rgba(0, 0, 0, 0.13);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
  }

  :global(body.light-mode) .detail-card {
    background: linear-gradient(180deg, rgba(255, 247, 231, 0.95) 0%, rgba(241, 224, 192, 0.95) 100%);
  }

  .detail-preview-wrap {
    align-self: center;
    padding: 6px;
    background: linear-gradient(145deg, #f8edda, #ebd8b4);
    border-radius: 6px;
    box-shadow:
      0 2px 4px rgba(68, 41, 18, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.74);
  }

  :global(body:not(.light-mode)) .detail-preview-wrap {
    background: linear-gradient(145deg, #f0e0bf, #e1c79f);
    box-shadow: 0 2px 6px rgba(52, 29, 11, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.45);
  }

  .detail-preview {
    display: block;
    width: min(160px, 100%);
    height: auto;
    max-height: 140px;
    object-fit: contain;
    border-radius: 3px;
  }

  .detail-preview--ph {
    width: 160px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    opacity: 0.4;
  }

  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.15rem;
  }

  .detail-placeholder {
    margin: auto;
    text-align: center;
    font-size: 0.88rem;
    color: rgba(88, 50, 24, 0.95);
    opacity: 1;
    line-height: 1.45;
    padding: 1rem 0.5rem;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
