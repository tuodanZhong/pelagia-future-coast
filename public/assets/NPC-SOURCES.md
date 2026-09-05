# Additional distinct citizens

Six additional characters, each using a distinct official Microsoft Rocketbox source mesh, face, hairstyle, clothing texture, and rig. All files are ready-to-load GLB 2.0 with embedded textures, PBR materials, and Idle/Walk/Run animation clips. Total payload is 8.29 MB.

| File | Official source character | Gender / game category | Height m | Payload | Suggested walk speed | Mixer Walk timeScale |
|---|---|---|---:|---:|---:|---:|
| npc-senior-male.glb | Male_Adult_03 | male / senior | 1.807 | 1.34 MB | 0.98 m/s | 0.70 |
| npc-senior-female.glb | Business_Female_02 | female / senior | 1.729 | 1.77 MB | 0.87 m/s | 0.67 |
| npc-boy.glb | Male_Child_01 | male / child | 1.433 | 1.08 MB | 1.13 m/s | 1.02 |
| npc-girl.glb | Female_Child_01 | female / child | 1.433 | 1.13 MB | 1.02 m/s | 0.96 |
| npc-casual-male.glb | Male_Adult_06 | male / adult | 1.831 | 1.51 MB | 1.40 m/s | 1.00 |
| npc-casual-female.glb | Female_Adult_08 | female / adult | 1.735 | 1.47 MB | 1.22 m/s | 0.94 |

The game age labels are visual casting categories, not verified biological ages. Rocketbox has no separate Elderly directory. Male_Adult_03 has a visibly older face and gray hair. Business_Female_02 is a mature-looking woman with glasses and a shorter gray-blond hairstyle; it is the closest suitable readily available female candidate, not an officially age-labeled elderly scan. The boy and girl are original models from the official Children directory, not scaled adult meshes.

## Integration

- All face +Z and already use meters. Place at ground level with scale 1.
- Clips are named Idle / Walk / Run. For child NPCs, use the clips bundled with their own GLB rather than replacing them with the adult tracks.
- Source child rigs use Bip02. Export normalizes these node names to Bip01 and preserves every child's original local bone position and geometry.
- Animation retargeting copies rotational motion, drops bone translation channels that would overwrite the child's proportions, and rescales root Y motion to the child's original hip height. XZ root motion is removed for code-driven movement.
- Suggested world speeds above were derived from source stride distances, clip durations, each character's hip-height ratio, and the supplied timeScale. Use these together to reduce foot sliding.
- Meshes are indexed without deleting triangles. Diffuse maps are 768 px; normal and transparent hair maps are 512 px. Each NPC typically needs 2–4 material draws.
- Clone with SkeletonUtils.clone. Keep shared textures/materials and separate AnimationMixers. Transparent hair can use alphaTest 0.08 and depthWrite false.

## Verification

All 35 original FBX/TGA downloads passed both official GitHub blob-SHA1 and size verification (`npc-verified-downloads.json`). `verify-npcs.mjs` passed GLB structure, GLTFLoader loading, SkeletonUtils cloning, and 72 sampled animation frames with finite plausible deformed bounds and in-place root motion (`npc-verified-glbs.json`).

All six were also rendered in Chrome on the independent `npc-preview.html` stage. Idle, Walk, and Run were visually checked together; children preserve their shorter stature during animation. Boy close-up shows the child-specific face and clothing. The woman with glasses was checked in close-up for correct hair and glasses transparency. No exploded skinning, missing textures, or reversed UVs was observed.

## Source and license

Official repository: https://github.com/microsoft/Microsoft-Rocketbox

All source files are covered by its current MIT license. Preserve and distribute `LICENSE-Rocketbox.md` with the exported GLBs. The metadata inside each GLB includes Microsoft's copyright and exact source-character name.

Full per-model hashes, height, source animation speeds, clip duration, geometry counts, and final bytes are in `npc-manifest.json`. The exact source paths are in `npc-models.json` and the download-verification record. Rebuild with `node work/character-assets/convert-npcs.mjs`; validate with `node work/character-assets/verify-npcs.mjs`.

Only the six `npc-*.glb` files, `npc-manifest.json` if useful, and the MIT notice need to ship. Raw TGA files and tooling are intermediate assets.
