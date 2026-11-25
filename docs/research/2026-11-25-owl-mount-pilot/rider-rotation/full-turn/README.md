# Live eight-direction Riding test

PixelLab generated a new eight-direction character from one south-facing Standing image with Create Character V3. Studio imported it, measured joints on all eight views, and registered the Standing rig. West, Northwest, and Southwest differ from their reflected eastern counterparts by 469, 527, and 777 visible pixels, respectively. Studio saved all eight as drawn views.

In Studio, **States → New State → Edit this pose → Riding** used Skeleton V3 with Standing as the source and the reference field empty. Studio saved all eight Riding views with their own joints. The only image supplied for each request was that facing's Standing character. The test mount was added afterward in Preview. The rider's hip stayed at the seat through all eight facings.

**Wardrobe → Feet → New → Leather boots** generated a standing item. **Make for Riding** fitted that item to all eight seated views. Studio kept all eight layers and flagged West and Southeast for review. Bare pixels are visible at the boots in both of those views. East also has a small exposed toe despite passing the automated check.

[Studio turn with boots](studio-boots-on.png) · [Studio turn without boots](studio-boots-off.png)

The **PNG + JSON** ZIP included eight nonempty Riding frames each for the [body](export-riding-rider.png) and the [boots](export-riding-boots.png). The schematic mount was added only in Studio. The export warned that the boots needed review. [Export screenshot](studio-export.png)

The live run used 64.05 generations: 1 for the new character, 1.05 for rig setup, 16 for the Riding State, 30 for the standing boots, and 16 to fit them to Riding. The ordinary text-edit fallback was opened and quoted on an unrigged Standing source. Its output quality remains untested.
