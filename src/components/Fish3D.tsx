import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber'; // 💡 추가
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function Fish3D({ x, y, color }: { x: number; y: number; color: string }) {
  const { scene } = useGLTF('/Betta.glb');
  const groupRef = useRef<THREE.Group>(null); // 💡 그룹 참조 추가

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

  // 💡 [핵심] useFrame을 사용해 매 프레임마다 부드럽게 좌표 이동
  useFrame((state, delta) => {
    if (groupRef.current) {
      // position.lerp를 사용하여 현재 위치에서 [x, y, 0]으로 서서히 이동
      groupRef.current.position.lerp(new THREE.Vector3(x, y, 0), 0.1);
    }
  });

  return (
    <group ref={groupRef} scale={[0.01, 0.01, 0.01]}>
      <primitive object={processedScene} />
    </group>
  );
}