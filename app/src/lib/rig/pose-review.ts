import { facingRatios } from './clips.ts';
import { hasAll } from './poses.ts';
import type { DirectionName, Keypoint, Rig } from './rig.ts';

/** These names describe fixed-facing locomotion, unlike turns or authored action clips. */
export const fixedFacingLocomotion = (anim: string): boolean => /^(?:idle|breathing[-_]idle|walk|walking|run|running)(?:[-_]\d+(?:[-_]frames?)?)?$/.test(anim);

export interface PoseReviewScope {
  anims?: readonly string[];
  dirs?: readonly DirectionName[];
  clipDirs?: Readonly<Record<string, readonly DirectionName[]>>;
  cells?: readonly string[];
}

export function assertImportedPoses(rig: Rig, scope: PoseReviewScope = {}): void {
  const issues = importedPoseIssues(rig, scope);
  if (issues.length) throw new Error(`Equipment animation cannot continue: ${issues.join('; ')} No new generation was submitted. Existing artwork was kept.`);
}

/** Review estimates, never repair them: plausible coordinates can still describe the wrong joints. */
export function importedPoseIssues(rig: Rig, scope: PoseReviewScope = {}): string[] {
  const issues: string[] = [];
  const minDimension = Math.min(rig.cell.w, rig.cell.h);
  if (!Number.isFinite(minDimension) || minDimension <= 0) return issues;
  const point = (pose: Keypoint[], label: string) => pose.find(p => p.label === label)!;
  const span = (pose: Keypoint[], joint: string) => point(pose, `LEFT ${joint}`).x - point(pose, `RIGHT ${joint}`).x;
  const distance = (pose: Keypoint[], a: string, b: string) => {
    const p = point(pose, a), q = point(pose, b);
    return Math.hypot((p.x - q.x) * rig.cell.w, (p.y - q.y) * rig.cell.h);
  };
  for (const animation of rig.animations) {
    if (!fixedFacingLocomotion(animation.id) || scope.anims && !scope.anims.includes(animation.id)) continue;
    for (const direction of rig.directions) {
      const dir = direction.id, selected = scope.clipDirs?.[animation.id] ?? scope.dirs;
      if (direction.mirrorOf || selected && !selected.includes(dir) || dir !== 'south' && dir !== 'north') continue;
      const source = animation.sources?.[dir], rest = rig.rest?.[dir]?.keypoints;
      if (source?.route !== 'import' || !hasAll(rest) || !source.keypoints) continue;
      // A narrow projected width cannot establish a side reversal. In particular, side-view occlusion is not an error.
      const shoulderWidth = span(rest!, 'SHOULDER'), hipWidth = span(rest!, 'HIP');
      if (Math.abs(shoulderWidth) * rig.cell.w < Math.max(2, minDimension * 0.04) || Math.abs(hipWidth) * rig.cell.w < Math.max(1.5, minDimension * 0.03)) continue;
      const ratios = facingRatios(dir, rest!, source.keypoints);
      for (const [index, pose] of source.keypoints.entries()) {
        if (scope.cells && !scope.cells.includes(`${animation.id}/${dir}/${index}`)) continue;
        if (!hasAll(pose) || (ratios[index] ?? 0) > -0.5 || span(pose, 'HIP') / hipWidth > -0.5) continue;
        const evidence: string[] = [];
        for (const joint of ['ELBOW', 'EAR']) {
          const labels = [`LEFT ${joint}`, `RIGHT ${joint}`] as const;
          const baseline = distance(rest!, ...labels);
          if (baseline >= Math.max(2, minDimension * 0.04) && distance(pose, ...labels) < Math.min(1, baseline * 0.2)) evidence.push(`both ${joint.toLowerCase()} joints collapse together`);
        }
        for (const side of ['LEFT', 'RIGHT']) {
          const baseline = distance(rest!, `${side} SHOULDER`, `${side} ELBOW`), length = distance(pose, `${side} SHOULDER`, `${side} ELBOW`);
          if (baseline >= Math.max(2, minDimension * 0.04) && length > baseline * 2 && length - baseline > minDimension * 0.04) evidence.push(`${side.toLowerCase()} upper arm exceeds twice its standing length`);
        }
        // Require separate anatomical evidence as well as reversed torso sides. A turn alone proves no bad measurement.
        if (evidence.length) issues.push(`${animation.id}/${dir} frame ${index + 1}: suspicious estimated joints; shoulders and hips reverse sides, and ${evidence.join('; ')}. Review the pose rig before generating equipment.`);
      }
    }
  }
  return issues;
}
