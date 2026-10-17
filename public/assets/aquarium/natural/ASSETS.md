# 어항 자연 배경 에셋 제작 기록

- 제작일: 2026-10-17
- 제작 방식: 내장 image_gen 도구. 외부 이미지 다운로드·참조 이미지 없이 생성.
- 프로젝트 파일: `public/assets/aquarium/natural/driftwood-v1.webp`, `public/assets/aquarium/natural/plant-v1.webp`
- 원본: 내장 도구가 생성한 RGBA PNG. 표시용 파일은 알파를 보존해 최대 1000px의 WebP(품질 88)로 축소·인코딩.
- 생성 이미지의 제3자 권리·독점성에 대한 별도 검증은 하지 않음.
- `sand-grain.svg`: 코드로 만든 고정 난수 시드 20261017의 정적 입자 타일. 외부 이미지나 SVG 노이즈 필터를 사용하지 않음.

## 유목·바위·후경 군락 최종 프롬프트

```text
Use case: stylized-concept
Asset type: transparent background scenery sprite for a 2.5D freshwater aquarium web application.
Primary request: a cohesive cluster of weathered branching aquarium driftwood, two low charcoal grey river stones and naturally growing narrow-leaf aquatic plants with a little moss.
Style: refined semi-realistic painted natural materials, detailed but restrained, realistic proportions, no cartoon outlines, a little softened for underwater use.
Composition: isolated cluster in a landscape 3:2 canvas, front elevation eye-level view through aquarium glass, all objects rooted to a single low horizontal ground line. Highest stems and wood on the left, wood branches sweeping gently to the right; low stones occupy the base. Keep transparent padding very small. The cluster is designed for the lower left corner of an aquarium leaving center open.
Lighting: soft diffuse light from upper left, muted forest green, olive moss, brown wood and cool slate stone. Fine bark grain and delicate leaf veins, natural diffuse shading.
Constraints: genuinely transparent background, no water, no sky, no sand background, no fish, no tank frame, no text, no bubbles, no UI. No cast shadow rectangle or white matte. Show the whole cluster without cropping.
```

## 작은 수초 최종 프롬프트

```text
Use case: stylized-concept
Asset type: transparent background aquatic plant sprite for a 2.5D freshwater aquarium.
Primary request: one compact low cluster of natural Anubias nana and small narrow leaves attached to a tiny mossy pebble, to place at the foreground edge of an aquarium.
Style: refined semi-realistic painted botanical illustration, soft natural detail, realistic proportions, fine subtle leaf veins, no cartoon outlines.
Composition: isolated single low clump, front elevation through aquarium glass. Leaves spread gently sideways, cluster roughly twice as wide as tall. All stems rooted at a low central base, almost no transparent padding. Show the whole plant.
Lighting: soft diffuse upper-left light. Muted olive and rich forest greens with subdued yellow-green highlights, cool slate stone, matching a semi-realistic planted driftwood aquarium.
Constraints: genuinely transparent background; no water backdrop, sand backdrop, fish, glass, UI, text, bubbles, white matte or rectangular shadow.
```

