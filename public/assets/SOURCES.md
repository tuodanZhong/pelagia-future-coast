# Pelagia realism assets

Downloaded 2026-09-05 from the official Poly Haven API/CDN. All seven original files were checked against both the byte size and MD5 supplied by the official API. Combined asset payload: **6,188,499 bytes (6.19 MB)**.

The API response JSON files are provenance records, not assets to ship.

## License

All three assets are CC0. Poly Haven explicitly permits use, modification, commercial use, and redistribution. Attribution is appreciated but not required.

- Official license: https://polyhaven.com/license
- License deed: https://creativecommons.org/publicdomain/zero/1.0/

## Daylight environment

- Asset: **Kloppenheim 05 (Pure Sky)**
- Authors: Greg Zaal (original), Jarod Guest (sky edits)
- Source: https://polyhaven.com/a/kloppenheim_05_puresky
- API: https://api.polyhaven.com/files/kloppenheim_05_puresky
- File: `kloppenheim_05_puresky_1k.hdr` — 1,086,297 bytes
- MD5: `fe0d85219b08932d0467c3752012b749`
- Download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_05_puresky_1k.hdr

This is a midday pure sky, with bright sun and scattered soft clouds. It has no buildings or mountains on the horizon. It is well suited to a maritime architectural scene.

Suggested integration: load using `RGBELoader`, use `EquirectangularReflectionMapping`, and set `scene.environment`. Generate/reuse PMREM once. Keep the current atmospheric sky background if its horizon looks better; the HDRI is especially useful for believable glass highlights and sky reflections. Tune environment intensity around 0.55–0.9 and directional sun intensity around 2.4–3.3 together, then visually check that white facades retain detail. These are starting points, not measured photometric values.

## Pavement

- Asset: **Concrete Pavement**
- Author: Charlotte Baglioni
- Source: https://polyhaven.com/a/concrete_pavement
- API: https://api.polyhaven.com/files/concrete_pavement
- Physical tile extent: **1.8 m** across the complete texture
- `concrete_pavement_diff_1k.jpg` — 926,197 bytes; MD5 `b7a0d071a3406d55a1c3e9a73a06df03`
- `concrete_pavement_nor_gl_1k.jpg` — 1,184,345 bytes; MD5 `025a1d4e910cf3e5b3d63ada43a791d8`
- `concrete_pavement_rough_1k.jpg` — 475,799 bytes; MD5 `e5a0fc9831bad12c7b3779179aa706f7`

Chosen after visual inspection: clean rectangular pavers in a warm gray-beige, with fine aggregate and shallow joints. This is cast concrete rather than cut stone. It avoids the moss, broken edges, and strong discoloration in many stone texture candidates. Best on sidewalks and select plaza insets, alongside brighter architectural paving around the fountain.

Suggested integration: diffuse in sRGB, normal/roughness as non-color textures. Use `RepeatWrapping` and coherent world-scale UVs. Begin with the source scale of 1.8 m, normal scale 0.2–0.35, roughness multiplier 0.9–1.0, metalness 0. Do not stretch one tile over an entire block. If the albedo looks too dark, use the normal and roughness maps over a light neutral material for plaza surfaces while retaining the full PBR set for sidewalks.

## Road asphalt

- Asset: **Asphalt 02**
- Author: Rob Tuytel
- Source: https://polyhaven.com/a/asphalt_02
- API: https://api.polyhaven.com/files/asphalt_02
- Physical tile extent: **3 m** across the complete texture
- `asphalt_02_diff_1k.jpg` — 731,707 bytes; MD5 `fa19772d4817754c3efab708c651f5a8`
- `asphalt_02_nor_gl_1k.jpg` — 1,240,122 bytes; MD5 `338da8de636ea36133170578cac82e8e`
- `asphalt_02_rough_1k.jpg` — 544,032 bytes; MD5 `ec80a2929797c1b3ffc121c4f665585a`

Suggested integration: diffuse in sRGB; OpenGL normal and roughness are non-color. Use `RepeatWrapping` at the real 3 m extent, normal scale 0.15–0.25, roughness multiplier 0.9–1.0, metalness 0. Set material color close to white initially and inspect in the new lighting before darkening, so the base map is not multiplied down to black.

For both texture sets, reuse shared textures and materials and cap anisotropy at 8 (or the device maximum if lower). No displacement geometry is needed for these nearly flat surfaces.
