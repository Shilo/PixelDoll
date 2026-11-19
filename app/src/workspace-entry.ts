import { mount } from 'svelte';
import './app.css';
import './studio/experience/theme.css';
import OpenWorkspace from './studio/OpenWorkspace.svelte';
import { t } from 'svelte-whisper';
import { setupI18n } from './lib/i18n.ts';

document.documentElement.dataset.app = 'studio';
await setupI18n();
const stopTitle = t.subscribe((translate) => {
	document.title = `${translate('workspaceCopy.title')} · PixelDoll`;
});
const target = document.getElementById('app')!;
const picker = mount(OpenWorkspace, {
	target,
	props: {
		openStudio: async () => {
			const { unmount } = await import('svelte');
			await (await import('./bootstrap.ts')).launchStudio();
			stopTitle();
			await unmount(picker);
		}
	}
});
document.getElementById('startup-message')?.remove();
