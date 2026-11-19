import { mount } from 'svelte';
import '@shilo/bronze-ui/style.css';
import ItemTrial from './ItemTrial.svelte';
import { setupI18n } from '../../lib/i18n.ts';

if (!import.meta.env.DEV)
	throw new Error('Item Trials is available only on the local development server.');
await setupI18n();
mount(ItemTrial, { target: document.getElementById('item-trial')! });
