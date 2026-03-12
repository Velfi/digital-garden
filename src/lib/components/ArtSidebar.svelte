<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Writable } from 'svelte/store';

	interface Props {
		open: Writable<boolean>;
		children?: Snippet;
	}

	let { open, children }: Props = $props();
</script>

<div class="sidebar-wrapper">
	<aside class="sidebar" class:collapsed={!$open}>
		<button
			type="button"
			class="collapse-btn"
			onclick={() => open.set(false)}
			title="Collapse sidebar"
			aria-label="Collapse sidebar"
		>
			◀
		</button>
		<div class="sidebar-inner">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</aside>
	{#if !$open}
		<button
			type="button"
			class="expand-tab"
			onclick={() => open.set(true)}
			title="Expand sidebar"
			aria-label="Expand sidebar"
		>
			▶
		</button>
	{/if}
</div>

<style>
	.sidebar-wrapper {
		display: flex;
		flex-shrink: 0;
		align-items: stretch;
	}

	.sidebar {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 360px;
		min-width: 360px;
		flex-shrink: 0;
		padding: 0.5rem 0.75rem;
		max-height: calc(100vh - 6rem);
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--block-quote-bg-color);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		transition:
			width 0.2s ease,
			min-width 0.2s ease,
			padding 0.2s ease;
	}

	.sidebar.collapsed {
		width: 0;
		min-width: 0;
		padding-left: 0;
		padding-right: 0;
		border-width: 0;
		overflow: hidden;
	}

	.sidebar.collapsed .collapse-btn,
	.sidebar.collapsed .sidebar-inner {
		opacity: 0;
		pointer-events: none;
	}

	.collapse-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		font-size: 0.75rem;
		line-height: 1;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.15);
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
	}

	.collapse-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.sidebar-inner {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
	}

	.sidebar :global(h2) {
		font-size: 0.9rem;
		margin: 0.5rem 0 0.15rem 0;
	}
	.sidebar :global(h2:first-child) {
		margin-top: 0;
	}

	.expand-tab {
		width: 1.5rem;
		padding: 0.5rem 0.25rem;
		font-size: 0.75rem;
		line-height: 1;
		border: 1px solid var(--border-color);
		border-left: none;
		border-radius: 0 4px 4px 0;
		background: var(--block-quote-bg-color);
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		writing-mode: vertical-rl;
		text-orientation: mixed;
	}

	.expand-tab:hover {
		background: var(--block-quote-bg-color);
		opacity: 0.9;
	}
</style>
