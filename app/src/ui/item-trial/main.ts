import { mount } from 'svelte';
import '@shilo/bronze-ui/style.css';
import ItemTrial from './ItemTrial.svelte';

if (!import.meta.env.DEV)
	throw new Error('Item Trials is available only on the local development server.');
mount(ItemTrial, { target: document.getElementById('item-trial')! });
