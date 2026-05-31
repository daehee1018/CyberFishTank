import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function Fish3D({ x, y, color }: { x: number; y: number; color: string }) {
  const { scene } = useGLTF('/Betta.glb');

  const processedScene = useMemo(() => {
    const clone = scene.clone();
    
    // 모델의 중심점을 정중앙으로 이동 (카메라가 엉뚱한 곳을 비추는 것 방지)
    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center);

    clone.traverse((child: any) => {
      if (child.isMesh) {
        // 눈 확인: 이름에 'eye'가 있으면 검은색
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

  // 💡 [핵심] Group으로 감싸고 여기서 scale을 0.01로 더 작게 조정했습니다.
  return (
    <group position={[x, y, 0]} scale={[0.01, 0.01, 0.01]}>
      <primitive object={processedScene} />
    </group>
  );
}