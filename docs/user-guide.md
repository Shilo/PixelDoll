# PixelDoll user guide

PixelDoll makes a pixel-art character you can dress up. Every hat, top or weapon is its own layer, so your game can swap
them at runtime. The pictures are drawn by [PixelLab](https://pixellab.ai) using your PixelLab account.

## Try the demo

On the welcome screen, press **Try the demo**. The demo character is free and needs no account. You can dress it up, recolour
it, save outfits and export it. To make your own character and items, you need a PixelLab key.

## Connect your PixelLab key

Open **Connect PixelLab…** from the character menu (top left), or press the gens counter in the toolbar. Paste your key
(**Get a key** opens your PixelLab account page), then press **Connect**.

- The key is only sent to PixelLab.
- It is forgotten when you close PixelDoll, unless you tick **Remember on this device**. **Forget key** removes it.
- Remembered keys are shared with PixelLab Backpack on the same website. Open or reload either app to use the saved key;
  **Forget key** removes the shared saved key for both apps.
- The toolbar then shows how many **gens** you have left.

## What "gens" cost

A gen is one PixelLab generation from your account's monthly allowance. Before you spend anything, every button that spends
shows its price, for example **Create 35–50 gens** or **Make 28 gens**. Typical prices:

| Action | About |
|---|---|
| Create a character (idle + walk, 4 directions) | 35–50 gens, about 12 minutes |
| Create a character with 8 directions | 57–75 gens, about 18 minutes |
| Make an item | about 28 gens |
| Add a move | 30–40 gens |
| Try again on an item | shown on the button |
| Dress up, recolour, outfits, export | free |

The price is an estimate. When an automatic check fails, PixelDoll re-rolls that part, so a job can cost a little more.
**Activity** shows each job's real cost and your balance. Some calls are billed in dollars instead of gens; your balance is the
real total.

## Create a character

Character menu → **New character…**

1. **Name** it, then describe the body under **Who is it?**, for example "a stocky dwarf with a friendly face". Describe only
   the body. Hair, clothes and gear come later as separate items.
2. Pick **Skin** and **Build** (slim, average, stocky) if you like.
3. Press **Create**. You get idle and walk, facing south, east, north and west, as 64 × 64 pixel sprites. West is a mirror of
   east.

**More options** (folded away; the defaults suit most games):

- **Directions**: **4** (default) or **8**. With 8 you also get the diagonals: south-east, north-east and north-west,
  south-west, west are mirrors of their east-facing twins. The price on **Create** updates as you choose (8 directions costs
  about 60 % more).
- **Body size**: **48 px** (default) or **56 px** tall inside the same 64 × 64 sprite. 56 px gives a bigger figure but less room
  above the head for tall hats. If a 56 px character comes out too tall to leave 6 px above its head, PixelDoll stops after the
  first drawing (2 gens) and asks you to try again with 48 px or another seed.
- **Name** and **Seed** (same seed + same description = the same first drawing).

New characters wear a light grey shirt and dark grey shorts, so you can tell them apart and recolour them separately.

You can keep working or close the tab while it runs. It picks up where it left off. When it is done, press
**Start dressing up**.

## Add items

In the wardrobe, press **+** next to a slot group (Head, Hair, Face, Body, Legs, Feet, Back, Hands), or **New**.

1. **What is it?** Describe the item, for example "leather hat", or tap an idea.
2. **Where does it go?** Pick the group. **Details** lets you choose the exact slot (a beard goes under Hair, a shield in the
   off hand).
3. Add an optional **Colour hint**, then press **Make**.

Items are drawn for your own character. On the demo, use **Copy the demo body** to get an editable copy first.

### Review: Clean or Needs a look

When an item is done, it appears on your character for review in every direction.

- **Clean**: every frame passed PixelDoll's checks.
- **Needs a look**: a check flagged something. The reason is listed, for example "The item touches the frame edge (may be
  cut off)", "The item switches hands" or "Some body pixels were changed by the model". It is often still fine. Play it, look
  at each direction, then decide.

Then choose **Keep it**, **Try again** (spends gens again) or **Discard**.

## Dress up

- Tap an item in the wardrobe to wear it. One item per slot: wearing a new hat takes the old one off. Tap **None** to empty
  a slot.
- **Random look** (shuffle icon) picks a random outfit.
- The inspector (right side) shows the selected item. You can change its layer order, choose which items it hides when worn
  ("When worn, hide"), take it off, or remove it for good.
- **Undo** and **Redo** are in the toolbar (Ctrl+Z, Ctrl+Shift+Z).
- **Outfits**: press **Save current look** and give it a name. Outfits are exported too, so your game can switch between them.

Everything saves on this device automatically.

## Recolour

Open the **Colours** tab. Pick a swatch for each colour of the item (or of **Everything you wear**), or **Pick any colour**.
The body has three: **Shirt**, **Shorts** and **Skin** (characters made before this came with one shared grey; PixelDoll
splits it into shirt and shorts the next time you open them, nothing is regenerated).
**Original** restores one colour and **Reset** restores them all. Recolouring swaps exact colours,
so pixel art stays crisp, and it is free.

## Add a move

Open the **Moves** tab → **Add a move**. Pick **Slash**, **Cast**, **Hurt** or **Death**, or describe your own under **Or
describe it**, for example "jumping in place". Items you tick under **Animate these items too** are made for the new move.
Items you leave out stay hidden in that move until you make them. A worn item without frames for the current move shows
a note on the stage with **Make it** and its price.

Moves are added to your own characters (not the demo).

## Export

Press **Export** (toolbar), choose **For which engine?**: Godot, Unity, Phaser or PNG + JSON, and download the zip. Export is
free and runs on your device. Tick **Also export finished characters** to also get one ready-made sheet per outfit.

Each zip has a `README.txt` with a quick start for that engine. Copy the whole folder into your project.

## Good to know

- **Activity** (toolbar) lists running jobs with **Stop** and **Cancel**, and your balance.
- With PixelDoll open in two tabs, one tab runs the jobs ("Working in another tab"). Keep it open.
- Keys: Space play/pause · 1–4 face south/east/north/west (1–8 on 8-direction characters, in the order of the direction
  buttons) · 0 all directions · , and . step one frame.
- **Offline?** A small banner says "You're offline — generation paused; everything else works". Running and queued jobs wait
  (nothing is sent, so no gens are spent on a dead connection) and continue by themselves when you are back online.
  Dressing up, recolouring, outfits and export keep working.
- PixelLab may decline some descriptions. Try different words.
