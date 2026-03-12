<script lang="ts">
	import {
		gridSize,
		tool,
		color,
		palette,
		strokeMode,
		lightAngle,
		lightColor,
		backgroundColor,
		showGrid,
		showSSAO,
		sidebarOpen,
		history,
		canUndo,
		canRedo,
		resetCanvas,
		voxels,
		type GridSize
	} from './store';
	import { exportVoxelsToGltf } from './exportGltf';
	import ArtSidebar from '$lib/components/ArtSidebar.svelte';
	import LospecPalette from '$lib/components/LospecPalette.svelte';
	import UndoRedoButtons from '$lib/components/UndoRedoButtons.svelte';

	let showNewGrid = $state(false);
	let newGridSize = $state<GridSize>(32);

	function openNewGrid() {
		newGridSize = $gridSize;
		showNewGrid = true;
	}

	function createGrid() {
		const size = newGridSize === 64 ? 64 : 32;
		gridSize.set(size);
		resetCanvas(size);
		newGridSize = size;
		showNewGrid = false;
	}
</script>

<ArtSidebar open={sidebarOpen}>
	<h2>Tool</h2>
	<div class="tool-buttons">
			<button
				type="button"
				class:active={$tool === 'remove'}
				onclick={() => tool.set('remove')}
				title="Remove voxels"
			>
				Remove
			</button>
			<button
				type="button"
				class:active={$tool === 'add'}
				onclick={() => tool.set('add')}
				title="Add voxels"
			>
				Add
			</button>
			<button
				type="button"
				class:active={$tool === 'paint'}
				onclick={() => tool.set('paint')}
				title="Paint voxels"
			>
				Paint
			</button>
	</div>

	<div class="stroke-mode" role="group" aria-labelledby="stroke-label">
			<span id="stroke-label" class="stroke-label">Stroke</span>
			<div class="stroke-buttons">
				<button
					type="button"
					class:active={$strokeMode === 'line'}
					onclick={() => strokeMode.set('line')}
					title="Draw lines (axis-aligned)"
				>
					Line
				</button>
				<button
					type="button"
					class:active={$strokeMode === 'plane'}
					onclick={() => strokeMode.set('plane')}
					title="Fill whole plane"
				>
					Plane
				</button>
				<button
					type="button"
					class:active={$strokeMode === 'cuboid'}
					onclick={() => strokeMode.set('cuboid')}
					title="First drag sets plane, next click sets depth"
				>
					Cuboid
				</button>
			</div>
	</div>

	<div class:dimmed={$tool === 'remove'}>
			<h2>Color</h2>
			<div class="color-row">
				<input
					id="color-picker"
					type="color"
					value={$color}
					oninput={(e) => color.set((e.target as HTMLInputElement).value)}
					disabled={$tool === 'remove'}
				/>
				<input
					type="text"
					class="color-hex"
					value={$color}
					oninput={(e) => color.set((e.target as HTMLInputElement).value)}
				/>
		</div>
		<LospecPalette color={color} palette={palette} disabled={$tool === 'remove'} defaultSlug="resurrect-64" />
	</div>

	<h2>Scene</h2>
	<div class="light-control">
		<label class="checkbox-label">
			<input type="checkbox" checked={$showGrid} onchange={(e) => showGrid.set((e.target as HTMLInputElement).checked)} />
			Show borders
		</label>
	</div>
	<div class="light-control">
		<label class="checkbox-label">
			<input type="checkbox" checked={$showSSAO} onchange={(e) => showSSAO.set((e.target as HTMLInputElement).checked)} />
			Ambient occlusion
		</label>
	</div>
	<div class="light-control">
		<label for="background-color">Background</label>
		<input
			id="background-color"
			type="color"
			value={$backgroundColor}
			oninput={(e) => backgroundColor.set((e.target as HTMLInputElement).value)}
		/>
	</div>
	<h2>Light</h2>
	<div class="light-control">
		<label for="light-color">Color</label>
		<input
			id="light-color"
			type="color"
			value={$lightColor}
			oninput={(e) => lightColor.set((e.target as HTMLInputElement).value)}
		/>
	</div>
	<div class="light-control">
		<label for="light-angle">Angle</label>
		<div class="slider-row">
			<input
				id="light-angle"
				type="range"
				min="0"
				max="360"
				value={$lightAngle}
				oninput={(e) => lightAngle.set(Number((e.target as HTMLInputElement).value))}
			/>
			<span class="slider-value">{$lightAngle}°</span>
		</div>
	</div>

	<h2>Canvas</h2>
	<UndoRedoButtons history={history} canUndo={canUndo} canRedo={canRedo} />
	<button type="button" onclick={openNewGrid}>New grid</button>
	<button
		type="button"
		onclick={() => exportVoxelsToGltf($voxels)}
		disabled={$voxels.size === 0}
		title="Save mesh as GLTF with colors"
	>
		Save as GLTF
	</button>

	{#if showNewGrid}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="modal-overlay"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => e.target === e.currentTarget && (showNewGrid = false)}
			onkeydown={(e) => e.key === 'Escape' && (showNewGrid = false)}
		>
			<div class="modal">
				<h3>New grid</h3>
				<label>
					Grid size
					<select bind:value={newGridSize}>
						<option value={32}>32×32×32</option>
						<option value={64}>64×64×64</option>
					</select>
				</label>
				<div class="modal-buttons">
					<button type="button" onclick={createGrid}>Create</button>
					<button type="button" onclick={() => (showNewGrid = false)}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}
</ArtSidebar>

<style>
	.dimmed {
		opacity: 0.6;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	select {
		padding: 0.35rem 0.5rem;
		font-size: 0.9rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-color);
		color: var(--text-color);
		margin-bottom: 0.5rem;
	}

	.tool-buttons {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}

	.tool-buttons button {
		flex: 1;
		min-width: 4rem;
		padding: 0.4rem 0.5rem;
		font-size: 0.85rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-color);
		color: var(--text-color);
		cursor: pointer;
	}

	.tool-buttons button:hover:not(:disabled) {
		background: var(--block-quote-bg-color);
	}

	.tool-buttons button.active {
		background: var(--link-color);
		color: var(--bg-color);
		border-color: var(--link-color);
	}

	.stroke-mode {
		margin-bottom: 0.5rem;
	}

	.stroke-label {
		display: block;
		margin-bottom: 0.25rem;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.light-control {
		margin-bottom: 1rem;
	}

	.light-control label {
		display: block;
		margin-bottom: 0.25rem;
	}

	.checkbox-label {
		display: flex !important;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.light-control input[type='color'] {
		width: 100%;
		height: 2rem;
		padding: 2px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		background: var(--bg-color);
	}

	.slider-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.slider-row input[type='range'] {
		flex: 1;
		accent-color: var(--link-color);
	}

	.slider-value {
		font-size: 0.85rem;
		opacity: 0.8;
		min-width: 2.5rem;
	}

	.stroke-buttons {
		display: flex;
		gap: 0.25rem;
	}

	.stroke-buttons button {
		flex: 1;
		min-width: 4rem;
		padding: 0.4rem 0.5rem;
		font-size: 0.85rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-color);
		color: var(--text-color);
		cursor: pointer;
	}

	.stroke-buttons button:hover:not(:disabled) {
		background: var(--block-quote-bg-color);
	}

	.stroke-buttons button.active {
		background: var(--link-color);
		color: var(--bg-color);
		border-color: var(--link-color);
	}

	.color-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	#color-picker {
		width: 2.5rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		background: transparent;
	}

	#color-picker:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.color-hex {
		flex: 1;
		padding: 0.35rem 0.5rem;
		font-size: 0.85rem;
		font-family: monospace;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-color);
		color: var(--text-color);
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--bg-color);
		color: var(--text-color);
		padding: 1.5rem;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.modal label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.modal select {
		width: 100%;
		margin-bottom: 0;
	}

	.modal-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.modal-buttons button {
		margin-right: 0;
	}
</style>
