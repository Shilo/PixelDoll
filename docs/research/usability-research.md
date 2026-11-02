# Simplicity-first design: rationale and challenge

The [short usability guide](../usability-principles.md) owns current instructions. This optional note explains the principles and their limits; it is not required reading for routine implementation.

## Sources and application

- [Apple: Settings](https://developer.apple.com/design/human-interface-guidelines/settings) recommends useful defaults, fewer settings and task-specific options within the task. PixelDoll applies this to ordinary character work without unnecessary setup. Native platform settings conventions do not override this browser app's dark default, light switch or Bronze UI ownership.
- [NN/G: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) recommends showing important options first, with an obvious route to secondary choices. It warns that hiding frequently needed features or adding excessive disclosure levels undermines usability. PixelDoll therefore groups options by the user's task, frequency and consequences, rather than labeling every technical tool advanced.
- [W3C: Understandable Controls](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o1-understandable/) recommends familiar controls, labels and clear relationships between actions and affected content. This is supplemental cognitive accessibility guidance, not a WCAG conformance checklist. Concise copy must still identify actions and consequences.

These sources support design principles, not measured usability results for PixelDoll. Control frequency and discoverability remain assumptions until evaluated with users. Simplicity-first design is a descriptive project rule, not a formal standard or a claim of Apple endorsement.

## Challenges to the borrowed rule

The starting point was Toadoku's simplicity-first rule and its layered documentation. The useful transfer is the structure: a short instruction in AGENTS.md, an operational guide on demand, and optional evidence beyond that. Game-specific conventions and phase workflows do not belong in PixelDoll's global instructions.

- A clean screen can still be difficult to use. Remove unnecessary decisions before hiding necessary controls, and keep repeated tasks direct.
- Zero setup cannot be absolute here. Paid generation needs credentials and informed choices; local dressing and export should not inherit that prerequisite.
- Rare does not mean unimportant. Recovery, accessibility, deletion consequences and spending information must be available when they matter.
- A simple preview cannot justify concealing missing artwork or quality limits. Preserve accurate reporting in Preview, quality notes and export under the [production workflow contract](../design/production-experience.md).
- Apple-inspired usability does not prescribe a visual redesign, another UI kit, new settings or new confirmation steps. PixelDoll already defines theme ownership, test scope and paid-request policy.

KISS/YAGNI, DRY, Conventional Commits, scoped testing and protection of others' edits already have PixelDoll rules. Repeating them adds reading cost without changing behavior. Toadoku's blanket ImageGen and phase-specific delegation instructions address different work and are not adopted.
