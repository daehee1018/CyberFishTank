import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';
import * as THREE from 'three';

// 💡 1. 괄호 안에 기본값(= [0.5, 0.5])을 달아주어 데이터가 없어도 에러가 나지 않게 합니다.
export function Fish3D({ 
  center_norm = [0.5, 0.5], 
  move_direction = 'none', 
  pose_direction = 'none', 
  abnormal = false 
}: any) {
  const { scene } = useGLTF('/Betta.glb');
  const fishRef = useRef<THREE.Group>(null);
  
  const targetPos = useRef(new THREE.Vector3(0, 0, 0));
  const targetQuat = useRef(new THREE.Quaternion()); 

  useEffect(() => {
    // 💡 2. 혹시라도 데이터가 배열이 아니거나 깨져있을 경우를 대비한 2중 안전장치
    const safeNorm = (Array.isArray(center_norm) && center_norm.length >= 2) ? center_norm : [0.5, 0.5];

    // 안전한 값으로 x, y 좌표 계산
    const x = (safeNorm[0] - 0.5) * 10;
    const y = -(safeNorm[1] - 0.5) * 6; 
    targetPos.current.set(x, y, 0);

    let rotY = 0; 
    let rotZ = 0; 
    
    // 💡 3. 문자열이 아닐 경우를 대비해 안전하게 String으로 묶어줍니다.
    const dir = String(pose_direction || move_direction || 'none').toLowerCase();
    
    if (dir.includes('left')) rotY = -Math.PI / 2; 
    if (dir.includes('right')) rotY = Math.PI / 2; 
    if (dir.includes('up')) rotZ = Math.PI / 4;    
    if (dir.includes('down')) rotZ = -Math.PI / 4; 
    
    const euler = new THREE.Euler(0, rotY, rotZ);
    targetQuat.current.setFromEuler(euler);

    const fishColor = abnormal ? '#FF0000' : '#00A8FF'; 
    
    scene.traverse((child: any) => {
      if (child.isMesh && !child.name.toLowerCase().includes('eye')) {
        child.material = new THREE.MeshStandardMaterial({ 
          color: fishColor, 
          side: THREE.DoubleSide 
        });
      }
    });
  }, [center_norm, pose_direction, move_direction, abnormal, scene]);

  useFrame(() => {
    if (fishRef.current) {
      fishRef.current.position.lerp(targetPos.current, 0.05);
      fishRef.current.quaternion.slerp(targetQuat.current, 0.05);
    }
  });

  return (
    <group ref={fishRef}>
      <Center scale={[1, 1, 1]}>
        <primitive object={scene} />
      </Center>
    </group>
  );
}