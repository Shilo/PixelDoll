// Typed request builders for the PixelLab v2 routes PixelDoll uses. Field names from docs/research/pixellab/pixellab-openapi-v2.json.
// Only the fields we use are typed; the API accepts more.

export type Direction = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
export interface B64Image { type: 'base64'; base64: string; format?: 'png' }
export interface Size { width: number; height: number }
export interface SizedImage { image: B64Image; size: Size }
export interface TargetPalette { colors?: string[]; max_colors?: number }
export interface Usage { type: 'usd' | 'generations'; usd?: number | null; generations?: number | null }

export interface Req { method: 'GET' | 'POST' | 'DELETE'; path: string; body?: unknown }
const post = (path: string, body: unknown): Req => ({ method: 'POST', path, body });
const get = (path: string): Req => ({ method: 'GET', path });

export const png = (base64: string): B64Image => ({ type: 'base64', base64, format: 'png' });
export const EDIT_MIN_FRAMES = 2; // edit-animation-v2 schema: 2–16 input frames.

// ---- requests ----
export interface CreateCharacterV3 {
  description: string;
  image_size?: Size; // 32-256
  n_directions?: 4 | 8; // default 8; 4 requires reference_image (422 otherwise, verified live)
  view?: 'low top-down' | 'high top-down' | 'side';
  template_id?: string; // default "mannequin"
  seed?: number;
  no_background?: boolean;
  outline?: string;
  detail?: string;
  reference_image?: B64Image; // import mode: south view; with every other direction in direction_images = 0.25 gen, pixel-exact (S3)
  direction_images?: Partial<Record<Direction, B64Image>>;
}
export interface EnhanceCharacterV3Prompt {
  description: string;
  image_size: Size;
  view?: CreateCharacterV3['view'];
}
export interface EnhancedCharacterV3Prompt { enhanced_prompt: string; usage?: Usage | null }
export interface CharacterAnimation {
  character_id: string;
  mode?: BaseAnimMode; // newer models only: legacy template/pro modes do not type-check (D8, user rule 2026-10-21)
  template_animation_id?: string; // mode skeleton-v3, e.g. "walking-8-frames", "breathing-idle"
  action_description?: string;
  animation_name?: string;
  animation_group_id?: string;
  directions?: Direction[];
  frame_count?: number;
  keep_first_frame?: boolean; // v3/pixminimax: false = exactly frame_count frames
  target_palette?: TargetPalette;
  seed?: number;
}

// Base animations with the newer models only: skeleton-v3 (template poses), v3 / pixminimax (action text).
export type BaseAnimMode = 'skeleton-v3' | 'v3' | 'pixminimax';
export interface BaseAnim { name: string; template: string; action: string; frames: number }
export const BASE_ANIMS: BaseAnim[] = [
  { name: 'idle', template: 'breathing-idle', action: 'breathing idle, standing still', frames: 4 },
  { name: 'walk', template: 'walking-8-frames', action: 'walking', frames: 8 },
];
export const baseAnimation = (mode: BaseAnimMode, character_id: string, a: BaseAnim, directions: Direction[], seed?: number): CharacterAnimation =>
  mode === 'skeleton-v3'
    ? { character_id, mode, template_animation_id: a.template, animation_name: a.name, directions, seed }
    : { character_id, mode, action_description: a.action, frame_count: a.frames, keep_first_frame: false, animation_name: a.name, directions, seed };
/** Pro inpaint (B14 grid fallback, S4/S5): white mask = generate, black = keep; result in last_response.image. */
export interface InpaintV3 { description: string; inpainting_image: SizedImage; mask_image: SizedImage; seed?: number; no_background?: boolean }
/** edit-animation-v2 frames per call by image_size (all frames share one grid; OpenAPI): ≤64 px 16, 65–80 px 9, 81–256 px 4. */
export const editFrameCap = (px: number) => (px <= 64 ? 16 : px <= 80 ? 9 : 4);
export interface EditAnimationV2 { description: string; frames: SizedImage[]; image_size: Size; seed?: number; no_background?: boolean; target_palette?: TargetPalette }
/** Raw skeleton-v3: pose `first_frame` (in pose first_frame_keypoints) into one frame per keypoints entry (3-15), same size. */
export interface ApiKeypoint { label: string; x: number; y: number; z_index?: number } // x/y = 0-1 fractions of the image
export interface AnimateSkeletonV3 {
  description: string; // what the character looks like (noun phrase)
  action: string;
  direction: Direction;
  view?: 'low top-down' | 'high top-down' | 'side';
  first_frame: B64Image;
  first_frame_keypoints: ApiKeypoint[];
  keypoints: ApiKeypoint[][];
  template_id?: string;
  seed?: number;
  no_background?: boolean;
}

export const routes = {
  createCharacterV3: (b: CreateCharacterV3) => post('/create-character-v3', b),
  enhanceCharacterV3Prompt: (b: EnhanceCharacterV3Prompt) => post('/enhance-character-v3-prompt', b),
  animateCharacter: (b: CharacterAnimation) => post('/characters/animations', b),
  getCharacter: (id: string) => get(`/characters/${encodeURIComponent(id)}`),
  estimateSkeleton: (image: B64Image) => post('/estimate-skeleton', { image }),
  editAnimationV2: (b: EditAnimationV2) => post('/edit-animation-v2', b),
  animateWithSkeletonV3: (b: AnimateSkeletonV3) => post('/animate-with-skeleton-v3', b),
  inpaintV3: (b: InpaintV3) => post('/inpaint-v3', b),
};

// ---- responses ----
// Async routes return background_job_id (or background_job_ids for /characters/animations: one per direction).
export interface SubmitResponse {
  background_job_id?: string;
  background_job_ids?: string[];
  character_id?: string;
  animation_group_id?: string;
  directions?: Direction[];
  usage?: Usage | null;
  estimated_generations?: number;
}
export interface Job {
  id: string;
  status: string; // "processing" | "completed" | "failed" | ... (open-ended)
  created_at: string;
  usage?: Usage | null;
  last_response?: JobLastResponse | null;
}
export interface JobLastResponse {
  status?: string;
  code?: number;
  error?: string;
  progress?: number;
  queue_position?: number;
  estimated_wait_seconds?: number;
  direction?: Direction;
  character_id?: string;
  images?: { type: 'base64' | 'rgba_bytes'; base64: string; width?: number; height?: number }[];
  storage_urls?: Record<string, string | string[] | null>; // character: {dir: url}; animation: {frames: [url]}
  paste_x?: number;
  paste_y?: number;
  [k: string]: unknown;
}
export interface Balance {
  credits: { type: 'usd'; usd: number };
  subscription: { type: 'generations'; status: string; plan?: string | null; generations: number; total: number };
}

export const jobIdsOf = (r: SubmitResponse): string[] => r.background_job_ids ?? (r.background_job_id ? [r.background_job_id] : []);

export type JobImage = { label: string; b64?: string; rgba?: { b64: string; w: number; h: number }; url?: string };
// Result images of a finished job. Prefers inline `images` (animations, edits, inpaint) over `storage_urls` (create-character).
export function jobImages(lr: JobLastResponse | null | undefined): JobImage[] {
  if (!lr) return [];
  const prefix = lr.direction ? `${lr.direction}/` : '';
  const one = lr.image as { base64?: string } | undefined; // inpaint-v3: one image (S5 live)
  if (!lr.images?.length && one?.base64) return [{ label: prefix + '0', b64: one.base64 }];
  if (lr.images?.length)
    return lr.images.map((im, i) =>
      im.type === 'rgba_bytes' ? { label: prefix + i, rgba: { b64: im.base64, w: im.width ?? 0, h: im.height ?? 0 } } : { label: prefix + i, b64: im.base64 },
    );
  const out: JobImage[] = [];
  for (const [k, v] of Object.entries(lr.storage_urls ?? {})) {
    if (typeof v === 'string') out.push({ label: k, url: v });
    else if (Array.isArray(v)) v.forEach((u, i) => out.push({ label: prefix + i, url: u }));
  }
  return out;
}

export function selfTest() {
  console.assert(jobIdsOf({ background_job_ids: ['a', 'b'] }).join() === 'a,b' && jobIdsOf({ background_job_id: 'c' }).join() === 'c' && jobIdsOf({}).length === 0, 'jobIdsOf');
  const anim = jobImages({ direction: 'east', images: [{ type: 'base64', base64: 'x' }], storage_urls: { frames: ['u0'] } });
  console.assert(anim.length === 1 && anim[0].label === 'east/0' && anim[0].b64 === 'x', 'jobImages prefers inline images');
  console.assert(jobImages({ image: { type: 'base64', base64: 'g' } })[0].b64 === 'g', 'jobImages: inpaint-v3 single image');
  const ch = jobImages({ storage_urls: { south: 'https://s', east: 'https://e' } });
  console.assert(ch.map((i) => i.label).join() === 'south,east' && ch[1].url === 'https://e', 'jobImages storage_urls');
  console.assert(baseAnimation('skeleton-v3', 'c', BASE_ANIMS[1], ['south']).template_animation_id === 'walking-8-frames' && baseAnimation('v3', 'c', BASE_ANIMS[0], ['south']).frame_count === 4, 'baseAnimation');
  console.assert(editFrameCap(64) === 16 && editFrameCap(80) === 9 && editFrameCap(96) === 4, 'editFrameCap');
  console.assert(routes.getCharacter('x/y').path === '/characters/x%2Fy', 'path encoding');
}
