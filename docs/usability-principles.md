# Usability principles

PixelDoll follows **simplicity-first design**: strong defaults, minimal necessary features and progressive disclosure so ordinary use just works. Apply this guide when changing features, settings, navigation or user-facing copy.

- Make selecting a character, dressing, previewing and exporting work without unnecessary configuration or knowledge of the generation pipeline. Ask for PixelLab credentials and required generation choices when the task needs them, not as a prerequisite for local work.
- Omit unnecessary features/settings instead of hiding them. Add a control only for a concrete user task that existing behavior or a good default cannot adequately support. Keep meaningful choices, including appearance and export needs.
- Place controls by task, frequency and consequences. Keep frequent actions easy to reach. Reveal necessary infrequent options through clearly labeled contextual access, preferably one additional step from the relevant task. Avoid deep menus and rigid click quotas. Technical complexity alone does not justify hiding a tool; urgent recovery must be reachable when needed.
- Give each task one destination. Use a contextual shortcut when it saves a search or leads directly to recovery. On narrow screens, keep the main task reachable before presentation shortcuts. Keep one visible action for the same job within a region.
- Keep outfit and preview controls with the character, generation choices with the action, and export choices with Export. Optional API details and diagnostics can use secondary access; estimates, validation and consequential warnings belong at the point of decision. Do not require users to understand skeletons, chroma extraction or API payloads to complete ordinary tasks.
- Place scope choices beside what they change. Name the character, item, move, or facing at the consequential action. Name a finding's scope independently of the view selected for a fix. Show which options are actually possible before opening a picker, with a reason and a recovery route when one is available.
- Use concise, familiar, consistent labels. Explain consequences where they matter and defer optional detail. Keep source pixels legible and the character central under the existing [production experience and Bronze UI ownership contracts](design/production-experience.md).
- Show the estimate on the paid action and expose it as accessible context. When a connection resumes generation, carry the approved target and estimate forward to the final action. Save billing, retry and wait details for decisions they can change, including a minimum charge, paid-result recovery and a request that may already have charged.
- Preserve keyboard, touch and mouse access, visible focus, accessible names, reduced motion and reachable controls across screen sizes and orientations. Keep accessibility options discoverable. Retain the established dark default and light switch; remember supported explicit choices under existing storage contracts.
- Make the whole visible row or tile operable and preserve hover, pressed and focus feedback through Bronze UI. Check that notices, tips and adjacent actions leave their targets reachable. Keep previews and control footprints steady when switching views or labels.
- Use the same control and styling for the same role across screens. Follow the component guidance in [DESIGN.md](../DESIGN.md) and use sentence case for labels, preserving established product and feature names.
- Save automatically under existing contracts and surface save failures. Show progress, errors, quality limits and recovery when relevant. Keep essential information reachable after transient feedback disappears. Preserve deletion safeguards and paid-request consent, and ask again when a retry or fallback changes what will be bought. Avoid confirmations for routine reversible edits.

## Failures and recovery

- Validate provider output by its contract, never by exact pixels: accept what PixelLab documents (such as a start frame sent back first) and record evidence instead of stopping on it.
- Never offer a paid retry that cannot change the outcome. A deterministic stop (a joint check that replays the same way) offers only what can help.
- Block only what is unsafe or impossible. Otherwise disclose the issue and let the user continue, and keep paid results keepable.
  - Vital (may block, still keeping whatever is usable): sending or re-sending a paid request without consent or paying
    twice; losing or corrupting saved data or paid results; output the paper doll cannot use (no frames, a frame count
    or cell size that misaligns layers, pixels cut by the frame, undecodable images, hashes that do not match stored
    data); credential, privacy and security rules; impossible states (a missing character, a conflicting concurrent write).
  - Soft (everything else): quality gates and heuristics (key, area, palette, IoU, grip, stray pixels, motion, body and
    item checks, pixel matches against a reference, framing and estimate warnings). Show a plain warning that stays on
    the item or move and in problem reports, and offer Keep, Accept as is or Continue; never force a paid re-roll or
    discard paid output for them.
- A stale check re-validates what the work depends on and re-prices it; it never silently discards paid work.
- Say what happened in plain words with one next step; keep the technical detail behind Details, next to Report (`ProblemNotice`).
- Never route behavior on message text: use typed codes (an error's catalog key, a paid step's failure, an API status).

For a new feature/setting or a material interaction change, briefly justify the user task, need, default and placement in the existing plan or review. Validate affected journeys under the repository's testing scope and label untested assumptions. Small copy corrections need clarity and meaning checks, not a separate decision record.

This guide authorizes no application changes by itself. Existing control placement is not proof of usability; future authorized work may reconsider it while preserving data, correctness and safeguards.

For evidence disputes or deeper rationale, read the optional [research and challenge](research/usability-research.md). Routine implementation needs only this guide.
