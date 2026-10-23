import { mount } from 'svelte';
import App from './App.svelte';
import './theme.css';
import './components.css';
import './showcase.css';
mount(App, { target: document.getElementById('app') });
