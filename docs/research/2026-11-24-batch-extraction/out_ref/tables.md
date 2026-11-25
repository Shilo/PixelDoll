# Reference-guided extractor: generated tables

Colors: accepted reference cell walk/south/0. Spatial reference: the standing cell of each scored direction (walk/<dir>/0), registered by the body centroid; cross-punch uses walk/south/0 registered the same way. The reference cell of each direction is excluded from scoring.

## Rule C group and the same group without the held sword

Exact accepted art. Strict metrics are pixel-exact against the accepted layers; `iou_t` is tolerance-1 IoU against the visible accepted pixels.

| scope | item | P | R | IoU | IoU t1 | prec t1 | rec t1 | area err | bd p95 | z-lost px |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ruleC | vest_leather | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 0.00 | 0 |
| ruleC | hat_wizard | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 0.00 | 0 |
| ruleC | sword_steel | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 0.00 | 0 |
| ruleC_no_sword | vest_leather | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 0.00 | 0 |
| ruleC_no_sword | hat_wizard | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 0.00 | 0 |

## Every pair, exact art

| pair | class | P | R | IoU | IoU t1 | prec t1 | rec t1 | area err | bd p95 | assignment err | shape-only |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vest_leather+cape_red | overlap | 97.1% | 97.0% | 94.2% | 89.9% | 89.6% | 97.1% | 13.4% | 5.21 | 11 | 3 |
| vest_leather+hair_brown | overlap | 99.2% | 99.2% | 98.4% | 99.6% | 99.2% | 100.0% | 1.6% | 0.35 | 7 | 4 |
| vest_leather+helmet_steel | overlap | 100.0% | 99.9% | 99.9% | 100.0% | 100.0% | 100.0% | 0.1% | 0.00 | 0 | 0 |
| vest_leather+hat_wizard | disjoint | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 0.00 | 0 | 0 |
| vest_leather+sword_steel | overlap | 100.0% | 95.5% | 95.5% | 100.0% | 100.0% | 100.0% | 5.2% | 0.24 | 0 | 13 |
| cape_red+hair_brown | overlap | 97.8% | 97.6% | 95.5% | 97.5% | 97.0% | 99.1% | 8.1% | 2.11 | 4 | 3 |
| cape_red+helmet_steel | overlap | 99.9% | 99.5% | 99.4% | 99.8% | 99.9% | 99.8% | 0.6% | 0.15 | 1 | 1 |
| cape_red+hat_wizard | disjoint | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 0.00 | 0 | 0 |
| cape_red+sword_steel | overlap | 100.0% | 97.0% | 97.0% | 99.8% | 100.0% | 99.6% | 5.7% | 0.32 | 0 | 15 |
| hair_brown+helmet_steel | overlap | 99.7% | 99.5% | 99.2% | 91.9% | 100.0% | 91.4% | 8.8% | 4.90 | 4 | 5 |
| hair_brown+hat_wizard | overlap | 100.0% | 99.9% | 99.9% | 99.5% | 100.0% | 99.0% | 1.0% | 0.00 | 0 | 4 |
| hair_brown+sword_steel | disjoint | 100.0% | 95.4% | 95.4% | 100.0% | 100.0% | 100.0% | 5.2% | 0.24 | 0 | 13 |
| helmet_steel+hat_wizard | overlap | 99.9% | 99.8% | 99.7% | 99.5% | 100.0% | 99.0% | 1.0% | 0.00 | 0 | 2 |
| helmet_steel+sword_steel | disjoint | 96.5% | 95.5% | 92.4% | 98.7% | 97.5% | 100.0% | 7.9% | 6.45 | 13 | 13 |
| hat_wizard+sword_steel | disjoint | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 0.00 | 0 | 0 |

## Variants

Micro precision / recall / IoU, strict and tolerant, per scope and variant.

| scope | variant | P | R | IoU | IoU t1 | prec t1 | rec t1 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ruleC | exact | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| ruleC | palette | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| ruleC | geom1 | 66.5% | 85.7% | 59.9% | 96.0% | 100.0% | 95.1% |
| ruleC | geometry | 66.5% | 85.7% | 59.9% | 96.0% | 100.0% | 95.1% |
| ruleC | combined | 66.5% | 85.7% | 59.9% | 96.0% | 100.0% | 95.1% |
| ruleC_no_sword | exact | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| ruleC_no_sword | palette | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| ruleC_no_sword | geom1 | 73.4% | 82.1% | 63.3% | 94.0% | 100.0% | 92.6% |
| ruleC_no_sword | geometry | 73.4% | 82.1% | 63.3% | 94.0% | 100.0% | 92.6% |
| ruleC_no_sword | combined | 73.4% | 82.1% | 63.3% | 94.0% | 100.0% | 92.6% |
| vest_leather+cape_red | exact | 97.1% | 97.0% | 94.2% | 89.9% | 89.6% | 97.1% |
| vest_leather+cape_red | palette | 94.0% | 93.8% | 88.5% | 88.9% | 87.8% | 96.9% |
| vest_leather+cape_red | geom1 | 99.2% | 61.9% | 61.6% | 91.4% | 99.9% | 88.9% |
| vest_leather+cape_red | geometry | 99.2% | 61.9% | 61.6% | 91.4% | 99.9% | 88.9% |
| vest_leather+cape_red | combined | 99.2% | 61.9% | 61.6% | 91.4% | 99.9% | 88.9% |
| vest_leather+hair_brown | exact | 99.2% | 99.2% | 98.4% | 99.6% | 99.2% | 100.0% |
| vest_leather+hair_brown | palette | 96.4% | 96.4% | 93.0% | 98.1% | 96.9% | 99.5% |
| vest_leather+hair_brown | geom1 | 71.7% | 75.7% | 58.3% | 95.1% | 99.9% | 93.6% |
| vest_leather+hair_brown | geometry | 68.5% | 72.4% | 54.3% | 88.8% | 89.4% | 93.8% |
| vest_leather+hair_brown | combined | 68.6% | 72.5% | 54.5% | 88.9% | 89.5% | 93.9% |
| vest_leather+helmet_steel | exact | 100.0% | 99.9% | 99.9% | 100.0% | 100.0% | 100.0% |
| vest_leather+helmet_steel | palette | 100.0% | 84.2% | 84.2% | 99.8% | 100.0% | 99.6% |
| vest_leather+helmet_steel | geom1 | 100.0% | 53.7% | 53.7% | 93.5% | 100.0% | 91.1% |
| vest_leather+helmet_steel | geometry | 100.0% | 53.7% | 53.7% | 93.5% | 100.0% | 91.1% |
| vest_leather+helmet_steel | combined | 100.0% | 53.1% | 53.1% | 93.3% | 100.0% | 90.7% |
| vest_leather+hat_wizard | exact | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| vest_leather+hat_wizard | palette | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| vest_leather+hat_wizard | geom1 | 73.4% | 82.1% | 63.3% | 94.0% | 100.0% | 92.6% |
| vest_leather+hat_wizard | geometry | 73.4% | 82.1% | 63.3% | 94.0% | 100.0% | 92.6% |
| vest_leather+hat_wizard | combined | 73.4% | 82.1% | 63.3% | 94.0% | 100.0% | 92.6% |
| vest_leather+sword_steel | exact | 100.0% | 95.5% | 95.5% | 100.0% | 100.0% | 100.0% |
| vest_leather+sword_steel | palette | 100.0% | 90.1% | 90.1% | 99.9% | 100.0% | 99.9% |
| vest_leather+sword_steel | geom1 | 64.4% | 68.2% | 49.5% | 95.4% | 100.0% | 93.9% |
| vest_leather+sword_steel | geometry | 64.4% | 68.2% | 49.5% | 95.4% | 100.0% | 93.9% |
| vest_leather+sword_steel | combined | 62.7% | 62.8% | 45.7% | 95.4% | 100.0% | 93.8% |
| cape_red+hair_brown | exact | 97.8% | 97.6% | 95.5% | 97.5% | 97.0% | 99.1% |
| cape_red+hair_brown | palette | 97.7% | 97.6% | 95.5% | 97.5% | 97.0% | 99.1% |
| cape_red+hair_brown | geom1 | 83.0% | 71.4% | 62.3% | 95.8% | 99.9% | 94.0% |
| cape_red+hair_brown | geometry | 81.1% | 69.9% | 60.1% | 89.3% | 89.4% | 94.1% |
| cape_red+hair_brown | combined | 81.1% | 69.9% | 60.1% | 89.3% | 89.4% | 94.1% |
| cape_red+helmet_steel | exact | 99.9% | 99.5% | 99.4% | 99.8% | 99.9% | 99.8% |
| cape_red+helmet_steel | palette | 100.0% | 91.8% | 91.8% | 99.7% | 100.0% | 99.5% |
| cape_red+helmet_steel | geom1 | 100.0% | 60.6% | 60.6% | 94.0% | 100.0% | 91.3% |
| cape_red+helmet_steel | geometry | 100.0% | 60.6% | 60.6% | 94.0% | 100.0% | 91.3% |
| cape_red+helmet_steel | combined | 100.0% | 60.3% | 60.2% | 93.7% | 100.0% | 91.0% |
| cape_red+hat_wizard | exact | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| cape_red+hat_wizard | palette | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| cape_red+hat_wizard | geom1 | 79.5% | 74.7% | 62.6% | 96.4% | 100.0% | 94.9% |
| cape_red+hat_wizard | geometry | 79.5% | 74.7% | 62.6% | 96.4% | 100.0% | 94.9% |
| cape_red+hat_wizard | combined | 79.5% | 74.7% | 62.6% | 96.4% | 100.0% | 94.9% |
| cape_red+sword_steel | exact | 100.0% | 97.0% | 97.0% | 99.8% | 100.0% | 99.6% |
| cape_red+sword_steel | palette | 100.0% | 94.4% | 94.4% | 99.7% | 100.0% | 99.5% |
| cape_red+sword_steel | geom1 | 77.3% | 63.6% | 53.6% | 92.0% | 100.0% | 90.1% |
| cape_red+sword_steel | geometry | 77.3% | 63.6% | 53.6% | 92.0% | 100.0% | 90.1% |
| cape_red+sword_steel | combined | 76.8% | 60.9% | 51.4% | 92.0% | 100.0% | 90.0% |
| hair_brown+helmet_steel | exact | 99.7% | 99.5% | 99.2% | 91.9% | 100.0% | 91.4% |
| hair_brown+helmet_steel | palette | 100.0% | 72.6% | 72.6% | 93.4% | 100.0% | 92.7% |
| hair_brown+helmet_steel | geom1 | 46.2% | 59.9% | 35.3% | 79.3% | 79.3% | 97.2% |
| hair_brown+helmet_steel | geometry | 44.8% | 59.0% | 34.2% | 73.7% | 73.0% | 96.6% |
| hair_brown+helmet_steel | combined | 44.3% | 57.9% | 33.5% | 73.5% | 73.0% | 96.8% |
| hair_brown+hat_wizard | exact | 100.0% | 99.9% | 99.9% | 99.5% | 100.0% | 99.0% |
| hair_brown+hat_wizard | palette | 100.0% | 99.9% | 99.9% | 99.5% | 100.0% | 99.0% |
| hair_brown+hat_wizard | geom1 | 64.6% | 95.6% | 62.8% | 99.3% | 100.0% | 98.1% |
| hair_brown+hat_wizard | geometry | 65.1% | 94.5% | 62.7% | 81.8% | 75.0% | 92.0% |
| hair_brown+hat_wizard | combined | 65.1% | 94.5% | 62.7% | 81.8% | 75.0% | 92.0% |
| hair_brown+sword_steel | exact | 100.0% | 95.4% | 95.4% | 100.0% | 100.0% | 100.0% |
| hair_brown+sword_steel | palette | 100.0% | 89.8% | 89.8% | 99.9% | 100.0% | 99.9% |
| hair_brown+sword_steel | geom1 | 56.5% | 95.4% | 55.0% | 100.0% | 100.0% | 100.0% |
| hair_brown+sword_steel | geometry | 54.2% | 91.4% | 51.5% | 93.5% | 89.5% | 100.0% |
| hair_brown+sword_steel | combined | 52.8% | 85.8% | 48.5% | 93.4% | 89.5% | 99.9% |
| helmet_steel+hat_wizard | exact | 99.9% | 99.8% | 99.7% | 99.5% | 100.0% | 99.0% |
| helmet_steel+hat_wizard | palette | 97.8% | 93.4% | 91.5% | 92.5% | 99.5% | 90.3% |
| helmet_steel+hat_wizard | geom1 | 68.8% | 90.7% | 64.3% | 78.2% | 99.9% | 76.7% |
| helmet_steel+hat_wizard | geometry | 68.8% | 90.7% | 64.3% | 78.2% | 99.9% | 76.7% |
| helmet_steel+hat_wizard | combined | 68.4% | 89.9% | 63.5% | 59.0% | 99.8% | 58.4% |
| helmet_steel+sword_steel | exact | 96.5% | 95.5% | 92.4% | 98.7% | 97.5% | 100.0% |
| helmet_steel+sword_steel | palette | 100.0% | 72.1% | 72.1% | 99.7% | 100.0% | 99.5% |
| helmet_steel+sword_steel | geom1 | 62.2% | 68.7% | 48.5% | 95.9% | 94.8% | 97.2% |
| helmet_steel+sword_steel | geometry | 62.2% | 68.7% | 48.5% | 95.9% | 94.8% | 97.2% |
| helmet_steel+sword_steel | combined | 63.1% | 62.6% | 45.8% | 97.8% | 99.8% | 96.8% |
| hat_wizard+sword_steel | exact | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| hat_wizard+sword_steel | palette | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| hat_wizard+sword_steel | geom1 | 62.5% | 100.0% | 62.5% | 100.0% | 100.0% | 100.0% |
| hat_wizard+sword_steel | geometry | 62.5% | 100.0% | 62.5% | 100.0% | 100.0% | 100.0% |
| hat_wizard+sword_steel | combined | 62.5% | 100.0% | 62.5% | 100.0% | 100.0% | 100.0% |
| disjoint_all | exact | 99.3% | 98.2% | 97.5% | 99.6% | 99.2% | 100.0% |
| disjoint_all | palette | 100.0% | 92.2% | 92.2% | 99.9% | 100.0% | 99.8% |
| disjoint_all | geom1 | 65.9% | 82.8% | 58.0% | 95.5% | 98.3% | 94.9% |
| disjoint_all | geometry | 65.3% | 82.0% | 57.1% | 93.3% | 94.7% | 94.9% |
| disjoint_all | combined | 65.2% | 79.6% | 55.9% | 93.9% | 96.4% | 94.8% |
| overlap_all | exact | 99.1% | 98.2% | 97.3% | 98.0% | 98.8% | 98.7% |
| overlap_all | palette | 98.2% | 92.5% | 91.0% | 97.5% | 98.3% | 98.3% |
| overlap_all | geom1 | 79.0% | 67.0% | 56.9% | 93.3% | 98.0% | 93.7% |
| overlap_all | geometry | 78.2% | 66.4% | 56.0% | 90.7% | 94.2% | 93.3% |
| overlap_all | combined | 78.0% | 65.4% | 55.2% | 89.7% | 94.2% | 92.4% |

## Verifier

Ground truth for a bad extraction is an **assignment error**: the item claims more than 3% of its pixels from another item's visible layer, or the item comes out empty. A one-pixel shape difference is not an assignment error and is not counted here.

| scope | variant | assignment errors | false pass | false fail |
| --- | --- | ---: | ---: | ---: |
| ruleC | exact | 0/42 | 0 | 0 |
| ruleC | palette | 0/42 | 0 | 0 |
| ruleC | geom1 | 0/42 | 0 | 19 |
| ruleC | geometry | 0/42 | 0 | 19 |
| ruleC | combined | 0/42 | 0 | 19 |
| ruleC_no_sword | exact | 0/28 | 0 | 0 |
| ruleC_no_sword | palette | 0/28 | 0 | 0 |
| ruleC_no_sword | geom1 | 0/28 | 0 | 7 |
| ruleC_no_sword | geometry | 0/28 | 0 | 7 |
| ruleC_no_sword | combined | 0/28 | 0 | 7 |
| vest_leather+cape_red | exact | 11/54 | 0 | 10 |
| vest_leather+cape_red | palette | 31/54 | 19 | 9 |
| vest_leather+cape_red | geom1 | 16/54 | 0 | 16 |
| vest_leather+cape_red | geometry | 16/54 | 0 | 16 |
| vest_leather+cape_red | combined | 16/54 | 0 | 16 |
| vest_leather+hair_brown | exact | 7/54 | 7 | 6 |
| vest_leather+hair_brown | palette | 13/54 | 13 | 7 |
| vest_leather+hair_brown | geom1 | 4/54 | 4 | 13 |
| vest_leather+hair_brown | geometry | 0/54 | 0 | 13 |
| vest_leather+hair_brown | combined | 0/54 | 0 | 13 |
| vest_leather+helmet_steel | exact | 0/54 | 0 | 5 |
| vest_leather+helmet_steel | palette | 0/54 | 0 | 5 |
| vest_leather+helmet_steel | geom1 | 0/54 | 0 | 20 |
| vest_leather+helmet_steel | geometry | 0/54 | 0 | 20 |
| vest_leather+helmet_steel | combined | 0/54 | 0 | 21 |
| vest_leather+hat_wizard | exact | 0/28 | 0 | 0 |
| vest_leather+hat_wizard | palette | 0/28 | 0 | 0 |
| vest_leather+hat_wizard | geom1 | 0/28 | 0 | 7 |
| vest_leather+hat_wizard | geometry | 0/28 | 0 | 7 |
| vest_leather+hat_wizard | combined | 0/28 | 0 | 7 |
| vest_leather+sword_steel | exact | 0/54 | 0 | 0 |
| vest_leather+sword_steel | palette | 0/54 | 0 | 4 |
| vest_leather+sword_steel | geom1 | 2/54 | 2 | 25 |
| vest_leather+sword_steel | geometry | 2/54 | 2 | 25 |
| vest_leather+sword_steel | combined | 2/54 | 2 | 25 |
| cape_red+hair_brown | exact | 4/54 | 2 | 4 |
| cape_red+hair_brown | palette | 4/54 | 2 | 18 |
| cape_red+hair_brown | geom1 | 10/54 | 10 | 12 |
| cape_red+hair_brown | geometry | 0/54 | 0 | 13 |
| cape_red+hair_brown | combined | 0/54 | 0 | 27 |
| cape_red+helmet_steel | exact | 1/54 | 1 | 5 |
| cape_red+helmet_steel | palette | 0/54 | 0 | 5 |
| cape_red+helmet_steel | geom1 | 0/54 | 0 | 19 |
| cape_red+helmet_steel | geometry | 0/54 | 0 | 19 |
| cape_red+helmet_steel | combined | 0/54 | 0 | 20 |
| cape_red+hat_wizard | exact | 0/28 | 0 | 0 |
| cape_red+hat_wizard | palette | 0/28 | 0 | 0 |
| cape_red+hat_wizard | geom1 | 0/28 | 0 | 6 |
| cape_red+hat_wizard | geometry | 0/28 | 0 | 6 |
| cape_red+hat_wizard | combined | 0/28 | 0 | 6 |
| cape_red+sword_steel | exact | 0/54 | 0 | 8 |
| cape_red+sword_steel | palette | 0/54 | 0 | 12 |
| cape_red+sword_steel | geom1 | 23/54 | 14 | 16 |
| cape_red+sword_steel | geometry | 23/54 | 14 | 16 |
| cape_red+sword_steel | combined | 23/54 | 14 | 16 |
| hair_brown+helmet_steel | exact | 4/54 | 0 | 23 |
| hair_brown+helmet_steel | palette | 3/54 | 0 | 24 |
| hair_brown+helmet_steel | geom1 | 27/54 | 0 | 7 |
| hair_brown+helmet_steel | geometry | 27/54 | 0 | 7 |
| hair_brown+helmet_steel | combined | 27/54 | 0 | 8 |
| hair_brown+hat_wizard | exact | 0/28 | 0 | 14 |
| hair_brown+hat_wizard | palette | 0/28 | 0 | 14 |
| hair_brown+hat_wizard | geom1 | 10/28 | 10 | 14 |
| hair_brown+hat_wizard | geometry | 10/28 | 10 | 14 |
| hair_brown+hat_wizard | combined | 10/28 | 10 | 14 |
| hair_brown+sword_steel | exact | 0/54 | 0 | 0 |
| hair_brown+sword_steel | palette | 0/54 | 0 | 4 |
| hair_brown+sword_steel | geom1 | 0/54 | 0 | 12 |
| hair_brown+sword_steel | geometry | 0/54 | 0 | 12 |
| hair_brown+sword_steel | combined | 0/54 | 0 | 12 |
| helmet_steel+hat_wizard | exact | 0/28 | 0 | 14 |
| helmet_steel+hat_wizard | palette | 2/28 | 2 | 14 |
| helmet_steel+hat_wizard | geom1 | 7/28 | 7 | 14 |
| helmet_steel+hat_wizard | geometry | 7/28 | 7 | 14 |
| helmet_steel+hat_wizard | combined | 15/28 | 7 | 6 |
| helmet_steel+sword_steel | exact | 13/54 | 6 | 0 |
| helmet_steel+sword_steel | palette | 0/54 | 0 | 4 |
| helmet_steel+sword_steel | geom1 | 13/54 | 6 | 19 |
| helmet_steel+sword_steel | geometry | 13/54 | 6 | 19 |
| helmet_steel+sword_steel | combined | 0/54 | 0 | 20 |
| hat_wizard+sword_steel | exact | 0/28 | 0 | 0 |
| hat_wizard+sword_steel | palette | 0/28 | 0 | 0 |
| hat_wizard+sword_steel | geom1 | 0/28 | 0 | 12 |
| hat_wizard+sword_steel | geometry | 0/28 | 0 | 12 |
| hat_wizard+sword_steel | combined | 0/28 | 0 | 12 |
| disjoint_all | exact | 13/192 | 6 | 0 |
| disjoint_all | palette | 0/192 | 0 | 8 |
| disjoint_all | geom1 | 13/192 | 6 | 56 |
| disjoint_all | geometry | 13/192 | 6 | 56 |
| disjoint_all | combined | 0/192 | 0 | 57 |
| overlap_all | exact | 27/488 | 10 | 89 |
| overlap_all | palette | 53/488 | 36 | 112 |
| overlap_all | geom1 | 99/488 | 47 | 156 |
| overlap_all | geometry | 85/488 | 33 | 157 |
| overlap_all | combined | 93/488 | 33 | 166 |

## Assignment error versus shape-only failure

Assignment errors are wrong-item pixels. A shape-only failure is an item that is correctly assigned but whose silhouette differs from the accepted layer (strict recall or precision below 95/98% while the assignment is clean).

| scope | variant | assignment errors | shape-only frames | strict IoU | tolerant IoU |
| --- | --- | ---: | ---: | ---: | ---: |
| ruleC | exact | 0 | 0 | 100.0% | 100.0% |
| ruleC | palette | 0 | 0 | 100.0% | 100.0% |
| ruleC | geom1 | 0 | 42 | 59.9% | 96.0% |
| ruleC | geometry | 0 | 42 | 59.9% | 96.0% |
| ruleC | combined | 0 | 42 | 59.9% | 96.0% |
| ruleC_no_sword | exact | 0 | 0 | 100.0% | 100.0% |
| ruleC_no_sword | palette | 0 | 0 | 100.0% | 100.0% |
| ruleC_no_sword | geom1 | 0 | 28 | 63.3% | 94.0% |
| ruleC_no_sword | geometry | 0 | 28 | 63.3% | 94.0% |
| ruleC_no_sword | combined | 0 | 28 | 63.3% | 94.0% |
| vest_leather+cape_red | exact | 11 | 3 | 94.2% | 89.9% |
| vest_leather+cape_red | palette | 31 | 16 | 88.5% | 88.9% |
| vest_leather+cape_red | geom1 | 16 | 38 | 61.6% | 91.4% |
| vest_leather+cape_red | geometry | 16 | 38 | 61.6% | 91.4% |
| vest_leather+cape_red | combined | 16 | 38 | 61.6% | 91.4% |
| vest_leather+hair_brown | exact | 7 | 4 | 98.4% | 99.6% |
| vest_leather+hair_brown | palette | 13 | 13 | 93.0% | 98.1% |
| vest_leather+hair_brown | geom1 | 4 | 50 | 58.3% | 95.1% |
| vest_leather+hair_brown | geometry | 0 | 54 | 54.3% | 88.8% |
| vest_leather+hair_brown | combined | 0 | 54 | 54.5% | 88.9% |
| vest_leather+helmet_steel | exact | 0 | 0 | 99.9% | 100.0% |
| vest_leather+helmet_steel | palette | 0 | 27 | 84.2% | 99.8% |
| vest_leather+helmet_steel | geom1 | 0 | 54 | 53.7% | 93.5% |
| vest_leather+helmet_steel | geometry | 0 | 54 | 53.7% | 93.5% |
| vest_leather+helmet_steel | combined | 0 | 54 | 53.1% | 93.3% |
| vest_leather+hat_wizard | exact | 0 | 0 | 100.0% | 100.0% |
| vest_leather+hat_wizard | palette | 0 | 0 | 100.0% | 100.0% |
| vest_leather+hat_wizard | geom1 | 0 | 28 | 63.3% | 94.0% |
| vest_leather+hat_wizard | geometry | 0 | 28 | 63.3% | 94.0% |
| vest_leather+hat_wizard | combined | 0 | 28 | 63.3% | 94.0% |
| vest_leather+sword_steel | exact | 0 | 13 | 95.5% | 100.0% |
| vest_leather+sword_steel | palette | 0 | 13 | 90.1% | 99.9% |
| vest_leather+sword_steel | geom1 | 2 | 52 | 49.5% | 95.4% |
| vest_leather+sword_steel | geometry | 2 | 52 | 49.5% | 95.4% |
| vest_leather+sword_steel | combined | 2 | 52 | 45.7% | 95.4% |
| cape_red+hair_brown | exact | 4 | 3 | 95.5% | 97.5% |
| cape_red+hair_brown | palette | 4 | 3 | 95.5% | 97.5% |
| cape_red+hair_brown | geom1 | 10 | 44 | 62.3% | 95.8% |
| cape_red+hair_brown | geometry | 0 | 54 | 60.1% | 89.3% |
| cape_red+hair_brown | combined | 0 | 54 | 60.1% | 89.3% |
| cape_red+helmet_steel | exact | 1 | 1 | 99.4% | 99.8% |
| cape_red+helmet_steel | palette | 0 | 28 | 91.8% | 99.7% |
| cape_red+helmet_steel | geom1 | 0 | 54 | 60.6% | 94.0% |
| cape_red+helmet_steel | geometry | 0 | 54 | 60.6% | 94.0% |
| cape_red+helmet_steel | combined | 0 | 54 | 60.2% | 93.7% |
| cape_red+hat_wizard | exact | 0 | 0 | 100.0% | 100.0% |
| cape_red+hat_wizard | palette | 0 | 0 | 100.0% | 100.0% |
| cape_red+hat_wizard | geom1 | 0 | 28 | 62.6% | 96.4% |
| cape_red+hat_wizard | geometry | 0 | 28 | 62.6% | 96.4% |
| cape_red+hat_wizard | combined | 0 | 28 | 62.6% | 96.4% |
| cape_red+sword_steel | exact | 0 | 15 | 97.0% | 99.8% |
| cape_red+sword_steel | palette | 0 | 15 | 94.4% | 99.7% |
| cape_red+sword_steel | geom1 | 23 | 31 | 53.6% | 92.0% |
| cape_red+sword_steel | geometry | 23 | 31 | 53.6% | 92.0% |
| cape_red+sword_steel | combined | 23 | 31 | 51.4% | 92.0% |
| hair_brown+helmet_steel | exact | 4 | 5 | 99.2% | 91.9% |
| hair_brown+helmet_steel | palette | 3 | 31 | 72.6% | 93.4% |
| hair_brown+helmet_steel | geom1 | 27 | 27 | 35.3% | 79.3% |
| hair_brown+helmet_steel | geometry | 27 | 27 | 34.2% | 73.7% |
| hair_brown+helmet_steel | combined | 27 | 27 | 33.5% | 73.5% |
| hair_brown+hat_wizard | exact | 0 | 4 | 99.9% | 99.5% |
| hair_brown+hat_wizard | palette | 0 | 4 | 99.9% | 99.5% |
| hair_brown+hat_wizard | geom1 | 10 | 18 | 62.8% | 99.3% |
| hair_brown+hat_wizard | geometry | 10 | 18 | 62.7% | 81.8% |
| hair_brown+hat_wizard | combined | 10 | 18 | 62.7% | 81.8% |
| hair_brown+sword_steel | exact | 0 | 13 | 95.4% | 100.0% |
| hair_brown+sword_steel | palette | 0 | 13 | 89.8% | 99.9% |
| hair_brown+sword_steel | geom1 | 0 | 54 | 55.0% | 100.0% |
| hair_brown+sword_steel | geometry | 0 | 54 | 51.5% | 93.5% |
| hair_brown+sword_steel | combined | 0 | 54 | 48.5% | 93.4% |
| helmet_steel+hat_wizard | exact | 0 | 2 | 99.7% | 99.5% |
| helmet_steel+hat_wizard | palette | 2 | 23 | 91.5% | 92.5% |
| helmet_steel+hat_wizard | geom1 | 7 | 21 | 64.3% | 78.2% |
| helmet_steel+hat_wizard | geometry | 7 | 21 | 64.3% | 78.2% |
| helmet_steel+hat_wizard | combined | 15 | 13 | 63.5% | 59.0% |
| helmet_steel+sword_steel | exact | 13 | 13 | 92.4% | 98.7% |
| helmet_steel+sword_steel | palette | 0 | 40 | 72.1% | 99.7% |
| helmet_steel+sword_steel | geom1 | 13 | 41 | 48.5% | 95.9% |
| helmet_steel+sword_steel | geometry | 13 | 41 | 48.5% | 95.9% |
| helmet_steel+sword_steel | combined | 0 | 54 | 45.8% | 97.8% |
| hat_wizard+sword_steel | exact | 0 | 0 | 100.0% | 100.0% |
| hat_wizard+sword_steel | palette | 0 | 0 | 100.0% | 100.0% |
| hat_wizard+sword_steel | geom1 | 0 | 28 | 62.5% | 100.0% |
| hat_wizard+sword_steel | geometry | 0 | 28 | 62.5% | 100.0% |
| hat_wizard+sword_steel | combined | 0 | 28 | 62.5% | 100.0% |
| disjoint_all | exact | 13 | 26 | 97.5% | 99.6% |
| disjoint_all | palette | 0 | 53 | 92.2% | 99.9% |
| disjoint_all | geom1 | 13 | 179 | 58.0% | 95.5% |
| disjoint_all | geometry | 13 | 179 | 57.1% | 93.3% |
| disjoint_all | combined | 0 | 192 | 55.9% | 93.9% |
| overlap_all | exact | 27 | 50 | 97.3% | 98.0% |
| overlap_all | palette | 53 | 173 | 91.0% | 97.5% |
| overlap_all | geom1 | 99 | 389 | 56.9% | 93.3% |
| overlap_all | geometry | 85 | 403 | 56.0% | 90.7% |
| overlap_all | combined | 93 | 395 | 55.2% | 89.7% |
