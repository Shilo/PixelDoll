import { mount } from 'svelte';
import '@shilo/bronze-ui/style.css';
import MotionLab from '../MotionLab.svelte';
import { setupI18n } from '../../lib/i18n.ts';
if (!import.meta.env.DEV)
	throw new Error('Motion Lab is available only on the local development server.');
await setupI18n();
mount(MotionLab, { target: document.getElementById('motion-lab')! });
