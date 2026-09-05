# Realistic, rigged Pelagia citizens

## Ready to integrate

| GLB | Character | Bytes | Triangles | Skin joints | Clips |
|---|---|---:|---:|---:|---|
| `pelagia-citizen.glb` | Male Adult 04 — dark jacket, blue T-shirt, khaki trousers, trainers, textured face and beard | 4,431,956 | 8,684 | 80 | Idle, Walk, Run |
| `pelagia-citizen-female.glb` | Female Adult 01 — pink shirt, denim jeans, ponytail, textured face | 4,537,540 | 8,732 | 80 | Idle, Walk, Run |

Both use the original Microsoft Rocketbox rig (81 bone nodes, 80 weighted skin joints). Both are normal GLB 2.0 files with embedded geometry, five embedded textures, three materials, and three skeletal animation clips. No Draco or KTX decoder is required. All texture resources have been resized to 1K.

Both face **+Z**, use meters at their scene root, and have their origin at ground level. Male standing height is approximately **1.863 m** and female standing height **1.741 m**. Do not apply another 0.01 scale after loading. `Bip01` is the animation root. Animation X/Z root translation was removed for in-place movement; vertical hip motion remains intact. The female uses the female source clips, not retargeted male motion.

Use `SkeletonUtils.clone(gltf.scene)` for NPC instances. Each instance needs its own `AnimationMixer`. Model mesh, materials, and textures can remain shared. For hair, the GLB uses alpha blending and double-sided cards for softer edges. If necessary when casting shadows, set the opacity material's `alphaTest` to approximately 0.08; `depthWrite` should remain false. Avoid strong avatar self-shadowing at low shadow-map resolution.

## Source and license

Source repository: https://github.com/microsoft/Microsoft-Rocketbox

The repository explicitly states that the avatar library was updated to **MIT** in November/December 2020. The earlier March 2020 Microsoft announcement describes the superseded research/academic restriction. The current repository license governs these downloaded files.

Current license: https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE.md

**Distribute `LICENSE-Rocketbox.md` with the models.** This file preserves the MIT text and `Copyright (c) 2020 Microsoft` notice. A copyright notice is also included in each GLB's asset metadata.

Model source folders:

- https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Male_Adult_04
- https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_01

Animation source folder:

- https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Animations

Selected animation FBXs:

- `all_animations_max_motextr_static/m_idle_breathe_01.max.fbx`
- `all_animations_max_motextr_xy/m_walk_neutral.max.fbx`
- `all_animations_max_motextr_xy/m_run_neutral.max.fbx`
- `all_animations_max_motextr_static/f_idle_breathe_01.max.fbx`
- `all_animations_max_motextr_xy/f_walk_neutral.max.fbx`
- `all_animations_max_motextr_xy/f_run_neutral.max.fbx`

## Verification

All **20 original FBX/TGA files** were checked against their exact GitHub tree blob SHA-1 and byte length. `verified-downloads.json` records each source path, git blob hash, download size, and SHA-256.

`node work/character-assets/verify.mjs` validates:

- GLB headers, byte lengths, and all buffer-view extents.
- Three materials, five images, three clips, and the 80 weighted joints.
- Actual `GLTFLoader` import and `SkeletonUtils` clone compatibility.
- In-place root translation and finite, anatomically plausible deformed bounds across 24 sampled animation frames.

The geometry-only Node check strips texture references to avoid requiring a browser image decoder; the complete textured GLBs were additionally rendered with `GLTFLoader` in Chrome. Both male and female idle/walk/run poses were visually inspected. Male close-up was checked for face placement, beard, collar, jacket seams, zipper, and hair transparency. No inverted UVs, missing textures, or exploded skinning were observed. Native browser screenshots appeared in the tool transcript; the original reference previews are also saved as `Male_Adult_04.png` and `Female_Adult_01.png`.

Final output hashes:

- Male: `1e8f385f103b38c83b66bee709a61e2036442c0dbda7fc94f4f0a46b8f1fd232`
- Female: `e0a6ee1784d6b1362fd2b833b6d16c74a045e55a98112007f9666bec7ca7cc48`

## Rebuild

`convert.mjs` imports the original FBX through Three.js, preserves the original skinning and geometry, changes legacy Phong materials to PBR, embeds compressed textures with the required vertical image flip, and adds the matching in-place animation clips. Ambient lights in the source FBX are removed.

- Male: `node work/character-assets/convert.mjs`
- Female: `node work/character-assets/convert.mjs --female`

`preview.html` is a standalone local inspection stage with idle/walk/run, front/back, and close-up controls. Add `?female` to inspect the second model. It imports the installed Three.js modules from the existing city checkout but does not modify that checkout.

The downloaded raw TGA resources are large uncompressed source assets; **only the two GLBs and MIT license need to ship**.
