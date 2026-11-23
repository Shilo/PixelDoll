<script lang="ts">
	// Suspicious imported joints a priced skeleton fit will follow: named before anything is bought.
	import { t } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	import { plainReasonMessage } from './model.ts';

	let { issues }: { issues: readonly string[] } = $props();
</script>

{#if issues.length}<div class="notice warn small" role="status">
		<p>{t('newItem.poseIssues')}</p>
		<ul>
			{#each issues as issue (issue)}<li>{displayMessage(plainReasonMessage(issue))}</li>{/each}
		</ul>
	</div>{/if}
