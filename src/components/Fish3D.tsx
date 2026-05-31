import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function Fish3D({ x, y, color }: { x: number; y: number; color: string }) {
  const { scene } = useGLTF('/Betta.glb');

  const processedScene = useMemo(() => {
    const clone = scene.clone();
    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center);

    clone.traverse((child: any) => {
      if (child.isMesh) {
        if (child.name.toLowerCase().includes('eye')) {
          child.material = new THREE.MeshStandardMaterial({ color: '#000000' });
        } else {
          child.material = new THREE.MeshStandardMaterial({
            color: color,
            side: THREE.DoubleSide,
          });
        }
      }
    });
    return clone;
  }, [scene, color]);

  // 💡 [핵심] 복잡한 코드 다 지우고, 파이썬에서 온 x, y를 group의 position에 직접 꽂아줍니다!
  // 혹시 움직임이 너무 미세해서 안 보이는 걸 방지하기 위해 x, y 값에 배율(* 2)을 살짝 주었습니다.
  return (
    <group position={[Number(x) * 2, Number(y) * 2, 0]} scale={[0.01, 0.01, 0.01]}>
      <primitive object={processedScene} />
    </group>
  );
}