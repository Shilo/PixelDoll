<script module lang="ts">
	import type { PeekCall } from './apiPlans.ts';

	export interface DeveloperTarget {
		scope: string;
		label: string;
		plan?: PeekCall[];
		queueIds?: string[];
		activityScope?: string;
		copyId?: string;
	}
</script>

<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { tick } from 'svelte';
	import {
		apiActivity,
		activityRetention,
		activityTotals,
		exportActivityJson,
		sanitizeActivityUrl,
		sanitizeActivityValue,
		type ApiCall
	} from '../lib/pixellab/activity.ts';
	import { planDisplay, type PlanDisplayContext } from './apiPlans.ts';
	import { usdText } from './displayCost.ts';
	import { displayDirection } from './displayDirection.ts';
	import RequestFields from './RequestFields.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import { CodeXml, Copy, Check, ListPlus, ListMinus, X, ChevronRight } from './icons.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { developerModeEnabled } from './developerMode.svelte.ts';

	let {
		targets = [],
		copyId,
		all = false,
		menu = false,
		preview = false
	}: {
		targets?: DeveloperTarget[];
		copyId?: string;
		all?: boolean;
		menu?: boolean; // menu: a labeled row inside an options menu
		/** Works while Developer mode is off, for the Settings example; pass only example targets. */
		preview?: boolean;
	} = $props();
	const enabled = () => preview || developerModeEnabled();
	const id = $props.id();
	let selected = $state('');
	const target = $derived(targets.find(({ scope }) => scope === selected) ?? targets[0]);
	const scope = $derived(target?.scope ?? (all ? 'all' : 'id'));
	const plan = $derived(target?.plan ?? []);
	const label = $derived(target?.label ?? '');
	const queueIds = $derived(target?.queueIds ?? []);
	const activityScope = $derived(target?.activityScope);
	const identifier = $derived(target?.copyId ?? copyId);
	const hasCalls = $derived(all || !!target);
	const title = $derived(hasCalls ? t('apiPeek.title') : t('developer.title'));
	let panel = $state<HTMLDivElement>();
	let opener = $state<HTMLButtonElement>();
	let open = $state(false);
	let backgrounds = $state(false);
	let copyStatus = $state<Message | string>('');
	let copiedAll = $state(false);
	let manualCopy = $state<string>();
	let copyAttempt = 0;
	let inspectionError = $state(false);
	const actual = $derived(
		$apiActivity.filter(
			(c) =>
				all ||
				(activityScope &&
					(c.activityScope === activityScope || c.relatedScopes?.includes(activityScope))) ||
				(c.queueId && queueIds.includes(c.queueId)) ||
				c.relatedQueueIds?.some((id) => queueIds.includes(id))
		)
	);
	const recorded = $derived(actual.length > 0 || all);
	const calls = $derived(recorded ? actual : plan);
	const visible = $derived(calls.filter((c) => backgrounds || !c.background));
	const hidden = $derived(calls.length - calls.filter((c) => !c.background).length);
	const totals = $derived(activityTotals(actual));
	const unknownFinished = $derived(
		actual.filter((c) => c.costSource === 'unknown' && !c.usagePending).length
	);
	const knownEstimate = $derived(plan.reduce((sum, c) => sum + (c.generations ?? 0), 0));
	const unknownEstimate = $derived(
		plan.filter((c) => c.method === 'POST' && c.generations === undefined).length
	);
	const gens = (n: number) =>
		t('generationDetails.gens', { value: formatNumber(n, { maximumFractionDigits: 3 }) });
	const usd = usdText;
	const planFormatters: PlanDisplayContext = { t, formatNumber, displayDirection };
	/** Planned calls show translated captions; recorded calls keep their saved English labels. */
	const labelText = (c: ApiCall | PeekCall): string =>
		('state' in c ? undefined : planDisplay(c)?.label?.(planFormatters)) ?? c.label ?? '';
	const noteText = (c: PeekCall): string => planDisplay(c)?.note?.(planFormatters) ?? c.note ?? '';
	function safePlannedPath(path: string) {
		return /^https?:\/\//i.test(path) || (path.startsWith('/') && /[?#]/.test(path))
			? sanitizeActivityUrl(path)
			: path;
	}
	function price(c: ApiCall | PeekCall): string {
		if ('cost' in c) {
			if (c.costSource === 'free') return t('common.free');
			const bits = [
				c.cost.generations !== null ? gens(c.cost.generations) : '',
				c.cost.usd !== null ? usd(c.cost.usd) : ''
			].filter(Boolean);
			const base =
				bits.join(' + ') || (c.usagePending ? t('apiPeek.pending') : t('apiPeek.unknown'));
			return c.costPartial ? t('apiPeek.partial', { cost: base }) : base;
		}
		return c.generations !== undefined
			? t('apiPeek.estimate', { cost: gens(c.generations) })
			: c.method === 'POST'
				? t('apiPeek.estimateVaries')
				: t('common.free');
	}
	// The event's own element, not the binding: an open panel closes (and toggles) after its sheet unmounts it.
	async function toggled(e: ToggleEvent & { currentTarget: HTMLDivElement }) {
		const el = e.currentTarget;
		open = e.newState === 'open';
		if (open) {
			selected = '';
			resetFeedback();
			await tick();
			if (!el.isConnected || !opener) return;
			el.dataset.placement = opener.getBoundingClientRect().top < 100 ? 'bottom-end' : 'top-end';
			popoverFocus({ currentTarget: el, newState: e.newState }, false);
			el.querySelector<HTMLButtonElement>('[data-peek-close]')?.focus();
		} else {
			popoverFocus({ currentTarget: el, newState: e.newState }, false);
		}
	}
	$effect(() => {
		if (!enabled() || !open || all || (!activityScope && !queueIds.length)) return;
		let current = true;
		void $queue.jobs;
		void queue.inspectActivity(queueIds, activityScope).catch(() => {
			if (current) inspectionError = true;
		});
		return () => {
			current = false;
		};
	});
	function close() {
		panel?.hidePopover();
	}
	function keydown(e: KeyboardEvent) {
		// Keep Studio playback, direction and undo shortcuts outside this inspector.
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
			return;
		}
	}
	function isCurrentCopy(attempt: number) {
		return (
			enabled() && attempt === copyAttempt && panel?.isConnected && panel.matches(':popover-open')
		);
	}
	function resetFeedback() {
		copyAttempt++;
		copyStatus = '';
		copiedAll = false;
		manualCopy = undefined;
		inspectionError = false;
	}
	async function copyIdentifier() {
		if (!enabled() || !identifier) return;
		resetFeedback();
		const attempt = ++copyAttempt;
		try {
			await navigator.clipboard.writeText(identifier);
			if (isCurrentCopy(attempt)) copyStatus = message('developer.idCopied');
		} catch {
			if (isCurrentCopy(attempt)) copyStatus = message('developer.idCopyFailed');
		}
	}
	async function copy() {
		if (!enabled()) return;
		const attempt = ++copyAttempt;
		const count = calls.length;
		const text = recorded
			? exportActivityJson(actual)
			: JSON.stringify(
					{
						format: 'pixeldoll-calls/1',
						scope,
						costBasis: 'estimated',
						total: { generations: knownEstimate, unknown: unknownEstimate },
						calls: sanitizeActivityValue(
							plan.map((call) => ({ ...call, path: safePlannedPath(call.path) }))
						)
					},
					null,
					2
				);
		let copied: boolean;
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
		} catch {
			copied = false;
		}
		if (!isCurrentCopy(attempt)) return;
		if (copied) {
			copyStatus = message('apiPeek.copied', { count });
		} else {
			// Still usable when clipboard permissions are unavailable (including some mobile browsers).
			const blob = new Blob([text], { type: 'application/json' }),
				url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'pixeldoll-calls.json';
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			copyStatus = message('apiPeek.savedJson');
		}
		copiedAll = true;
	}
	async function copyEndpoint(
		event: MouseEvent & { currentTarget: HTMLButtonElement },
		key: string,
		endpoint: string,
		status: Message
	) {
		if (!enabled()) return;
		const button = event.currentTarget;
		const active = document.activeElement;
		const attempt = ++copyAttempt;
		copyStatus = '';
		manualCopy = undefined;
		let copied: boolean;
		try {
			await navigator.clipboard.writeText(endpoint);
			copied = true;
		} catch {
			copied = false;
		}
		await tick();
		if (!isCurrentCopy(attempt) || !button.isConnected) return;
		if (copied) {
			copyStatus = status;
			return;
		}
		copyStatus = message('apiPeek.copyFailed');
		manualCopy = key;
		await tick();
		const field = button
			.closest('.peek-request')
			?.querySelector<HTMLInputElement>('.manual-endpoint');
		if (
			isCurrentCopy(attempt) &&
			field?.getClientRects().length &&
			document.activeElement === active
		) {
			field.focus();
			field.select();
		}
	}
</script>

{#snippet jobStatus(job: NonNullable<ApiCall['job']>, id?: string)}
	<p class="request-status">
		{t(job.error ? 'apiPeek.jobError' : 'apiPeek.job', {
			id: id ? ` ${id}` : '',
			state: job.policy ? t('apiPeek.jobPolicy') : job.status,
			error: job.error ?? ''
		})}
	</p>
{/snippet}

{#if enabled() && (hasCalls || identifier)}
	<button
		bind:this={opener}
		type="button"
		class={menu ? 'row bu-action api-peek-trigger' : 'bu-action btn icon plain api-peek-trigger'}
		data-variant="quiet"
		aria-label={all ? t('apiPeek.inspectAll') : hasCalls ? t('apiPeek.inspect') : title}
		title={hasCalls ? t('apiPeek.triggerTitle') : title}
		aria-expanded={open}
		aria-controls={id}
		popovertarget={id}
		><CodeXml size={menu ? 18 : 17} />{#if menu}<span class="row-name"
				>{openerLabel(t(all ? 'apiPeek.inspectAll' : 'apiPeek.title'))}</span
			><SurfaceChevron />{/if}</button
	>
	<div
		bind:this={panel}
		{id}
		popover="auto"
		class="api-peek bu-popover-anchor"
		role="dialog"
		aria-label={title}
		tabindex="-1"
		onbeforetoggle={(event) => {
			if (event.newState === 'open' && !enabled()) event.preventDefault();
			if (event.newState === 'closed') copyAttempt++;
		}}
		ontoggle={toggled}
		onkeydown={keydown}
	>
		<PopoverArrow />
		<div class="api-peek-surface bu-popover-surface bu-floating">
			{#if open}
				<header class="peek-head">
					<div class="peek-heading">
						<strong>{title}</strong><span
							class="peek-sub"
							class:copy-feedback={copyStatus}
							role="status"
							>{(copyStatus ? displayMessage(copyStatus) : '') ||
								(inspectionError ? t('apiPeek.inspectionError') : '') ||
								label ||
								(all ? t('apiPeek.recent') : hasCalls ? t('apiPeek.thisAction') : '')}</span
						>
						{#if inspectionError && copyStatus}<span class="peek-sub"
								>{t('apiPeek.inspectionError')}</span
							>{/if}
					</div>
					{#if hasCalls}<button
							type="button"
							class="bu-action btn icon plain"
							data-variant="quiet"
							aria-label={t('apiPeek.copyAll')}
							title={t('apiPeek.copyAllTitle')}
							disabled={!calls.length}
							onclick={copy}
							>{#if copiedAll}<Check size={16} />{:else}<Copy size={16} />{/if}</button
						>
						<button
							type="button"
							class="bu-action btn icon plain"
							data-variant="quiet"
							aria-label={backgrounds ? t('apiPeek.hideBackground') : t('apiPeek.showBackground')}
							title={backgrounds
								? t('apiPeek.hideBackground')
								: hidden
									? t('apiPeek.showBackgroundCount', { count: hidden })
									: t('apiPeek.showBackground')}
							aria-pressed={backgrounds}
							onclick={() => (backgrounds = !backgrounds)}
							>{#if backgrounds}<ListMinus size={17} />{:else}<ListPlus size={17} />{/if}</button
						>{/if}
					<button
						type="button"
						class="bu-action btn icon plain"
						data-variant="quiet"
						data-peek-close
						aria-label={t('apiPeek.close')}
						title={t('common.close')}
						onclick={close}><X size={17} /></button
					>
				</header>
				{#if targets.length > 1 || identifier}
					<div class="peek-controls">
						{#if targets.length > 1}<select
								class="bu-input input"
								aria-label={t('developer.target')}
								value={scope}
								onchange={(event) => {
									selected = event.currentTarget.value;
									resetFeedback();
								}}
							>
								{#each targets as choice (choice.scope)}<option value={choice.scope}
										>{choice.label}</option
									>{/each}
							</select>{/if}
						{#if identifier}<button
								type="button"
								class="bu-action btn small"
								data-variant="quiet"
								onclick={copyIdentifier}>{t('developer.copyId')}</button
							>{/if}
					</div>
				{/if}
				{#if hasCalls}
					<div class="peek-list">
						{#each visible as c, i ('id' in c ? c.id : `${scope}:${i}:${c.path}`)}
							{@const key = 'id' in c ? c.id : `${scope}:${i}:${c.path}`}
							{@const endpoint = 'endpoint' in c ? c.endpoint : safePlannedPath(c.path)}
							{@const copiedStatus = c.label
								? message('apiPeek.endpointCopiedLabel', {
										method: c.method,
										label: labelText(c)
									})
								: message('apiPeek.endpointCopiedCall', {
										method: c.method,
										number: formatNumber(i + 1)
									})}
							{@const copyLabel = c.label
								? t('apiPeek.copyEndpointLabelContext', {
										method: c.method,
										endpoint,
										label: c.label
									})
								: t('apiPeek.copyEndpointLabel', { method: c.method, endpoint })}
							<details class="peek-call">
								<summary
									><ChevronRight size={13} /><span class="call-name"
										><span class="call-route"
											><span class="call-method">{c.method}</span><span>{endpoint}</span></span
										>{#if c.label}<span class="call-context">{labelText(c)}</span>{/if}</span
									><span class="call-price">{price(c)}</span></summary
								>
								<div class="peek-request">
									<div class="request-endpoint">
										<code>{endpoint}</code>
										<button
											type="button"
											class="bu-action btn icon plain"
											data-variant="quiet"
											aria-label={copyLabel}
											title={t('apiPeek.copyEndpointTitle')}
											onclick={(event) => copyEndpoint(event, key, endpoint, copiedStatus)}
											><Copy size={14} /></button
										>
									</div>
									{#if manualCopy === key}<input
											class="bu-input input manual-endpoint"
											aria-label={t('apiPeek.manualCopyLabel')}
											value={endpoint}
											readonly
										/>{/if}
									{#if 'state' in c}<p class="request-status">
											{[
												c.restored
													? t('apiPeek.state.saved')
													: c.state === 'pending'
														? t('apiPeek.state.sending')
														: c.state === 'failed'
															? t('generation.status.failed')
															: t('apiPeek.state.sent'),
												c.status ? t('apiPeek.state.http', { status: c.status }) : '',
												c.background ? t('apiPeek.state.background') : '',
												c.costSource === 'unknown' && !c.usagePending
													? t('apiPeek.state.costUnknown')
													: ''
											]
												.filter(Boolean)
												.join(' · ')}
										</p>{:else}<p class="request-status">
											{c.background
												? t('apiPeek.state.plannedBackground')
												: t('apiPeek.state.planned')}
										</p>{/if}
									{#if 'job' in c && c.job}{@render jobStatus(c.job)}{/if}
									{#if 'failedJobs' in c}
										{#each c.failedJobs ?? [] as job (job.id)}
											{@render jobStatus(job, job.id)}
										{/each}
									{/if}
									{#if 'bodyUnavailable' in c && c.bodyUnavailable}<p class="request-status">
											{t('apiPeek.bodyUnavailable')}
										</p>{/if}
									{#if c.body !== undefined && c.body !== null}<RequestFields
											value={'cost' in c ? c.body : sanitizeActivityValue(c.body)}
										/>{:else}<p class="request-status">
											{c.method === 'POST' ? t('apiPeek.fieldsLater') : t('apiPeek.noBody')}
										</p>{/if}
									{#if 'note' in c && c.note}<p class="request-status">{noteText(c)}</p>{/if}
								</div>
							</details>
						{/each}
						{#if !visible.length}<p class="peek-empty">
								{hidden
									? t('apiPeek.emptyForeground')
									: all
										? t('apiPeek.emptyAll')
										: t('apiPeek.emptyAction')}
							</p>{/if}
					</div>
					{#if recorded && ($activityRetention.droppedBackground || $activityRetention.droppedForeground)}<p
							class="peek-retention"
						>
							{all && $activityRetention.droppedForeground
								? t('apiPeek.retentionTotal')
								: t('apiPeek.retention')}
						</p>{/if}
					<footer class="peek-total">
						<span
							>{recorded ? t('apiPeek.total') : t('apiPeek.estimatedTotal')}<span
								class="total-caption"
								>{!backgrounds && hidden
									? t('apiPeek.callsHidden', { count: calls.length, hidden })
									: t('apiPeek.calls', { count: calls.length })}</span
							></span
						><strong
							>{#if recorded}{#if totals.generations || totals.usd || !totals.unknown}{[
										gens(totals.generations),
										totals.usd ? usd(totals.usd) : ''
									]
										.filter(Boolean)
										.join(' + ')}{:else}{totals.pending
										? t('apiPeek.pending')
										: t('apiPeek.unknown')}{/if}{#if totals.unknown || totals.pending}<span
										class="total-caption"
										>{[
											unknownFinished > 0
												? t('apiPeek.unknownCount', { count: unknownFinished })
												: '',
											totals.pending ? t('apiPeek.pendingCount', { count: totals.pending }) : ''
										]
											.filter(Boolean)
											.join(' · ')}</span
									>{/if}{:else}{t('apiPeek.estimate', {
									cost: gens(knownEstimate)
								})}{#if unknownEstimate}<span class="total-caption">{t('apiPeek.variable')}</span
									>{/if}{/if}</strong
						>
					</footer>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.peek-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 8px 12px;
	}
	.peek-controls select {
		min-width: 0;
		max-width: 100%;
	}
	.api-peek-trigger {
		vertical-align: middle;
		flex: none;
	}
	.api-peek {
		width: min(440px, calc(100vw - 16px));
		font: 400 12px/1.45 var(--font-ui, system-ui);
	}
	.api-peek:popover-open:not([data-positioned]) {
		visibility: hidden;
	}
	.api-peek-surface {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		width: 100%;
		overflow: hidden;
	}
	.api-peek::backdrop {
		background: transparent;
	}
	.peek-head {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 10px 10px 10px 14px;
		border-bottom: 1px solid var(--line);
		flex: none;
	}
	.peek-heading {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.peek-heading strong {
		font-size: 13px;
		font-weight: 600;
	}
	.peek-sub {
		font-size: 11px;
		color: var(--text-3);
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
	}
	.copy-feedback {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.peek-list {
		overflow: auto;
		overscroll-behavior: contain;
		min-height: 0;
		max-height: 410px;
		flex: 1;
	}
	.peek-call {
		border-bottom: 1px solid var(--line);
	}
	.peek-call:last-child {
		border-bottom: 0;
	}
	.peek-call > summary {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 11px 12px;
		cursor: pointer;
		list-style: none;
	}
	.peek-call > summary::-webkit-details-marker {
		display: none;
	}
	.peek-call > summary:hover {
		background: var(--bg-hover);
	}
	.peek-call > summary > :global(svg) {
		flex: none;
		color: var(--text-3);
	}
	.peek-call[open] > summary > :global(svg) {
		transform: rotate(90deg);
	}
	.call-name {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 3px;
	}
	.call-route {
		display: flex;
		gap: 6px;
		align-items: baseline;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.call-method {
		color: var(--accent-text);
		font-size: 9px;
		font-weight: 650;
		flex: none;
	}
	.call-route > span:last-child {
		min-width: 0;
	}
	.call-context {
		color: var(--text-3);
		font-size: 11px;
		overflow-wrap: anywhere;
	}
	.call-price {
		color: var(--text-2);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		flex: none;
		max-width: 95px;
		text-align: right;
	}
	.peek-request {
		padding: 0 14px 12px 32px;
		font-size: 11.5px;
	}
	.request-endpoint {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 4px;
	}
	.request-endpoint code {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.manual-endpoint {
		width: 100%;
		min-width: 0;
		margin-bottom: 8px;
	}
	.request-status {
		color: var(--text-3);
		font-size: 11px;
		margin: 0 0 8px;
		overflow-wrap: anywhere;
	}
	.request-status:last-child {
		margin-bottom: 0;
	}
	.peek-empty {
		padding: 22px 16px;
		color: var(--text-3);
		margin: 0;
	}
	.peek-retention {
		padding: 6px 14px;
		color: var(--text-3);
		font-size: 10px;
		margin: 0;
		border-top: 1px solid var(--line);
		flex: none;
	}
	.peek-total {
		padding: 12px 14px;
		display: flex;
		justify-content: space-between;
		gap: 10px;
		align-items: start;
		border-top: 1px solid var(--line-strong);
		flex: none;
	}
	.peek-total strong {
		text-align: right;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.total-caption {
		display: block;
		font-size: 10px;
		color: var(--text-3);
		font-weight: 400;
		margin-top: 3px;
	}
	@media (max-width: 599px), (max-height: 499px) {
		.peek-head .btn,
		.request-endpoint .btn {
			min-height: 44px;
			min-width: 44px;
		}
		.peek-list {
			max-height: none;
		}
		.peek-call > summary {
			min-height: 48px;
		}
		.peek-request {
			padding-left: 22px;
		}
	}
</style>
