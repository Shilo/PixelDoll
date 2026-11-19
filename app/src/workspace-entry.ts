import { mount } from 'svelte';
import './app.css';
import './studio/experience/theme.css';
import OpenWorkspace from './studio/OpenWorkspace.svelte';

document.documentElement.dataset.app = 'studio';
const target = document.getElementById('app')!;
const picker = mount(OpenWorkspace, {
	target,
	props: {
		openStudio: async () => {
			const { unmount } = await import('svelte');
			await (await import('./bootstrap.ts')).launchStudio();
			await unmount(picker);
		}
	}
});
document.getElementById('startup-message')?.remove();
