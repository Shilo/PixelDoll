# Bronze UI 0.1.1 ownership correction

2026-10-23. Follow-up to the composition polish. The **More** trigger remains concise; its popup heading is now **Additional equipment**, with only Back and Held item. Portrait view tabs have at least 8px clearance below the actual prompt touch target (about 13px with the approved typography), not merely below its text baseline.

## Fixes at their source

The independent GPT-6.1 Sol High audit identified two reusable component fixes:

- Bronze UI's `.bu-code` recipe was inline. Padding and borders fragmented across the three filenames in the export disclosure; a grid parent happened to hide the bug elsewhere. Version 0.1.1 makes it a wrapping block surface, tested inside ordinary containers and dialogs.
- Native dropdown appearance had been repaired only in the prototype adapter. Version 0.1.1 now owns scoped option colors, supported native top-layer picker styling and disabled-choice treatment. Regular `select.bu-input` fields receive it automatically; the playback select uses the picker-only `.bu-select` class while retaining local compact dimensions.

The corresponding generic dropdown rules are removed from the consumer adapter. No changes to published colors, fonts or sprite pixels were needed. The review found no evidence that the earlier stage positioning, popup stacking, creator scrims, mirror geometry, item affordances or CTA sizing were package defects; these belong to the consumer's layout and workflow-specific recipes.

Theme source and style guide: [local Bronze UI repository](../../../../../../bronze-ui/README.md), [local guide](../../../../../../bronze-ui/docs/STYLE-GUIDE.md). The relative links follow this repository's standard workstation layout; the absolute source is `C:/Programming_Files/Shilocity/bronze-ui`.

## Dependency and maintenance contract

Use the immutable [0.1.1 release archive](https://github.com/Shilo/bronze-ui/releases/tag/v0.1.1) through `app/package.json` and the committed lockfile. Never patch installed package files. Fix reusable theme recipes upstream, run package/browser checks, publish a new version, then upgrade and verify this consumer. Keep screen composition local. Root README links to the public theme; CLAUDE.md links to the local source and guide so agents can find ownership directly.

## Verification

Upstream: Svelte check, build, packed CSS-only and Svelte/TypeScript consumers, 48 showcase cases per browser, host contracts, and 8 focused code-surface/native-picker cases per browser. Tested Chromium and WebKit, dark/light, desktop, narrow phone and landscape. Real picker interaction, disabled choices, native fallback and unrelated-host isolation are covered. The reviewer raised disabled styling and host-isolation assertions; both were addressed.

Consumer verification after installing the published archive:

- Eight dependency/appearance/viewport cases passed. The running server initially retained old cached CSS; restarting it resolved the mismatch. Both served stylesheet hashes now exactly match the installed 0.1.1 archive, and the lockfile records its integrity. Restart the prototype server after package upgrades; a changed lockfile alone is not proof of changed runtime CSS.
- The 26-case regression suite and six focused phone cases passed in both Chromium and WebKit, without page errors or external requests. The phone suite asserts at least 8px prompt-to-tabs clearance, the exact heading and the two additional categories.
- PixelDoll's production build and distribution guard passed. No production Studio styling was migrated.
- All 68 matched screen states were recaptured at desktop 1920×1080 and phone 450×800, both appearances, plus 12 supplemental states. The previous set is preserved. All 160 source image hashes/dimensions and 17 current runtime hashes were verified. New evidence is local under `evidence/theme-0.1.1/`; [open the comparison gallery](http://127.0.0.1:5202/polish-review.html?round=theme-0.1.1&device=mobile&theme=obsidian&screen=menu-parts).
- Bronze UI commit `d56c2ff` and tag `v0.1.1` are pushed. Both [release verification](https://github.com/Shilo/bronze-ui/actions/runs/40019191550) and [Pages publication](https://github.com/Shilo/bronze-ui/actions/runs/40019191681) succeeded. The published light-mode export disclosure was also inspected visually in the Codex browser.
