# State palette trial

November 23, 2026. A paid, paired test of PixelLab's palette options for States, against the free save-time snap that PixelDoll now applies to every saved State (`snapToBodyColors` in [palette.ts](../../../app/src/lib/rig/palette.ts)). It answers the "Restrict palettes during generation and after it" board card for States. Item edits were tested separately on [November 6](../deep-paperdoll-target-palette-2026-11-06.md).

## Why

Recolors are exact color swaps. A State that PixelLab redraws uses its own shading, so a recolor reaches only the pixels that happen to match the body. A user's three new States showed blue speckles on pink skin for this reason.

## Setup

- **Requests:** 51 requests from the agent account through the dev:agent app. Each was submitted once and never retried, and failures cost nothing.
- **Cost:** 335 generations from 29 completed results, counted from each job's own usage receipt. The account balance dropped more than that because other sessions share the account.
- **Bodies:**
  - A: 80 px, brown hair and white briefs.
  - B: 64 px, bald.
  - C: 96 px, bald, grey top and briefs.

  All three are existing PixelLab characters.

- **Prompts:** a steel longsword, which adds a new gray object; a shiny red apple, which adds a new hue; and sitting cross-legged, which only changes the pose.
- **`/create-character-state` arms:** each arm used the same parent, prompt and seed. The arms were:
  - none;
  - `use_color_palette_from_reference: true`;
  - `target_palette.colors` set to every color in the parent's rotations (38 to 55 colors).
- **`/edit-image-pro-flash`:** the south view of body A, with and without `use_color_palette_correction`, for each prompt (one seed).
- **Endpoints without a palette option:** `/edit-images-v2` and `/edit-image-pixen` have none, so they were not part of the test.
- **Evidence:** [ledger.json](ledger.json) lists every request, its settings, job and child IDs, receipt and metrics. The images remain on PixelLab under those child IDs.

## Results

| Arm                     | Completed | Content-policy blocks | Colors per State | Pixels on body palette | After local snap |
| ----------------------- | --------: | --------------------: | ---------------: | ---------------------: | ---------------: |
| Managed, none           |    8 / 15 |                     7 |               78 |                   4.1% |            94.5% |
| Managed, from reference |    9 / 15 |                     6 |               46 |                   100% |             100% |
| Managed, target palette |    9 / 15 |                     6 |               46 |                   100% |             100% |
| Pro Flash, none         |     3 / 3 |                     0 |               47 |                     0% |            95.9% |
| Pro Flash, correction   |     3 / 3 |                     0 |               24 |                  50.8% |            99.6% |

- **Body consistency:** both managed palette options put every pixel on the body palette. The pose, the silhouette and the four or eight facings stayed as good as the control for the sword and the sit pose.
- **New detail is destroyed:** with either managed option, or with Pro Flash correction, the shiny red apple came out brown and skin-colored on bodies A and C. Body C's control drew a bright red apple with a green leaf in all eight facings. With `target_palette`, some facings drew two apples. Pro Flash correction also added a reddish fringe to the sword. Palette-locked objects share the body's exact colors, so recoloring the skin or the underwear recolors the apple or the sword as well.
- **Local snap:** on the control outputs it moves each changed pixel at most 16 to 22/255 and covers almost all the skin.
  - What stays off-palette is new detail, like the blade or gold, plus some hair highlights and the brightest underwear whites.
  - On the bald body C it leaves the red apple untouched.
  - On body A, whose brown hair adds dark reds to the palette, 45 to 60% of the apple's saturated red pixels snap to those body reds by at most 16/255. They still look red, but a hair or skin recolor would tint them. This is a known limitation, but much smaller than the provider options, which repaint the whole apple.
- **Content-policy blocks:** 19 of 45 managed requests were blocked, at $0. The rate was about the same in every arm, so the palette options do not cause it. Near-naked bodies were blocked the most: body B was blocked on 7 of 9. Pro Flash was never blocked.
- **Cost:** a managed State cost 10 generations at 64 and 80 px and 15 at 96 px. That is below PixelDoll's 15 and 25 quote ceilings at 80 and 96 px, so the quotes are conservative. A Pro Flash 80×80 edit cost 5, matching `/pro-flash/cost`. The palette options did not change the price.

## Recommendation

1. **Keep the free local snap as the only default.** It is free, works on every State route (including `/edit-images-v2` and Pixen, which have no option) and keeps new objects intact.
2. **Do not turn on `use_color_palette_from_reference`, `target_palette` or `use_color_palette_correction` for States.** They win on palette membership only by forcing new objects into body colors, which defeats the point of most States (holding a sword, an apple, a torch). It also ties those objects to the body's recolors.
3. **Do not add a user setting for it either.** It would help only pose-only States, where the local snap already reaches 95 to 100% for free, so the setting would not earn its place.
4. **Possible follow-ups (free):**
   - Keep saturated new objects out of the snap when the body palette has a similar hue, for example by skipping colors whose pixels mostly form a component of off-palette colors.
   - Lower the managed State quotes to the measured 10 generations at 80 px.
