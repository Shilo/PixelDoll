S3/S4 raw skeleton-v3 base clips (walk = template keypoints retargeted, slash = authored keypoints) for S, E, N on S2's
48 px clothed character, from spikes/api/out/s4_items/sk_<dir>.base0-15.png, shifted up 4 px (S2's y+16 pad put the feet
on row 63; the M3 rig keeps a 4 px floor). Used by M3 to test the skeleton-posed item route without new base generations.
keypoints.json: the exact request keypoints (px, y shifted -4 like the frames) of S3's raw skeleton-v3 renders (spikes/api/out/s3_k1/{walk_<dir>_v3tpl,slash_<dir>_v3}_s7.req.json), i.e. the v1.3 ClipSource keypoints.
