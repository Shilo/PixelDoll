# Usability principles

PixelDoll follows **simplicity-first design**: strong defaults, minimal necessary features and progressive disclosure so ordinary use just works. Apply this guide when changing features, settings, navigation or user-facing copy.

- Make selecting a character, dressing, previewing and exporting work without unnecessary configuration or knowledge of the generation pipeline. Ask for PixelLab credentials and required generation choices when the task needs them, not as a prerequisite for local work.
- Omit unnecessary features/settings instead of hiding them. Add a control only for a concrete user task that existing behavior or a good default cannot adequately support. Keep meaningful choices, including appearance and export needs.
- Place controls by task, frequency and consequences. Keep frequent actions easy to reach. Reveal necessary infrequent options through clearly labeled contextual access, preferably one additional step from the relevant task. Avoid deep menus and rigid click quotas. Technical complexity alone does not justify hiding a tool; urgent recovery must be reachable when needed.
- Keep outfit and preview controls with the character, generation choices with the action, and export choices with Export. Optional API details and diagnostics can use secondary access; estimates, validation and consequential warnings belong at the point of decision. Do not require users to understand skeletons, chroma extraction or API payloads to complete ordinary tasks.
- Use concise, familiar, consistent labels. Explain consequences where they matter and defer optional detail. Keep source pixels legible and the character central under the existing [production experience and Bronze UI ownership contracts](design/production-experience.md).
- Preserve keyboard, touch and mouse access, visible focus, accessible names, reduced motion and reachable controls across screen sizes and orientations. Keep accessibility options discoverable. Retain the established dark default and light switch; remember supported explicit choices under existing storage contracts.
- Save automatically under existing contracts and surface save failures. Show progress, errors, quality limits and recovery when relevant; keep essential information reachable after transient feedback disappears. Preserve deletion safeguards and paid-request cost/consent boundaries, including retry/fallback disclosures. Simplification never authorizes extra spending or silently resending a paid request. Avoid confirmations for routine reversible edits.

For a new feature/setting or a material interaction change, briefly justify the user task, need, default and placement in the existing plan or review. Validate affected journeys under the repository's testing scope and label untested assumptions. Small copy corrections need clarity and meaning checks, not a separate decision record.

This guide authorizes no application changes by itself. Existing control placement is not proof of usability; future authorized work may reconsider it while preserving data, correctness and safeguards.

For evidence disputes or deeper rationale, read the optional [research and challenge](research/usability-research.md). Routine implementation needs only this guide.
