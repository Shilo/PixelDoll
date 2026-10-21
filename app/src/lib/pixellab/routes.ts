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
}
export interface CharacterAnimation {
  character_id: string;
  mode?: 'template' | 'skeleton-v3' | 'v3' | 'pixminimax' | 'pro';
  template_animation_id?: string; // mode template, e.g. "walking-8-frames", "breathing-idle"
  action_description?: string;
  animation_name?: string;
  animation_group_id?: string;
  directions?: Direction[];
  frame_count?: number;
  target_palette?: TargetPalette;
  seed?: number;
}
export interface InpaintProFlash {
  image: B64Image;
  mask_image: B64Image; // white = generate
  description: string;
  no_background?: boolean;
  output_method?: 'New layer with changes' | 'Modify current layer, only changes' | 'Modify current layer';
  crop_to_mask?: boolean;
  seed?: number;
}
export interface InpaintV3 {
  description: string;
  inpainting_image: SizedImage;
  mask_image: SizedImage;
  seed?: number;
  no_background?: boolean;
  crop_to_mask?: boolean;
}
export interface EditAnimationV2 { description: string; frames: SizedImage[]; image_size: Size; seed?: number; no_background?: boolean; target_palette?: TargetPalette }
export interface EditImagesV2 {
  method?: 'edit_with_text' | 'edit_with_reference';
  edit_images: { image: B64Image; width: number; height: number }[];
  image_size: Size;
  description?: string;
  reference_image?: { image: B64Image; width: number; height: number };
  seed?: number;
  no_background?: boolean;
}
export interface TransferOutfitV2 { reference_image: SizedImage; frames: SizedImage[]; image_size: Size; seed?: number; no_background?: boolean; additional_instructions?: string; target_palette?: TargetPalette }

export const routes = {
  createCharacterV3: (b: CreateCharacterV3) => post('/create-character-v3', b),
  animateCharacter: (b: CharacterAnimation) => post('/characters/animations', b),
  getCharacter: (id: string) => get(`/characters/${encodeURIComponent(id)}`),
  estimateSkeleton: (image: B64Image) => post('/estimate-skeleton', { image }),
  inpaintProFlash: (b: InpaintProFlash) => post('/inpaint-image-pro-flash', b),
  inpaintV3: (b: InpaintV3) => post('/inpaint-v3', b),
  editAnimationV2: (b: EditAnimationV2) => post('/edit-animation-v2', b),
  editImagesV2: (b: EditImagesV2) => post('/edit-images-v2', b),
  transferOutfitV2: (b: TransferOutfitV2) => post('/transfer-outfit-v2', b),
  balance: () => get('/balance'),
  job: (id: string) => get(`/background-jobs/${encodeURIComponent(id)}`),
  cancelJob: (id: string): Req => ({ method: 'DELETE', path: `/background-jobs/${encodeURIComponent(id)}` }),
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
export interface Keypoint { x: number; y: number; label: string; z_index: number }
export interface SkeletonResponse { keypoints: Keypoint[]; usage?: Usage | null }

export const jobIdsOf = (r: SubmitResponse): string[] => r.background_job_ids ?? (r.background_job_id ? [r.background_job_id] : []);

export type JobImage = { label: string; b64?: string; rgba?: { b64: string; w: number; h: number }; url?: string };
// Result images of a finished job. Prefers inline `images` (animations, edits, inpaint) over `storage_urls` (create-character).
export function jobImages(lr: JobLastResponse | null | undefined): JobImage[] {
  if (!lr) return [];
  const prefix = lr.direction ? `${lr.direction}/` : '';
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
  const ch = jobImages({ storage_urls: { south: 'https://s', east: 'https://e' } });
  console.assert(ch.map((i) => i.label).join() === 'south,east' && ch[1].url === 'https://e', 'jobImages storage_urls');
  console.assert(routes.cancelJob('x/y').path === '/background-jobs/x%2Fy', 'path encoding');
}
