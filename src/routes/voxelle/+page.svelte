<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';
	import Sidebar from './Sidebar.svelte';
	import VoxelCanvas from './VoxelCanvas.svelte';
	import { history, saveToStorage } from './store';

	onMount(() => {
		if (browser) window.addEventListener('beforeunload', saveToStorage);
	});
	onDestroy(() => {
		if (browser) window.removeEventListener('beforeunload', saveToStorage);
	});
</script>

<svelte:head>
	<title>Voxelle – Voxel Sculpting</title>
	<meta name="description" content="A 3D voxel sculpting tool. Chip away or add voxels to create sculptures." />
</svelte:head>

<div class="page">
	<h1>Voxelle</h1>

	<div class="app">
		<Sidebar />
		<VoxelCanvas />
	</div>
</div>

<svelte:window
	on:keydown={(e) => {
		const target = document.activeElement;
		const isInput =
			target?.tagName === 'INPUT' ||
			target?.tagName === 'TEXTAREA' ||
			target?.tagName === 'SELECT';
		if (isInput) return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) {
				history.redo();
			} else {
				history.undo();
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			history.redo();
		}
	}}
/>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: calc(100vh - 6rem);
		margin-top: 1rem;
	}

	.app {
		display: flex;
		flex: 1;
		gap: 1rem;
		align-items: stretch;
		min-height: 0;
	}

	@media screen and (max-width: 600px) {
		.app {
			flex-direction: column;
		}
	}
</style>
