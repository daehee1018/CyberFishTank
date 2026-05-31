import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function Fish3D({ x, y, color }: { x: number; y: number; color: string }) {
  const { scene } = useGLTF('/Betta.glb');
  const groupRef = useRef<THREE.Group>(null);
  
  // 💡 [핵심 포인트 1] 목표 좌표를 담아둘 안전한 '상자'를 하나 만듭니다.
  const targetPos = useRef(new THREE.Vector3(0, 0, 0));

  // 💡 [핵심 포인트 2] 파이썬에서 새 x, y가 도착할 때마다 상자 안의 좌표만 쓱 바꿔줍니다.
  // (문자열이 섞여 들어올 경우를 대비해 Number()로 확실하게 숫자로 만듭니다)
  useEffect(() => {
    targetPos.current.set(Number(x), Number(y), 0);
  }, [x, y]);

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

  // 💡 [핵심 포인트 3] 3D 엔진은 매 프레임마다 상자(targetPos)에 적힌 주소로만 열심히 이동합니다.
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.lerp(targetPos.current, 0.1);
    }
  });

  return (
    <group ref={groupRef} scale={[0.01, 0.01, 0.01]}>
      <primitive object={processedScene} />
    </group>
  );
}