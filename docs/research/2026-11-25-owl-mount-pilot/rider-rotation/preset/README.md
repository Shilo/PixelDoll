# Riding preset validation

The Riding suggestion uses Skeleton V3 for a Standing view with saved humanoid joints and no uploaded reference. It still lets the player edit the prompt and review the result. Every drawn facing is priced separately. The app sends three copies of the planned pose to the endpoint and saves one body cell, alongside its requested joints and hip contact. A reference image or other source frame uses the ordinary State edit options.

## Paid checks

- The same preset was applied to a short 64 px body, a broad 80 px body and a tall 160 px body. The first pass spread the tall body's legs too far. A torso-relative cap corrected the long projection while retaining the broad body's already reviewed targets. The adjusted front and side renders were visually reviewed on all three bodies. [Body comparison](bodies.png)
- On an additional 80 px body, the first diagonal targets read as a step. Giving both knees a forward bend corrected the southeast and northeast body silhouettes. North also rendered a seated pose. Independent west-facing artwork and other camera angles were not separately qualified. [Rear and diagonal poses](quarters.png)
- A normal ankle-high leather boot was drawn on the standing version of the same broad rider and fitted to its Riding State using the existing item sheet generator and extraction checks. Front and side both passed. The extracted layers contain 223 and 96 pixels, respectively. The mounted comparison uses PixelDoll's regular equipment compositor and the external mount's existing foreground. Outfit swapping kept the body and mount pixels independent. The boot test used two still views on one mount. [Mounted boot swap](boot-swap.png) · [Item checks](boot-fitting.json)

The body calls billed 30 generations, and the standing boot design billed 10. The item fitting call was quoted at 10 and completed. Its exact billing receipt was not retained. This brings the pilot to 163 confirmed generations plus the completed fitting call, within the 300-generation cap.
