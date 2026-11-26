# Menus and details

Where an action goes for items, characters, moves and states, now and later. Agreed on 2026-11-26 by the owner, the
coordinating agent and two independent reviewers (Bob and Ada, GPT Sol 6.2 medium), after research cited below.

## The rule

**The menu holds what you can choose from the name alone. Details holds what you need to see first.**

The menu is the object's ⋮, its right-click and its press-and-hold: one shared menu wherever it opens, including the ⋮ in
the object's details window (which leaves out its own Details row). Details is the object's window: its preview,
settings, coverage and findings, each tool beside the evidence for using it.

Apply these tests to any action, in order:

1. **Can you choose it from the object's name alone?** Rename, Download ZIP, Move to Trash, Recolor, starting a copy or
   variant: menu. A dialog that opens next may still collect the remaining choices.
2. **Do you need to see what is there before deciding?** Missing frames, failed checks, fit, grip, frame bounds, facing
   coverage: details, next to that evidence.
3. **Does it act on the whole object or one part of it?** The whole object: menu. One frame, facing, slot or worn
   combination: details, next to that part.
4. **Frequency and cost set order and safeguards, not placement.** Frequent actions go first in their home; prices and
   confirmations appear at the point of commitment, wherever the action starts.

**One home per action.** A second entry is allowed only as a shortcut for a visible blocker on the object (for example
an item that cannot be worn on this body), with the same label and the same priced or confirmed flow.

**Name:** the menu row stays **Details…**; the window is titled with the object's name. "Inspect" is already the stage's
pose inspector.

## Applied

| Object    | Menu                                                                                                                                           | Details                                                                                                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item      | Details, Recolor, edited copy, variant, Rename, Move to slot, Download ZIP, Move to Trash; the re-fit for this character as a blocker shortcut | Preview and facings, coverage and drawing missing frames, Quality findings with Fix frames and one-view repair or redraw, the re-fit beside its findings, Outfit (hand settings, layer order, hiding), About; Wear in the footer |
| Character | Details, Rename, edited copy, Download ZIP, Delete                                                                                             | Frame and directions (Adjust frame, Directions), recorded and estimated cost (Cost estimate), generation details                                                                                                                 |
| Move      | Details, Rename, Redraw, Add state from frame, Download ZIP, Delete                                                                            | Facings and frames, Fix frames, which items are drawn for it and drawing the missing ones                                                                                                                                        |
| State     | Details, Rename, Add state from frame, Download ZIP, Delete                                                                                    | Facings, Fix frames, items drawn for it; no Redraw (capture again from a better frame)                                                                                                                                           |

Redraw of a whole move stays in the menu because you choose it from the move's name; its sheet shows the facings before
anything is paid. Repairing body frames is deferred: every item layer is drawn on the body, so a repair would need to
show the affected layers and keep the original.

## Sources

- Apple Human Interface Guidelines, [context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus)
- Material 3, [menus](https://m3.material.io/components/menus/guidelines)
- Fluent 2, [menu usage](https://fluent2.microsoft.design/components/web/react/core/menu/usage)
- Nielsen Norman Group, [contextual menus](https://www.nngroup.com/articles/contextual-menus-guidelines/) and
  [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- Object windows that mix information and settings: macOS Finder
  [Get Info](https://support.apple.com/guide/mac-help/get-file-folder-and-disk-information-mchlp1774/mac), Windows
  [property sheets](https://learn.microsoft.com/en-us/windows/win32/shell/propsheet-handlers), Aseprite
  [sprite properties](https://aseprite.org/docs/sprite-properties/), Unity and Godot inspectors.
