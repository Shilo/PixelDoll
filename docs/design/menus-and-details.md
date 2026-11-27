# Menus and details

Where an action goes for items, characters, moves and states, now and later. Agreed on 2026-11-26 by the owner, the
coordinating agent and two independent reviewers (Bob and Ada, GPT Sol 6.2 medium), after research cited below.

## The rule

Ask one question about the action: **can the player do it without looking at anything first?**

- **Yes: it goes in the menu.** They already know they want it just from seeing the object in a list. Examples: Rename,
  Download ZIP, Move to Trash, Recolor, Make copy with new look. A window that opens next may still ask for the
  remaining choices.
- **No, they need to look at something first: it goes in the object's window,** right next to what they look at.
  Something to look at means frames, facings, problems the checks found, or how a setting changes the outfit. Examples:
  Fix frames and Redraw (look at the frames first), the re-fit beside the fit problems, Two-handed, layer order. An
  action on one part of the object (one frame, facing or slot) always needs that part in view, so it is always in the
  window.

How often an action is used and what it costs decide its order and its confirmation, never where it lives.

**One home per action, with one exception.** When the object's tile already shows a warning icon, the action that fixes
that warning may also appear in the menu as a shortcut, with the same label and the same flow. Example: an item that
cannot be worn on this body shows a red icon, so **Make copy for self…** is in its menu as well as in its window,
beside the explanation.

The menu is the object's ⋮, right-click and press-and-hold: one shared menu wherever it opens, including the ⋮ in the
object's window (which leaves out the row that opens that window).

**Name: View and edit…** (owner decision, 2026-11-26), with an eye icon; the window is titled with the object's name.
"Details" read as text only, so players could skip the window that fixes their item, and "Inspect" promised a closer look
but not changes. The stage's frame-by-frame window, formerly Inspect, is now **View frames**.

## Applied

Every menu ends with **Rename…, Download ZIP, Move to Trash…**, in that order.

| Object    | Menu                                                                                                                                                               | Details                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item      | View and edit, Recolor, Make copy with new look, Create a variant (or Make copy for self as a blocker shortcut), Move to slot, Rename, Download ZIP, Move to Trash | Preview and facings, coverage and drawing missing frames, Quality findings with Fix frames and one-view repair or redraw, the re-fit beside its findings, Outfit (hand settings, layer order, hiding), About; Wear in the footer |
| Character | View and edit, Make copy with new look, Make editable copy (demo), Rename, Download ZIP, Move to Trash                                                             | Frame & Directions (Adjust frame, Directions), Cost (recorded cost, Cost estimate), About; Open character in the footer when it is not the open one                                                                              |
| Move      | View and edit, Rename, Download ZIP, Move to Trash                                                                                                                 | Facings and frames, Fix frames, Redraw (after seeing the facings), Add state from frame (the frame in view), which items are drawn for it and drawing the missing ones                                                           |
| State     | View and edit, Rename, Download ZIP, Move to Trash                                                                                                                 | Facings, Fix frames, Add state from frame, items drawn for it; no Redraw (capture again from a better frame)                                                                                                                     |
| Outfit    | Rename, Download ZIP, Move to Trash (on a demo: Remove, an edit Undo reverts; its own outfits are locked)                                                          | None: wearing it is the row itself                                                                                                                                                                                               |

Redraw sits in the window for moves, as an item's redraw does: you look at the facings before paying. Repairing body
frames is deferred: every item layer is drawn on the body, so a repair would need to show the affected layers and keep
the original.

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
