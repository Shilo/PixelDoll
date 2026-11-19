# PixelLab Character Creator states and animations

## Character Creator workflow

A character can have several named **states**. Each is a selectable version of the character with its own directional still images and animation list. An edit can change the pose or the character's appearance. The gallery groups related states under one character. Selecting a state switches both the rotation preview and the animations shown beneath it. State names are separate from the shared character name, and a newly created state starts with an empty animation list.

- **Create a state.** Open the reference state, choose **New state**, and describe the change. The same edit applies across facings. The form offers palette controls and optional extra canvas space. The new tile shows generation progress and becomes selectable when its rotations are ready. Duplication copies the rotations without generation, and the public duplicate route says it leaves the animation list empty.
- **Recover a failed state.** The failed tile offers retry and dismissal. Retry can reopen the original edit with the original reference when it remains available. A completed sibling may be offered if the original is unavailable.
- **Import artwork.** Character creation has a rotation-import workflow. In the full-import flow, supplying all required facings imports without generation, while supplying some can generate the missing facings. Dropping a compatible rotation GIF onto an existing state can replace its rotations. The review found no dedicated action to import a new sibling directly into an existing group.
- **Create and preview animation.** An animation belongs to the open state. Generation and preview are tracked per direction. Where custom start and end frames are supported, the open state's matching still is the default start. A picked frame can come from a sibling state or another animation, or the user can supply an image. A compatible GIF can add or replace a direction on an existing animation card.
- **Remove artwork.** Deleting a state removes its rotations and its own animations. Other states in the group remain available. Removing a state from a group makes it a standalone character. Animation removal can target a single direction or an entire clip. The website distinguishes removing a finished asset from dismissing a failed generation.

Three independent source reviews covered the user-visible workflow, job and failure behavior, and edge cases. The inspected UI can display characters with two, four or eight directions. That observation does not establish that the public state-creation endpoint accepts two directions. The review did not run the site or verify rollout, mobile rendering, reload behavior, billing, or timing against a live account.

## Public PixelLab API

The public OpenAPI document read on November 18, 2026 reports version `dev`. The following describes its documented contract. [PixelLab OpenAPI](https://api.pixellab.ai/v2/openapi.json)

| Operation           | Documented lifecycle                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create a state      | `POST /create-character-state` takes a source `character_id` and an `edit_description`. It returns the new character ID and a background job ID. The new state joins the source group. The endpoint documents four- or eight-direction edits.                      |
| Get status and art  | Poll `GET /background-jobs/{job_id}`. Character detail at `GET /characters/{character_id}` exposes rotations, direction metadata, state name, group ID, skeletons and animations. Job cancellation is a separate operation and running jobs can incur usage.       |
| Generate animations | The public API documents `POST /characters/animations` and `POST /animate-character`. The selected character ID determines the provider-side owner. Start/end overrides depend on the route and mode. A job ID and an animation group ID serve different purposes. |
| Import an export    | `GET /characters/{character_id}/zip` can export the group. The optional `states` query selects a subset of state IDs from that group.                                                                                                                              |
| Remove an asset     | `DELETE /characters/{character_id}` removes the named provider state with its rotations and animations. Separate animation deletion routes address an animation group or direction.                                                                                |

The public contract describes a provider resource and its lifecycle. The website can offer additional workflows, including in-place GIF replacement. The review made no authenticated requests, submitted no jobs and measured no prices.

## PixelDoll today

- **Move source.** The default standing artwork is already a one-cell clip named **Default**. Its source images and joints are tracked separately as the rig's standing references. Add a move uses those direction-specific pixels and joints for the final skeleton render. Authored motions build targets from those joints. Managed motion requests use the connected PixelLab character ID to obtain motion before the final render.
- **State import.** PixelDoll already understands grouped PixelLab ZIPs. It selects one state's rotations as **Default** and can also import compatible finished moves from selected sibling states. Sibling rotations do not become selectable poses in the project. The grouped ZIP import does not save the selected provider ID as its connected character. Rig Setup registers the imported rotations and saves the ID returned by that registration.
- **Static Ride.** This branch authors a one-cell Ride through the existing clip and equipment model. A static Ride serves a gameplay action and may be played by the mounted preview. It does not become the character's standing reference.

[Move generation](../../app/src/studio/create.ts) · [Rig and Default](../../app/src/lib/rig/rig.ts) · [Character import](../../app/src/lib/store/import.ts) · [Runtime contract](../architecture/javascript-runtime.md) · [Static Ride study](2026-11-17-static-rider-fitting/static-move-authoring.md)
