# Verifier operating points

`assignment error` = the item claims more than 3% of its pixels from another item's visible layer, or comes out empty. `unusable layer` adds a collapsed area (below half the direction reference) or strict recall below 75%. The verifier sees no ground truth.

## ruleC (all variants) (350 item-frames)

Ground truth: assignment error.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 0 | 0/0 | 0.0% | 22.3% |
| confidence >= 0.90 | 0 | 0/0 | 0.0% | 22.3% |
| hard signals only | 0 | 0/0 | 0.0% | 22.3% |
| z-order violation > 2% | 0 | 0/0 | 0.0% | 100.0% |
| assignment gate (empty or z-violation) | 0 | 0/0 | 0.0% | 0.0% |
| ambiguity <= 10% and area in range | 0 | 0/0 | 0.0% | 22.3% |
| ORACLE tolerant prec/rec >= 95/90 | 0 | 0/0 | 0.0% | 12.0% |

Ground truth: unusable layer.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 84 | 42/84 | 50.0% | 13.5% |
| confidence >= 0.90 | 84 | 42/84 | 50.0% | 13.5% |
| hard signals only | 84 | 42/84 | 50.0% | 13.5% |
| z-order violation > 2% | 84 | 84/84 | 0.0% | 100.0% |
| assignment gate (empty or z-violation) | 84 | 0/84 | 100.0% | 0.0% |
| ambiguity <= 10% and area in range | 84 | 42/84 | 50.0% | 13.5% |
| ORACLE tolerant prec/rec >= 95/90 | 84 | 42/84 | 50.0% | 0.0% |

## ruleC exact+palette (140 item-frames)

Ground truth: assignment error.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 0 | 0/0 | 0.0% | 0.0% |
| confidence >= 0.90 | 0 | 0/0 | 0.0% | 0.0% |
| hard signals only | 0 | 0/0 | 0.0% | 0.0% |
| z-order violation > 2% | 0 | 0/0 | 0.0% | 100.0% |
| assignment gate (empty or z-violation) | 0 | 0/0 | 0.0% | 0.0% |
| ambiguity <= 10% and area in range | 0 | 0/0 | 0.0% | 0.0% |
| ORACLE tolerant prec/rec >= 95/90 | 0 | 0/0 | 0.0% | 0.0% |

Ground truth: unusable layer.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 0 | 0/0 | 0.0% | 0.0% |
| confidence >= 0.90 | 0 | 0/0 | 0.0% | 0.0% |
| hard signals only | 0 | 0/0 | 0.0% | 0.0% |
| z-order violation > 2% | 0 | 0/0 | 0.0% | 100.0% |
| assignment gate (empty or z-violation) | 0 | 0/0 | 0.0% | 0.0% |
| ambiguity <= 10% and area in range | 0 | 0/0 | 0.0% | 0.0% |
| ORACLE tolerant prec/rec >= 95/90 | 0 | 0/0 | 0.0% | 0.0% |

## disjoint_all exact+palette (384 item-frames)

Ground truth: assignment error.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 13 | 7/13 | 46.2% | 2.2% |
| confidence >= 0.90 | 13 | 7/13 | 46.2% | 2.2% |
| hard signals only | 13 | 7/13 | 46.2% | 2.2% |
| z-order violation > 2% | 13 | 6/13 | 53.8% | 100.0% |
| assignment gate (empty or z-violation) | 13 | 7/13 | 46.2% | 0.0% |
| ambiguity <= 10% and area in range | 13 | 0/13 | 100.0% | 2.2% |
| ORACLE tolerant prec/rec >= 95/90 | 13 | 12/13 | 7.7% | 0.0% |

Ground truth: unusable layer.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 67 | 15/67 | 77.6% | 0.0% |
| confidence >= 0.90 | 67 | 15/67 | 77.6% | 0.0% |
| hard signals only | 67 | 15/67 | 77.6% | 0.0% |
| z-order violation > 2% | 67 | 60/67 | 10.4% | 100.0% |
| assignment gate (empty or z-violation) | 67 | 7/67 | 89.6% | 0.0% |
| ambiguity <= 10% and area in range | 67 | 8/67 | 88.1% | 0.0% |
| ORACLE tolerant prec/rec >= 95/90 | 67 | 12/67 | 82.1% | 0.0% |

## disjoint_all geom1 (192 item-frames)

Ground truth: assignment error.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 13 | 7/13 | 46.2% | 31.3% |
| confidence >= 0.90 | 13 | 7/13 | 46.2% | 31.3% |
| hard signals only | 13 | 7/13 | 46.2% | 31.3% |
| z-order violation > 2% | 13 | 6/13 | 53.8% | 100.0% |
| assignment gate (empty or z-violation) | 13 | 7/13 | 46.2% | 0.0% |
| ambiguity <= 10% and area in range | 13 | 0/13 | 100.0% | 31.3% |
| ORACLE tolerant prec/rec >= 95/90 | 13 | 13/13 | 0.0% | 10.6% |

Ground truth: unusable layer.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 63 | 27/63 | 57.1% | 27.9% |
| confidence >= 0.90 | 63 | 27/63 | 57.1% | 27.9% |
| hard signals only | 63 | 27/63 | 57.1% | 27.9% |
| z-order violation > 2% | 63 | 56/63 | 11.1% | 100.0% |
| assignment gate (empty or z-violation) | 63 | 7/63 | 88.9% | 0.0% |
| ambiguity <= 10% and area in range | 63 | 20/63 | 68.3% | 27.9% |
| ORACLE tolerant prec/rec >= 95/90 | 63 | 32/63 | 49.2% | 0.0% |

## overlap_all exact+palette (976 item-frames)

Ground truth: assignment error.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 80 | 34/80 | 57.5% | 22.4% |
| confidence >= 0.90 | 80 | 34/80 | 57.5% | 24.4% |
| hard signals only | 80 | 31/80 | 61.3% | 20.6% |
| z-order violation > 2% | 80 | 72/80 | 10.0% | 85.0% |
| assignment gate (empty or z-violation) | 80 | 21/80 | 73.8% | 15.0% |
| ambiguity <= 10% and area in range | 80 | 22/80 | 72.5% | 16.0% |
| ORACLE tolerant prec/rec >= 95/90 | 80 | 50/80 | 37.5% | 2.8% |

Ground truth: unusable layer.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 302 | 163/302 | 46.0% | 10.7% |
| confidence >= 0.90 | 302 | 163/302 | 46.0% | 13.4% |
| hard signals only | 302 | 160/302 | 47.0% | 8.3% |
| z-order violation > 2% | 302 | 211/302 | 30.1% | 92.4% |
| assignment gate (empty or z-violation) | 302 | 104/302 | 65.6% | 7.6% |
| ambiguity <= 10% and area in range | 302 | 151/302 | 50.0% | 2.1% |
| ORACLE tolerant prec/rec >= 95/90 | 302 | 72/302 | 76.2% | 0.4% |

## every scope exact (750 item-frames)

Ground truth: assignment error.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 40 | 24/40 | 40.0% | 12.5% |
| confidence >= 0.90 | 40 | 24/40 | 40.0% | 12.5% |
| hard signals only | 40 | 22/40 | 45.0% | 12.4% |
| z-order violation > 2% | 40 | 29/40 | 27.5% | 90.6% |
| assignment gate (empty or z-violation) | 40 | 18/40 | 55.0% | 9.4% |
| ambiguity <= 10% and area in range | 40 | 11/40 | 72.5% | 8.2% |
| ORACLE tolerant prec/rec >= 95/90 | 40 | 30/40 | 25.0% | 1.1% |

Ground truth: unusable layer.

| rule | bad | caught | false pass | false fail |
| --- | ---: | ---: | ---: | ---: |
| confidence >= 0.75 (shipped default) | 119 | 82/119 | 31.1% | 4.9% |
| confidence >= 0.90 | 119 | 82/119 | 31.1% | 4.9% |
| hard signals only | 119 | 80/119 | 32.8% | 4.8% |
| z-order violation > 2% | 119 | 68/119 | 42.9% | 95.7% |
| assignment gate (empty or z-violation) | 119 | 58/119 | 51.3% | 4.3% |
| ambiguity <= 10% and area in range | 119 | 69/119 | 42.0% | 0.0% |
| ORACLE tolerant prec/rec >= 95/90 | 119 | 36/119 | 69.7% | 0.3% |

## Single signals, disjoint_all exact+palette (unusable-layer truth)

- `s_contamination`: bad frames mean 0.000, max 0.000; good frames mean 0.000, max 0.000
- `s_z_violation`: bad frames mean 0.009, max 0.142; good frames mean 0.000, max 0.000
- `s_area_ratio`: bad frames mean 0.717, max 1.262; good frames mean 0.960, max 1.125
- `s_palette_bad`: bad frames mean 0.000, max 0.000; good frames mean 0.000, max 0.000
- `s_jump_bad`: bad frames mean 0.000, max 0.000; good frames mean 0.000, max 0.000
- `s_shape_bad`: bad frames mean 0.000, max 0.000; good frames mean 0.000, max 0.000
- `s_far_bad`: bad frames mean 0.000, max 0.000; good frames mean 0.000, max 0.000
- `s_z_loss`: bad frames mean 0.000, max 0.000; good frames mean 0.000, max 0.000
