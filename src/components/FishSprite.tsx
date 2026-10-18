import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { advanceSwimMotion, createSwimMotion, displacement, vertexWeight } from '../lib/fishRig';
import type { FishRig } from '../lib/fishRig';

// A single connected texture mesh: no sliced images or seams at fin roots.
export default function FishSprite({ src, rig, fast = false, activityRef, filter = 'none', onError }: {
  src: string; rig: FishRig | null; fast?: boolean; activityRef?: RefObject<number>; filter?: string; onError?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const fastRef = useRef(fast);
  fastRef.current = fast;
  const rigRef = useRef(rig);
  rigRef.current = rig;
  const swimRef = useRef(activityRef);
  swimRef.current = activityRef;
  const sourceWidth = rig?.sourceSize[0], sourceHeight = rig?.sourceSize[1];

  useEffect(() => {
    setReady(false);
    if (!sourceWidth || !sourceHeight || !hostRef.current) return;
    const host = hostRef.current;
    let cancelled = false, frame = 0;
    let cleanup = () => {};
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    // Lazy Three import keeps settings/login free of the renderer cost.
    void import('three').then(THREE => {
      if (cancelled) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
      catch { return; }
      const aspect = sourceWidth / sourceHeight;
      const camera = new THREE.OrthographicCamera(-.5, .5, .5 / aspect, -.5 / aspect, .1, 10);
      camera.position.z = 1;
      renderer.setClearColor(0, 0);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      host.appendChild(renderer.domElement);
      const resize = () => renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientWidth / aspect), false);
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      const scene = new THREE.Scene();
      const geometry = new THREE.PlaneGeometry(1, 1 / aspect, 48, 32);
      const positions = geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>;
      positions.setUsage(THREE.DynamicDrawUsage);
      const originals = Float32Array.from(positions.array);
      let weights: ReturnType<typeof vertexWeight>[] = [];
      let weightedRig: FishRig | null = null;
      let texture: InstanceType<typeof THREE.Texture> | null = null;
      let material: InstanceType<typeof THREE.MeshBasicMaterial> | null = null;
      const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setReady(false); };
      renderer.domElement.addEventListener('webglcontextlost', lost);
      // Global monotonic phase survives target/packet updates; never accumulate a huge dt.
      let previous = performance.now();
      const motion = createSwimMotion();
      motion.phase = previous / 1000 * 1.8;
      const render = (now: number) => {
        if (cancelled) return;
        const currentRig = rigRef.current;
        if (currentRig && weightedRig !== currentRig) {
          weights = Array.from({ length: positions.count }, (_, i) => vertexWeight(originals[i * 3] + .5, .5 - originals[i * 3 + 1] * aspect, currentRig));
          weightedRig = currentRig;
        }
        const dt = Math.min(.1, Math.max(0, (now - previous) / 1000)); previous = now;
        const target = fastRef.current ? 1 : swimRef.current?.current ?? 0;
        advanceSwimMotion(motion, target, dt);
        for (let i = 0; i < positions.count; i++) {
          const [dx, dy] = reduced.matches || !weights[i] ? [0, 0] : displacement(weights[i], motion.phase / 4.1, false, motion.activity);
          positions.setXYZ(i, originals[i * 3] + dx, originals[i * 3 + 1] - dy / aspect, 0);
        }
        positions.needsUpdate = true;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      new THREE.TextureLoader().load(src, loaded => {
        if (cancelled) { loaded.dispose(); return; }
        texture = loaded;
        // Rendering is allowed only for the original bytes the rig was built for.
        if (loaded.image.width !== sourceWidth || loaded.image.height !== sourceHeight) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.minFilter = THREE.LinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.generateMipmaps = false;
        material = new THREE.MeshBasicMaterial({ map: loaded, transparent: true, depthWrite: false, toneMapped: false });
        scene.add(new THREE.Mesh(geometry, material));
        setReady(true);
        frame = requestAnimationFrame(render);
      }, undefined, () => setReady(false));
      cleanup = () => {
        cancelAnimationFrame(frame); observer.disconnect();
        renderer.domElement.removeEventListener('webglcontextlost', lost);
        geometry.dispose(); material?.dispose(); texture?.dispose();
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      };
    }).catch(() => setReady(false));
    return () => { cancelled = true; cleanup(); };
  }, [src, sourceWidth, sourceHeight]);

  return <div className="fish-sprite" style={{ aspectRatio: rig ? `${rig.sourceSize[0]} / ${rig.sourceSize[1]}` : undefined, filter }}>
    <img src={src} alt="디지털 트윈 물고기" draggable={false} onError={onError}
      style={{ display: 'block', width: '100%', height: 'auto', visibility: ready ? 'hidden' : 'visible' }} />
    <div ref={hostRef} className="fish-sprite-canvas" style={{ visibility: ready ? 'visible' : 'hidden' }} />
  </div>;
}
