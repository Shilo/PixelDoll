# Try the mount preview

This is a free, local experiment, not a finished mount system. Choosing a seat does not generate art, charge credits or change the character’s pose. No real creature is generated.

## Open it

From `app/`, run `npm run dev:agent` for the authorized agent workflow, then open `http://localhost:5199/?mounts`. The local PixelLab Docker API is a separate process on port 8000; it is only needed for API requests, not for trying the seat preview with stored artwork. Ordinary `npm run dev` does not load the agent credential.

Open a character and choose **Preview** at the top. The experimental seat menu is in the bottom playback controls. It is absent without `?mounts`.

In the live trial browser profile, **Mount trial E (isolated copy)** now has the recovered **Ride** move. Select that character, then **Ride** in the Move menu to compare it with **Default**, without generating anything. It covers East only. The saved trial is browser-local, not bundled with the application.

## What the choices mean

- **No seat** shows the character normally.
- **Open seat** is a simple test shape the character sits on top of, like an open saddle. It does not hide the whole lower body. Use it to spot straight legs or incorrect overlap.
- **Covered seat** has a front wall, like an enclosing shell or cockpit. Use it to see how the same character can sit behind foreground artwork.

These are two different overlap tests, not finished horse or turtle assets. Neither option bends knees or automatically identifies the far leg.

## First test

1. Choose **Open seat**. The drawings currently exist only facing right (**E**, East) and down-right (**SE**, South-East). If the character faces elsewhere, follow the explicit supported-view action, or select E. The preview must tell you why no seat is visible, rather than silently changing the direction.
2. Keep the character’s existing move. If it is a standing move, straight legs are expected: this demonstrates why placing a character on a seat is not the same as creating a riding pose.
3. Choose **Covered seat** and compare which pixels its front wall covers.
4. Turn on **Reveal covered parts (diagnostic)**. The front becomes see-through so you can inspect the covered character. Turn it off again to judge the actual solid result. This diagnostic does not delete or restore character pixels.
5. Try another existing move. A riding move is optional; adding one is a separate paid action, not part of this free test.
6. Choose **No seat** to return to the original preview.

Seat selection and the see-through view are not saved to outfits, thumbnails, exports or shared images. Mount choices also reset after reload. The existing move and character art remain unchanged.

## What to look for

Check whether the hips touch the seat, whether the legs look plausible, and whether foreground artwork incorrectly covers hands or the torso. Compare solid and see-through views. An open-seat success does not qualify a wider creature, another camera view, long garments or every body type.

The experimental ride generation and its quality warning are recorded in [live results](live-results.md). Do not generate it again merely to retrieve an already paid result.
