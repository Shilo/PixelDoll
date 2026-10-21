<script lang="ts">
  import Icon from './Icon.svelte'
  import { gk } from '../state.svelte'
</script>

<div class="activity-list">
  <div class="act-group">
    <h3 class="sec-title">Generating</h3>
    <ul>
      <li><span class="ring" style:--p="62"></span><span class="act-main"><b>Iron breastplate</b><span class="muted small">Adding to walk · 10 of 16</span></span><span class="act-meta num">2:40<span class="muted small">30 gens</span></span></li>
      <li><span class="ring" style:--p="0"></span><span class="act-main"><b>Leather boots</b><span class="muted small">Waiting for a free slot</span></span><span class="act-meta num">~5 min<span class="muted small">30 gens</span></span></li>
    </ul>
  </div>
  <div class="act-group">
    <h3 class="sec-title">Done today</h3>
    <ul>
      <li><span class="ok-ico"><Icon name="circle-check" size={18} /></span><span class="act-main"><b>Steel helmet</b><span class="muted small">Clean · 4:55</span></span><span class="act-meta num muted small">10 gens</span></li>
      <li><span class="ok-ico"><Icon name="circle-check" size={18} /></span><span class="act-main"><b>Red cape</b><span class="muted small">Clean · 5:20</span></span><span class="act-meta num muted small">20 gens</span></li>
    </ul>
  </div>
  <div class="act-foot">
    <span><Icon name="coins" size={14} /> <b class="num">1,840 gens</b> left</span>
    <span class="muted small">This session: 60 gens</span>
  </div>
  <details class="disclosure">
    <summary><Icon name="chevron-right" size={14} />Details <span class="muted">· ledger, job ids</span></summary>
    <p class="muted small mono">edit-animation-v2 · job 7f3a… · attempt 1 · concurrency 2</p>
  </details>
  <button class="btn sm {gk('glass-btn glass-btn--tertiary glass-btn--sm glass-btn--auto')}"><Icon name="settings" size={14} /><span>Notify me when done</span></button>
</div>
