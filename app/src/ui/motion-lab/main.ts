import { mount } from 'svelte';
import '@shilo/bronze-ui/style.css';
import MotionLab from '../MotionLab.svelte';
if(!import.meta.env.DEV)throw new Error('Motion Lab is available only on the local development server.');
mount(MotionLab,{target:document.getElementById('motion-lab')!});
