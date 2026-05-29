"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Text } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";
import type { PlayerId } from "@/lib/types";
import { PLAYER_LABELS, PLAYER_COLORS } from "@/lib/types";

const SEATS: [number, number, number][] = [
  [-1.35, 0.55, 0.35],
  [-0.45, 0.55, 0.15],
  [0.45, 0.55, 0.15],
  [1.35, 0.55, 0.35],
];

function Character({
  playerId,
  position,
  color,
  isSpeaking,
}: {
  playerId: PlayerId;
  position: [number, number, number];
  color: string;
  isSpeaking: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random() * 10);

  useFrame((_, delta) => {
    t.current += delta;
    if (!group.current || !head.current) return;

    const breathe = Math.sin(t.current * 1.2) * 0.02;
    group.current.position.y = position[1] + breathe;

    if (isSpeaking) {
      const talk = Math.sin(t.current * 14) * 0.06;
      head.current.position.y = 0.72 + talk;
      head.current.rotation.z = Math.sin(t.current * 10) * 0.08;
      group.current.rotation.y = Math.sin(t.current * 3) * 0.05;
    } else {
      head.current.position.y = THREE.MathUtils.lerp(
        head.current.position.y,
        0.72,
        0.1
      );
      head.current.rotation.z = THREE.MathUtils.lerp(
        head.current.rotation.z,
        0,
        0.1
      );
    }
  });

  return (
    <group ref={group} position={position}>
      {/* Body */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.45, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Head */}
      <mesh ref={head} position={[0, 0.72, 0]} castShadow>
        <sphereGeometry args={[0.2, 24, 24]} />
        <meshStandardMaterial color="#f5d0b5" roughness={0.45} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.07, 0.76, 0.16]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.07, 0.76, 0.16]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <Text
        position={[0, 1.05, 0]}
        fontSize={0.12}
        color={color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#000"
      >
        {PLAYER_LABELS[playerId]}
      </Text>
    </group>
  );
}

function LivingRoom() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial color="#2a2420" roughness={0.9} />
      </mesh>
      {/* Rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.5]} receiveShadow>
        <planeGeometry args={[4.5, 3]} />
        <meshStandardMaterial color="#4a3528" roughness={1} />
      </mesh>
      {/* Sofa base */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 0.5, 1.1]} />
        <meshStandardMaterial color="#3d4f6f" roughness={0.7} />
      </mesh>
      {/* Sofa back */}
      <mesh position={[0, 0.75, -0.45]} castShadow>
        <boxGeometry args={[3.6, 0.7, 0.35]} />
        <meshStandardMaterial color="#354560" roughness={0.7} />
      </mesh>
      {/* Armrests */}
      <mesh position={[-1.85, 0.5, 0]} castShadow>
        <boxGeometry args={[0.35, 0.55, 1]} />
        <meshStandardMaterial color="#354560" />
      </mesh>
      <mesh position={[1.85, 0.5, 0]} castShadow>
        <boxGeometry args={[0.35, 0.55, 1]} />
        <meshStandardMaterial color="#354560" />
      </mesh>
      {/* Lamp */}
      <mesh position={[-2.8, 1.2, -1.2]}>
        <cylinderGeometry args={[0.04, 0.06, 1.4, 8]} />
        <meshStandardMaterial color="#8b7355" />
      </mesh>
      <pointLight position={[-2.8, 1.8, -1.2]} intensity={0.8} color="#ffddb0" distance={4} />
      {/* TV glow */}
      <mesh position={[0, 1.4, -2.2]}>
        <planeGeometry args={[2.2, 1.2]} />
        <meshStandardMaterial color="#1a2a44" emissive="#223355" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function SceneContent({
  activeSpeaker,
  playerOrder,
}: {
  activeSpeaker: PlayerId | null;
  playerOrder: PlayerId[];
}) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 6, 4]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Environment preset="apartment" />
      <LivingRoom />
      {playerOrder.map((id, i) => (
        <Character
          key={id}
          playerId={id}
          position={SEATS[i]}
          color={PLAYER_COLORS[id]}
          isSpeaking={activeSpeaker === id}
        />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={8}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0.6, 0]}
      />
    </>
  );
}

export default function SofaScene({
  activeSpeaker,
  turnOrder,
}: {
  activeSpeaker: PlayerId | null;
  turnOrder: PlayerId[];
}) {
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 320, borderRadius: 12, overflow: "hidden" }}>
      <Canvas shadows camera={{ position: [0, 2.2, 5.5], fov: 45 }}>
        <SceneContent activeSpeaker={activeSpeaker} playerOrder={turnOrder} />
      </Canvas>
    </div>
  );
}
