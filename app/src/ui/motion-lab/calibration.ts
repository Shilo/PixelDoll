import { sha256 } from '../../lib/image/hash.ts';
import { base64ToBytes } from '../../lib/image/png.ts';
import { hasAll } from '../../lib/rig/poses.ts';
import { DIRECTIONS,type DirectionName,type Keypoint } from '../../lib/rig/rig.ts';
import { MOTION_REVISION } from '../../lib/rig/motion.ts';
import { validateDocument,type MotionDocument } from './model.ts';
export const CALIBRATION_KEY='pixeldoll.motionLab.calibrations';
export interface CalibrationProfile {version:1;revision:typeof MOTION_REVISION;fixtureId:string;direction:DirectionName;referenceSha:string;reference:Keypoint[];elevation:number;azimuth:number}
export function readCalibrations(text:string|null):CalibrationProfile[]{
  if(!text)return[];
  const profiles=JSON.parse(text) as CalibrationProfile[];
  if(!Array.isArray(profiles)||profiles.some(p=>!p||p.version!==1||p.revision!==MOTION_REVISION||typeof p.fixtureId!=='string'||!DIRECTIONS.includes(p.direction)||!/^[a-f0-9]{64}$/.test(p.referenceSha)||!hasAll(p.reference)||!Number.isFinite(p.elevation)||p.elevation<0||p.elevation>80||!Number.isFinite(p.azimuth)))throw new Error('Saved calibrations are invalid or use a different converter. Clear them or import a current motion document.');
  if(new Set(profiles.map(p=>p.fixtureId+'/'+p.direction)).size!==profiles.length)throw new Error('Saved calibrations contain duplicate body views.');
  return profiles;
}
export async function calibrationOf(doc:MotionDocument):Promise<CalibrationProfile>{
  validateDocument(doc);
  return{version:1,revision:MOTION_REVISION,fixtureId:doc.fixture.id,direction:doc.direction,referenceSha:await sha256(base64ToBytes(doc.fixture.references[doc.direction]!.png)),reference:doc.reference.map(p=>({...p})),elevation:doc.elevation,azimuth:doc.azimuth};
}
export async function calibratedDocument(doc:MotionDocument,profiles:CalibrationProfile[]):Promise<MotionDocument>{
  const profile=profiles.find(p=>p.fixtureId===doc.fixture.id&&p.direction===doc.direction);if(!profile)return doc;
  if(profile.referenceSha!==await sha256(base64ToBytes(doc.fixture.references[doc.direction]!.png)))throw new Error('Saved calibration belongs to different reference artwork. Clear it before using this body view.');
  const result=structuredClone(doc);result.reference=profile.reference.map(p=>({...p}));result.fixture.references[doc.direction]!.keypoints=result.reference.map(p=>({...p}));result.elevation=profile.elevation;result.azimuth=profile.azimuth;
  return validateDocument(result);
}
