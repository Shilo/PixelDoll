# Benchmark results

Run 2026-11-22 on the final PoC engine (item objects, listing-based ancestry) with Node 25.0.0 on the owner's Windows workstation. Command: `node bench.ts <small|medium|large>` from this folder. Network seconds are a model (see bench.ts), not measurements. CPU ms is in-memory wall time. Heap MB deltas are noisy (garbage collection) and only rough. The [files] initial-backup CPU on the large set is inflated by the simulator's quadratic quota accounting.

## small

```
Workspace "small": 3 characters, 1728 cells (6 items x 4 moves x 4 directions x 6 frames each)
┌─────────┬───────────────────────────────────────────────────────┬──────────┬───────┬─────────┬────────┬─────────┬───────────────┬────────────────┐
│ (index) │ step                                                  │ requests │ MB up │ MB down │ CPU ms │ heap MB │ est s desktop │ est s 4G phone │
├─────────┼───────────────────────────────────────────────────────┼──────────┼───────┼─────────┼────────┼─────────┼───────────────┼────────────────┤
│ 0       │ '[files] initial backup (desktop)'                    │ 1752     │ 1.63  │ 0       │ 34     │ 4       │ 24.7          │ 68.3           │
│ 1       │ '[files] full restore (phone)'                        │ 1757     │ 0     │ 1.63    │ 49     │ 3.7     │ 23.7          │ 66.5           │
│ 2       │ '[files] idle check, nothing changed'                 │ 1        │ 0     │ 0       │ 1      │ 0.6     │ 0             │ 0              │
│ 3       │ '[files] 20 edited cells: desktop push'               │ 25       │ 0.03  │ 0       │ 3      │ -3.4    │ 0.4           │ 1              │
│ 4       │ '[files] 20 edited cells: phone pull'                 │ 28       │ 0     │ 0.03    │ 2      │ 3.4     │ 0.4           │ 1.1            │
│ 5       │ '[files] 10 edited cells: phone push'                 │ 14       │ 0.02  │ 0       │ 3      │ -2.9    │ 0.2           │ 0.6            │
│ 6       │ '[files] 10 edited cells: desktop pull'               │ 18       │ 0     │ 0.02    │ 2      │ 3.2     │ 0.2           │ 0.7            │
│ 7       │ '[files] concurrent edits: phone merge'               │ 21       │ 0.01  │ 0.01    │ 7      │ 0.5     │ 0.3           │ 0.8            │
│ 8       │ '[files] concurrent edits: desktop catch-up'          │ 13       │ 0     │ 0.01    │ 2      │ 3.2     │ 0.2           │ 0.5            │
│ 9       │ '[files] phone back after 30 desktop syncs offline'   │ 29       │ 0.01  │ 0.02    │ 8      │ 1.6     │ 0.4           │ 1.1            │
│ 10      │ '[files] restore after clearing browser data'         │ 1760     │ 0     │ 1.64    │ 48     │ 8.3     │ 23.7          │ 66.7           │
│ 11      │ '[files] duplicate object uploads over the whole run' │ 0        │       │         │        │         │               │                │
│ 12      │ '[files] remote files / MB stored'                    │ 1957     │ 1.93  │         │        │         │               │                │
│ 13      │ '[packs] initial backup (desktop)'                    │ 25       │ 1.77  │ 0       │ 13     │ -5.9    │ 1.7           │ 3.8            │
│ 14      │ '[packs] full restore (phone)'                        │ 31       │ 0     │ 1.97    │ 48     │ 7.3     │ 0.7           │ 2              │
│ 15      │ '[packs] idle check, nothing changed'                 │ 1        │ 0     │ 0       │ 1      │ 0.6     │ 0             │ 0              │
│ 16      │ '[packs] 20 edited cells: desktop push'               │ 6        │ 0.03  │ 0       │ 3      │ -9.9    │ 0.1           │ 0.3            │
│ 17      │ '[packs] 20 edited cells: phone pull'                 │ 9        │ 0     │ 0.05    │ 2      │ 1.6     │ 0.1           │ 0.4            │
│ 18      │ '[packs] 10 edited cells: phone push'                 │ 5        │ 0.02  │ 0       │ 3      │ 3.2     │ 0.1           │ 0.2            │
│ 19      │ '[packs] 10 edited cells: desktop pull'               │ 9        │ 0     │ 0.03    │ 2      │ 1.6     │ 0.1           │ 0.3            │
│ 20      │ '[packs] concurrent edits: phone merge'               │ 13       │ 0.01  │ 0.02    │ 6      │ -1.1    │ 0.2           │ 0.5            │
│ 21      │ '[packs] concurrent edits: desktop catch-up'          │ 9        │ 0     │ 0.02    │ 2      │ 1.6     │ 0.1           │ 0.3            │
│ 22      │ '[packs] phone back after 30 desktop syncs offline'   │ 50       │ 0.01  │ 0.13    │ 10     │ -15.7   │ 0.7           │ 1.9            │
│ 23      │ '[packs] restore after clearing browser data'         │ 78       │ 0     │ 2.19    │ 43     │ 20.3    │ 1.4           │ 3.8            │
│ 24      │ '[packs] duplicate object uploads over the whole run' │ 0        │       │         │        │         │               │                │
│ 25      │ '[packs] remote files / MB stored'                    │ 132      │ 2.08  │         │        │         │               │                │
│ 26      │ '[lww] initial backup (desktop)'                      │ 1733     │ 1.7   │ 0       │ 7      │ 3.8     │ 24.5          │ 67.7           │
│ 27      │ '[lww] full restore (phone)'                          │ 1734     │ 0     │ 1.7     │ 2      │ 2.5     │ 23.4          │ 65.7           │
│ 28      │ '[lww] idle check, nothing changed'                   │ 3        │ 0     │ 0       │ 0      │ 0.5     │ 0             │ 0.1            │
│ 29      │ '[lww] 20 edited cells: desktop push'                 │ 24       │ 0.07  │ 0       │ 1      │ 1.3     │ 0.4           │ 1              │
│ 30      │ '[lww] 20 edited cells: phone pull'                   │ 24       │ 0     │ 0.07    │ 0      │ 0.8     │ 0.3           │ 0.9            │
└─────────┴───────────────────────────────────────────────────────┴──────────┴───────┴─────────┴────────┴─────────┴───────────────┴────────────────┘
```

## medium

```
Workspace "medium": 10 characters, 11520 cells (8 items x 6 moves x 4 directions x 6 frames each)
┌─────────┬───────────────────────────────────────────────────────┬──────────┬───────┬─────────┬────────┬─────────┬───────────────┬────────────────┐
│ (index) │ step                                                  │ requests │ MB up │ MB down │ CPU ms │ heap MB │ est s desktop │ est s 4G phone │
├─────────┼───────────────────────────────────────────────────────┼──────────┼───────┼─────────┼────────┼─────────┼───────────────┼────────────────┤
│ 0       │ '[files] initial backup (desktop)'                    │ 11613    │ 13.1  │ 0       │ 424    │ 16.9    │ 165.3         │ 456.4          │
│ 1       │ '[files] full restore (phone)'                        │ 11635    │ 0     │ 13.1    │ 305    │ 8.7     │ 157.2         │ 441.6          │
│ 2       │ '[files] idle check, nothing changed'                 │ 1        │ 0     │ 0       │ 5      │ 4.7     │ 0             │ 0              │
│ 3       │ '[files] 20 edited cells: desktop push'               │ 25       │ 0.03  │ 0       │ 13     │ 4       │ 0.4           │ 1              │
│ 4       │ '[files] 20 edited cells: phone pull'                 │ 38       │ 0     │ 0.03    │ 8      │ 10.4    │ 0.5           │ 1.4            │
│ 5       │ '[files] 10 edited cells: phone push'                 │ 14       │ 0.02  │ 0       │ 9      │ 9.4     │ 0.2           │ 0.6            │
│ 6       │ '[files] 10 edited cells: desktop pull'               │ 28       │ 0     │ 0.02    │ 10     │ -14.9   │ 0.4           │ 1.1            │
│ 7       │ '[files] concurrent edits: phone merge'               │ 31       │ 0.01  │ 0.01    │ 20     │ 3.8     │ 0.4           │ 1.2            │
│ 8       │ '[files] concurrent edits: desktop catch-up'          │ 23       │ 0     │ 0.01    │ 9      │ 10.3    │ 0.3           │ 0.9            │
│ 9       │ '[files] phone back after 30 desktop syncs offline'   │ 81       │ 0.01  │ 0.1     │ 32     │ 2.4     │ 1.1           │ 3.1            │
│ 10      │ '[files] restore after clearing browser data'         │ 11638    │ 0     │ 13.11   │ 312    │ 30.6    │ 157.3         │ 441.7          │
│ 11      │ '[files] duplicate object uploads over the whole run' │ 0        │       │         │        │         │               │                │
│ 12      │ '[files] remote files / MB stored'                    │ 11818    │ 13.46 │         │        │         │               │                │
│ 13      │ '[packs] initial backup (desktop)'                    │ 97       │ 14.04 │ 0       │ 75     │ 12.5    │ 12.5          │ 26.1           │
│ 14      │ '[packs] full restore (phone)'                        │ 115      │ 0     │ 15.23   │ 300    │ 20.2    │ 4             │ 10.4           │
│ 15      │ '[packs] idle check, nothing changed'                 │ 1        │ 0     │ 0       │ 5      │ 4       │ 0             │ 0              │
│ 16      │ '[packs] 20 edited cells: desktop push'               │ 6        │ 0.03  │ 0       │ 9      │ 8.7     │ 0.1           │ 0.3            │
│ 17      │ '[packs] 20 edited cells: phone pull'                 │ 9        │ 0     │ 0.05    │ 6      │ 5.7     │ 0.1           │ 0.4            │
│ 18      │ '[packs] 10 edited cells: phone push'                 │ 5        │ 0.02  │ 0       │ 8      │ -42.3   │ 0.1           │ 0.2            │
│ 19      │ '[packs] 10 edited cells: desktop pull'               │ 9        │ 0     │ 0.03    │ 7      │ 5.6     │ 0.1           │ 0.4            │
│ 20      │ '[packs] concurrent edits: phone merge'               │ 13       │ 0.01  │ 0.02    │ 13     │ 28      │ 0.2           │ 0.5            │
│ 21      │ '[packs] concurrent edits: desktop catch-up'          │ 9        │ 0     │ 0.02    │ 7      │ 5.5     │ 0.1           │ 0.3            │
│ 22      │ '[packs] phone back after 30 desktop syncs offline'   │ 78       │ 0.01  │ 0.21    │ 21     │ -9.8    │ 1.1           │ 3              │
│ 23      │ '[packs] restore after clearing browser data'         │ 169      │ 0     │ 15.48   │ 276    │ -33.7   │ 4.7           │ 12.5           │
│ 24      │ '[packs] duplicate object uploads over the whole run' │ 0        │       │         │        │         │               │                │
│ 25      │ '[packs] remote files / MB stored'                    │ 204      │ 14.41 │         │        │         │               │                │
│ 26      │ '[lww] initial backup (desktop)'                      │ 11532    │ 13.56 │ 0       │ 284    │ 25.1    │ 164.6         │ 454.1          │
│ 27      │ '[lww] full restore (phone)'                          │ 11543    │ 0     │ 13.56   │ 14     │ -44.2   │ 156.1         │ 438.3          │
│ 28      │ '[lww] idle check, nothing changed'                   │ 13       │ 0     │ 0       │ 1      │ 3.6     │ 0.2           │ 0.5            │
│ 29      │ '[lww] 20 edited cells: desktop push'                 │ 34       │ 0.11  │ 0       │ 4      │ 5       │ 0.5           │ 1.5            │
│ 30      │ '[lww] 20 edited cells: phone pull'                   │ 34       │ 0     │ 0.11    │ 2      │ 4       │ 0.5           │ 1.3            │
└─────────┴───────────────────────────────────────────────────────┴──────────┴───────┴─────────┴────────┴─────────┴───────────────┴────────────────┘
```

## large

```
Workspace "large": 20 characters, 76800 cells (10 items x 8 moves x 8 directions x 6 frames each)
┌─────────┬───────────────────────────────────────────────────────┬──────────┬───────┬─────────┬────────┬─────────┬───────────────┬────────────────┐
│ (index) │ step                                                  │ requests │ MB up │ MB down │ CPU ms │ heap MB │ est s desktop │ est s 4G phone │
├─────────┼───────────────────────────────────────────────────────┼──────────┼───────┼─────────┼────────┼─────────┼───────────────┼────────────────┤
│ 0       │ '[files] initial backup (desktop)'                    │ 77023    │ 87.4  │ 0       │ 18307  │ 25.5    │ 1096.9        │ 3028.2         │
│ 1       │ '[files] full restore (phone)'                        │ 77120    │ 0     │ 87.4    │ 2177   │ 73.8    │ 1042.3        │ 2927           │
│ 2       │ '[files] idle check, nothing changed'                 │ 1        │ 0     │ 0       │ 40     │ -4.2    │ 0             │ 0              │
│ 3       │ '[files] 20 edited cells: desktop push'               │ 25       │ 0.04  │ 0       │ 71     │ 15.8    │ 0.4           │ 1              │
│ 4       │ '[files] 20 edited cells: phone pull'                 │ 103      │ 0     │ 0.04    │ 64     │ 10.5    │ 1.4           │ 3.9            │
│ 5       │ '[files] 10 edited cells: phone push'                 │ 14       │ 0.03  │ 0       │ 61     │ -2.9    │ 0.2           │ 0.6            │
│ 6       │ '[files] 10 edited cells: desktop pull'               │ 93       │ 0     │ 0.03    │ 59     │ 14.4    │ 1.2           │ 3.5            │
│ 7       │ '[files] concurrent edits: phone merge'               │ 96       │ 0.02  │ 0.02    │ 90     │ 12.1    │ 1.3           │ 3.6            │
│ 8       │ '[files] concurrent edits: desktop catch-up'          │ 88       │ 0     │ 0.02    │ 63     │ 11.4    │ 1.2           │ 3.3            │
│ 9       │ '[files] phone back after 30 desktop syncs offline'   │ 206      │ 0.02  │ 0.38    │ 141    │ 50.2    │ 2.8           │ 7.9            │
│ 10      │ '[files] restore after clearing browser data'         │ 77123    │ 0     │ 87.42   │ 1977   │ 42      │ 1042.3        │ 2927.1         │
│ 11      │ '[files] duplicate object uploads over the whole run' │ 0        │       │         │        │         │               │                │
│ 12      │ '[files] remote files / MB stored'                    │ 77228    │ 88.09 │         │        │         │               │                │
│ 13      │ '[packs] initial backup (desktop)'                    │ 244      │ 93.66 │ 0       │ 440    │ 7.1     │ 78.2          │ 159            │
│ 14      │ '[packs] full restore (phone)'                        │ 306      │ 0     │ 101.25  │ 1952   │ 68      │ 20.3          │ 52             │
│ 15      │ '[packs] idle check, nothing changed'                 │ 1        │ 0     │ 0       │ 36     │ -33.9   │ 0             │ 0              │
│ 16      │ '[packs] 20 edited cells: desktop push'               │ 6        │ 0.04  │ 0       │ 47     │ 36.8    │ 0.1           │ 0.3            │
│ 17      │ '[packs] 20 edited cells: phone pull'                 │ 9        │ 0     │ 0.06    │ 39     │ -26.1   │ 0.1           │ 0.4            │
│ 18      │ '[packs] 10 edited cells: phone push'                 │ 5        │ 0.03  │ 0       │ 41     │ -2.9    │ 0.1           │ 0.2            │
│ 19      │ '[packs] 10 edited cells: desktop pull'               │ 9        │ 0     │ 0.04    │ 42     │ 27.3    │ 0.1           │ 0.4            │
│ 20      │ '[packs] concurrent edits: phone merge'               │ 13       │ 0.02  │ 0.03    │ 67     │ -5.5    │ 0.2           │ 0.5            │
│ 21      │ '[packs] concurrent edits: desktop catch-up'          │ 9        │ 0     │ 0.03    │ 41     │ 27.2    │ 0.1           │ 0.4            │
│ 22      │ '[packs] phone back after 30 desktop syncs offline'   │ 118      │ 0.02  │ 0.49    │ 168    │ 37      │ 1.7           │ 4.7            │
│ 23      │ '[packs] restore after clearing browser data'         │ 370      │ 0     │ 101.54  │ 4063   │ -17.6   │ 21.2          │ 54.5           │
│ 24      │ '[packs] duplicate object uploads over the whole run' │ 0        │       │         │        │         │               │                │
│ 25      │ '[packs] remote files / MB stored'                    │ 351      │ 94.36 │         │        │         │               │                │
│ 26      │ '[lww] initial backup (desktop)'                      │ 76822    │ 90.42 │ 0       │ 37526  │ 52.5    │ 1096.6        │ 3025.5         │
│ 27      │ '[lww] full restore (phone)'                          │ 76898    │ 0     │ 90.42   │ 93     │ -14     │ 1039.8        │ 2919.8         │
│ 28      │ '[lww] idle check, nothing changed'                   │ 78       │ 0     │ 0       │ 8      │ 24.8    │ 1             │ 2.9            │
│ 29      │ '[lww] 20 edited cells: desktop push'                 │ 99       │ 0.32  │ 0       │ 32     │ 28.9    │ 1.6           │ 4.2            │
│ 30      │ '[lww] 20 edited cells: phone pull'                   │ 99       │ 0     │ 0.32    │ 15     │ 25.7    │ 1.4           │ 3.8            │
└─────────┴───────────────────────────────────────────────────────┴──────────┴───────┴─────────┴────────┴─────────┴───────────────┴────────────────┘
```
