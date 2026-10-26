# Motion amount per clip: px that changed vs the input frame (max) and between consecutive frames (mean).
# Usage: python -I x28/motion.py "<glob of frame 0 files>"
import glob, os, sys
from PIL import Image
def px(p): return list(Image.open(p).convert('RGBA').get_flattened_data())
def diff(a, b): return sum(1 for p, q in zip(a, b) if (p[3] or q[3]) and abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2]) + abs(p[3] - q[3]) > 30)
for f0 in sorted(glob.glob(sys.argv[1])):
    f = f0[:-6]
    fr = [px(f'{f}.{i}.png') for i in range(99) if os.path.exists(f'{f}.{i}.png')]
    ch = [diff(x, fr[0]) for x in fr[1:]]
    st = [diff(fr[i], fr[i + 1]) for i in range(1, len(fr) - 1)]
    print(os.path.basename(f).ljust(24), 'changed vs input max', str(max(ch)).rjust(4), ' step mean', round(sum(st) / len(st)))
