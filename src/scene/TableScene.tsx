import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PlayerView } from "../game/engine";
import type { Settings } from "../lib/session";
import { cardTexture, labelTexture, woodTexture } from "./textures";
interface Props {
  view: PlayerView | null;
  candidate: number | null;
  onSelect: (n: number) => void;
  settings: Settings;
  home: boolean;
  snap: number;
  paused?: boolean;
  onFallback: () => void;
}
const brass = "#a9aaa2";
function Box({
  position,
  size,
  color,
  metal = 0,
  rough = 0.7,
  cast = true,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  metal?: number;
  rough?: number;
  cast?: boolean;
}) {
  return (
    <mesh position={position} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} />
    </mesh>
  );
}
function Plate({
  text,
  position,
  width = 1.6,
}: {
  text: string;
  position: [number, number, number];
  width?: number;
}) {
  const map = useMemo(() => labelTexture(text), [text]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, width * 0.3125]} />
      <meshStandardMaterial map={map} roughness={0.65} />
    </mesh>
  );
}
function Card({
  value,
  face,
  position,
  rotation = 0,
  selected = false,
  onSelect,
  reduced = false,
}: {
  value?: number;
  face: boolean;
  position: [number, number, number];
  rotation?: number;
  selected?: boolean;
  onSelect?: () => void;
  reduced?: boolean;
}) {
  const targetPosition = useRef(new THREE.Vector3());
  const root = useRef<THREE.Group>(null),
    flip = useRef<THREE.Group>(null),
    pointer = useRef<[number, number] | null>(null);
  const front = useMemo(() => cardTexture(value), [value]),
    back = useMemo(() => cardTexture(), []);
  useFrame((_, dt) => {
    if (!root.current || !flip.current) return;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 9);
    root.current.position.lerp(
      targetPosition.current.set(
        position[0],
        position[1] + (selected ? 0.18 : 0),
        position[2] - (selected ? 0.16 : 0),
      ),
      k,
    );
    root.current.rotation.y = THREE.MathUtils.lerp(
      root.current.rotation.y,
      rotation,
      k,
    );
    flip.current.rotation.z = THREE.MathUtils.lerp(
      flip.current.rotation.z,
      face ? 0 : Math.PI,
      k,
    );
  });
  return (
    <group
      ref={root}
      position={[position[0], position[1] + 0.3, position[2] + 0.9]}
      onPointerDown={(e) => {
        e.stopPropagation();
        pointer.current = [e.clientX, e.clientY];
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (
          pointer.current &&
          Math.hypot(
            e.clientX - pointer.current[0],
            e.clientY - pointer.current[1],
          ) < 14
        )
          onSelect?.();
        pointer.current = null;
      }}
    >
      <group ref={flip} rotation={[0, 0, face ? 0 : Math.PI]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.67, 0.025, 1.01]} />
          <meshStandardMaterial
            color={selected ? "#c4aa9b" : "#b1a589"}
            roughness={0.85}
          />
        </mesh>
        <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.65, 0.99]} />
          <meshStandardMaterial map={front} roughness={0.84} />
        </mesh>
        <mesh position={[0, -0.014, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.65, 0.99]} />
          <meshStandardMaterial map={back} roughness={0.84} />
        </mesh>
      </group>
    </group>
  );
}
function Chip({
  position,
  color = brass,
}: {
  position: [number, number, number];
  color?: string;
}) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.055, 16]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.105, 0.123, 16]} />
        <meshStandardMaterial color="#d5c393" />
      </mesh>
    </group>
  );
}
function ChipStack({
  amount,
  position,
  color = brass,
}: {
  amount: number;
  position: [number, number, number];
  color?: string;
}) {
  const count = Math.min(18, Math.ceil(amount / 16)),
    bodies = useRef<THREE.InstancedMesh>(null),
    rings = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const obj = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      obj.position.set(Math.floor(i / 6) * 0.37, (i % 6) * 0.058, 0);
      obj.rotation.set(0, 0, 0);
      obj.updateMatrix();
      bodies.current?.setMatrixAt(i, obj.matrix);
      obj.position.y += 0.03;
      obj.rotation.x = -Math.PI / 2;
      obj.updateMatrix();
      rings.current?.setMatrixAt(i, obj.matrix);
    }
    if (bodies.current) bodies.current.instanceMatrix.needsUpdate = true;
    if (rings.current) rings.current.instanceMatrix.needsUpdate = true;
  }, [count]);
  return (
    <group position={position}>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, 18]}
        count={count}
        castShadow
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.16, 0.16, 0.055, 16]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.45} />
      </instancedMesh>
      <instancedMesh
        ref={rings}
        args={[undefined, undefined, 18]}
        count={count}
        frustumCulled={false}
      >
        <ringGeometry args={[0.105, 0.123, 16]} />
        <meshStandardMaterial color="#d5c393" />
      </instancedMesh>
    </group>
  );
}
function MovingChips({
  view,
  reduced,
}: {
  view: PlayerView | null;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null),
    splitGroup = useRef<THREE.Group>(null),
    progress = useRef(1),
    revision = useRef(-1);
  const moving =
    view?.events.some(
      (e) =>
        e.type === "settled" ||
        (e.type === "action" && (view.actions.at(-1)?.paid ?? 0) > 0),
    ) ?? false;
  const settling = view?.phase === "resolved";
  const actor = view?.actions.at(-1)?.player ?? "human";
  useFrame((_, dt) => {
    if (!group.current) return;
    if (revision.current !== view?.revision) {
      revision.current = view?.revision ?? -1;
      progress.current = 0;
    }
    progress.current = Math.min(1, progress.current + dt * 1.7);
    const t = reduced ? 1 : progress.current;
    const start = settling ? 0 : actor === "human" ? 1.7 : -1.5;
    const end = settling
      ? view?.history.at(-1)?.winner === "bot"
        ? -1.5
        : 1.7
      : 0;
    group.current.position.set(
      0.8,
      1.14 + Math.sin(t * Math.PI) * 0.3,
      THREE.MathUtils.lerp(start, end, t),
    );
    group.current.visible = moving && t < 1;
    if (splitGroup.current) {
      splitGroup.current.position.set(
        -0.2,
        1.14 + Math.sin(t * Math.PI) * 0.3,
        THREE.MathUtils.lerp(0, -1.5, t),
      );
      splitGroup.current.visible =
        !!settling && view?.history.at(-1)?.winner === "tie" && moving && t < 1;
    }
  });
  return (
    <>
      <group ref={group}>
        {[0, 1, 2].map((i) => (
          <Chip key={i} position={[i * 0.12, i * 0.05, 0]} />
        ))}
      </group>
      <group ref={splitGroup}>
        {[0, 1, 2].map((i) => (
          <Chip key={i} position={[i * 0.12, i * 0.05, 0]} />
        ))}
      </group>
    </>
  );
}
function Limb({
  from,
  to,
  radius,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  radius: number;
  color: string;
}) {
  const direction = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const center = new THREE.Vector3(...from)
    .add(new THREE.Vector3(...to))
    .multiplyScalar(0.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return (
    <mesh position={center} quaternion={rotation} castShadow>
      <cylinderGeometry args={[radius, radius * 0.85, direction.length(), 9]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}
function Opponent({
  view,
  reduced,
}: {
  view: PlayerView | null;
  reduced: boolean;
}) {
  const head = useRef<THREE.Group>(null),
    hand = useRef<THREE.Group>(null);
  const skin = "#b18a73",
    jacket = "#293137";
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (head.current) {
      head.current.rotation.y = reduced ? 0 : Math.sin(time * 0.24) * 0.035;
      head.current.rotation.x = reduced ? 0 : Math.sin(time * 0.5) * 0.015;
    }
    if (hand.current)
      hand.current.position.y =
        1.18 +
        (reduced
          ? 0
          : view?.turn === "bot" && view.phase === "betting"
            ? Math.sin(time * 2.1) * 0.018
            : 0);
  });
  return (
    <group position={[0, 0, -2.7]} name="npc-opponent">
      <Box
        position={[0, 1.8, -0.32]}
        size={[1.45, 1.75, 0.18]}
        color="#24292b"
      />
      <mesh position={[0, 1.85, 0]} castShadow>
        <cylinderGeometry args={[0.59, 0.48, 1.35, 9]} />
        <meshStandardMaterial color={jacket} roughness={0.96} />
      </mesh>
      <Box
        position={[0, 2.05, 0.575]}
        size={[0.27, 0.76, 0.04]}
        color="#b8b5ab"
      />
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.2, 0.35, 10]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {[-1, 1].map((side) => (
        <Box
          key={side}
          position={[side * 0.22, 2.23, 0.565]}
          size={[0.14, 0.54, 0.07]}
          color="#363f43"
        />
      ))}
      <group ref={head} position={[0, 2.98, 0]}>
        <mesh scale={[0.35, 0.47, 0.32]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color={skin} roughness={0.95} />
        </mesh>
        <mesh
          position={[0, 0.19, -0.025]}
          scale={[0.375, 0.33, 0.34]}
          castShadow
        >
          <sphereGeometry
            args={[1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2 + 0.12]}
          />
          <meshStandardMaterial color="#252a2a" roughness={1} />
        </mesh>
        <mesh
          position={[-0.08, 0.2, 0.235]}
          rotation={[0, 0, -0.18]}
          scale={[0.27, 0.095, 0.1]}
        >
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color="#252a2a" roughness={1} />
        </mesh>
        <Box
          position={[0, 0.06, -0.245]}
          size={[0.57, 0.53, 0.12]}
          color="#252a2a"
        />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              position={[side * 0.345, -0.025, -0.01]}
              scale={[0.065, 0.11, 0.07]}
            >
              <sphereGeometry args={[1, 8, 6]} />
              <meshStandardMaterial color={skin} />
            </mesh>
            <mesh
              position={[side * 0.137, 0.035, 0.294]}
              scale={[0.068, 0.028, 0.022]}
            >
              <sphereGeometry args={[1, 10, 6]} />
              <meshStandardMaterial color="#c7c0b1" />
            </mesh>
            <mesh position={[side * 0.137, 0.032, 0.315]}>
              <sphereGeometry args={[0.018, 8, 6]} />
              <meshStandardMaterial color="#292d2c" />
            </mesh>
            <Box
              position={[side * 0.139, 0.105, 0.294]}
              size={[0.14, 0.025, 0.025]}
              color="#34312c"
            />
          </group>
        ))}
        <mesh position={[0, -0.045, 0.326]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.06, 0.13, 4]} />
          <meshStandardMaterial color={skin} roughness={1} />
        </mesh>
        <Box
          position={[0, -0.205, 0.294]}
          size={[0.15, 0.015, 0.025]}
          color="#795b50"
        />
      </group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Limb
            from={[side * 0.51, 2.3, 0.02]}
            to={[side * 0.79, 1.55, 0.47]}
            radius={0.19}
            color={jacket}
          />
          <Limb
            from={[side * 0.79, 1.55, 0.47]}
            to={[side * 0.67, 1.2, 1.0]}
            radius={0.135}
            color={jacket}
          />
          <group
            ref={side === 1 ? hand : undefined}
            position={[side * 0.67, 1.18, 1.08]}
            rotation={[0, side * -0.12, 0]}
          >
            <Box position={[0, 0, 0]} size={[0.23, 0.1, 0.26]} color={skin} />
            {[0, 1, 2, 3].map((i) => (
              <Box
                key={i}
                position={[(i - 1.5) * 0.057, -0.01, 0.21 + (i % 2) * 0.02]}
                size={[0.046, 0.075, 0.19]}
                color={skin}
              />
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}
function CameraRig({
  phase,
  home,
  reduced,
  snap,
}: {
  phase: string;
  home: boolean;
  reduced: boolean;
  snap: number;
}) {
  const { camera } = useThree(),
    lastSnap = useRef(snap);

  useFrame((_, dt) => {
    const force = reduced || lastSnap.current !== snap;
    lastSnap.current = snap;
    const target = new THREE.Vector3(0, 4.6, 8.2);
    if (phase === "resolved" && !home) {
      target.y -= 0.18;
      target.z -= 0.36;
    }
    if (home) {
      target.z -= 0.1;
      target.y -= 0.2;
    }
    camera.position.lerp(target, force ? 1 : 1 - Math.exp(-dt * 3));
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = 65;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    camera.lookAt(0, 1.15, -0.55);
  });
  return null;
}
function Room(props: Props) {
  const { view, candidate, onSelect, settings, home, snap } = props;
  const low =
    settings.quality === "low" ||
    (settings.quality === "auto" && (navigator.hardwareConcurrency ?? 4) <= 4);
  const reduced = settings.reduced || settings.speed === "skip";
  const wood = useMemo(() => woodTexture(), []);
  const lamp = useRef<THREE.PointLight>(null);
  const available = (view?.hand ?? [3, 6, 9, 11, 13]).filter(
    (c) => c !== view?.ownCard,
  );
  const preview = available.includes(candidate ?? -1)
    ? candidate!
    : available[Math.floor(available.length / 2)];
  const record = view?.history.at(-1);
  const showdown =
    (view?.phase === "resolved" || view?.phase === "finished") &&
    record?.reason === "showdown";
  useFrame(({ clock }) => {
    if (lamp.current)
      lamp.current.intensity =
        17 + (reduced ? 0 : Math.sin(clock.elapsedTime * 1.3) * 0.1);
  });
  return (
    <>
      <color attach="background" args={["#14191c"]} />
      <fog attach="fog" args={["#14191c", 8, 22]} />
      <ambientLight intensity={0.48} color="#b4c0c4" />
      <hemisphereLight args={["#aab9c2", "#27201a", 0.8]} />
      <spotLight
        position={[0, 6, 0.2]}
        target-position={[0, 1, -0.3]}
        angle={0.68}
        penumbra={0.8}
        intensity={85}
        color="#f1dfc6"
        castShadow={!low}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.001}
      />
      <pointLight
        ref={lamp}
        position={[0, 3.9, -0.8]}
        intensity={17}
        distance={7}
        color="#e6d5b9"
      />
      <pointLight
        position={[-3, 3, -3]}
        intensity={25}
        color="#6c9c9b"
        distance={8}
      />
      <pointLight
        position={[3, 1, -1]}
        intensity={7}
        color="#c49c5a"
        distance={7}
      />
      <mesh position={[0, 0, -1]} receiveShadow>
        <boxGeometry args={[18, 0.15, 18]} />
        <meshStandardMaterial color="#161c17" roughness={1} />
      </mesh>
      <Box position={[0, 3.1, -5.2]} size={[16, 7, 0.3]} color="#30363a" />
      {Array.from({ length: 13 }, (_, i) => (
        <Box
          key={i}
          position={[(i - 6) * 0.9, 2.25, -4.99]}
          size={[0.028, 4.4, 0.055]}
          color="#3b4247"
        />
      ))}
      <Box position={[0, 0.6, -4.9]} size={[16, 0.09, 0.18]} color="#333a3e" />
      {[-1, 1].map((x) => (
        <group key={x}>
          <Box
            position={[x * 5.2, 2.9, -1]}
            size={[0.25, 7, 12]}
            color="#262d32"
          />
          <Box
            position={[x * 3, 0.54, 0]}
            size={[0.23, 1.1, 0.25]}
            color="#2e261b"
          />
        </group>
      ))}
      <mesh position={[0, 0.94, 0]} receiveShadow castShadow>
        <boxGeometry args={[7.4, 0.32, 6.3]} />
        <meshStandardMaterial map={wood} roughness={0.76} />
      </mesh>
      <Box position={[0, 0.72, 0]} size={[7.0, 0.16, 5.9]} color="#251e15" />
      <Box
        position={[0, 1.11, -0.1]}
        size={[4.7, 0.024, 3.75]}
        color="#303b3c"
        rough={0.98}
        cast={false}
      />
      {[-1, 1].map((x) => (
        <Box
          key={x}
          position={[x * 2.36, 1.13, -0.1]}
          size={[0.018, 0.015, 3.78]}
          color={brass}
          metal={0.45}
        />
      ))}
      {[-1, 1].map((z) => (
        <Box
          key={z}
          position={[0, 1.13, -0.1 + z * 1.88]}
          size={[4.72, 0.015, 0.018]}
          color={brass}
          metal={0.45}
        />
      ))}
      <mesh position={[0, 5.05, -0.75]}>
        <cylinderGeometry args={[0.04, 0.04, 2.5, 8]} />
        <meshStandardMaterial color="#171b16" metalness={0.7} />
      </mesh>
      <mesh position={[0, 4.35, -0.75]}>
        <coneGeometry args={[0.72, 0.55, 24, 1, true]} />
        <meshStandardMaterial
          color="#242b30"
          side={THREE.DoubleSide}
          roughness={0.5}
          metalness={0.6}
        />
      </mesh>
      <mesh position={[0, 4.12, -0.75]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.54, 24]} />
        <meshBasicMaterial color="#e5d8bd" />
      </mesh>
      <Opponent view={view} reduced={reduced} />
      <group position={[0, 1.16, -0.55]}>
        <Box
          position={[0, 0.08, 0]}
          size={[1.8, 0.16, 0.68]}
          color="#22292e"
          metal={0.6}
        />
        <Box
          position={[0, 0.17, 0]}
          size={[1.86, 0.045, 0.73]}
          color={brass}
          metal={0.7}
        />
        <Plate
          text={view?.mode ?? "BIG / SMALL"}
          position={[0, 0.195, 0]}
          width={1.65}
        />
        {[-1, 1].map((x) => (
          <mesh key={x} position={[x * 1.03, 0.13, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial
              color={
                view?.mode
                  ? view.mode === "BIG"
                    ? "#c5987f"
                    : "#8aa3ac"
                  : "#4c5a60"
              }
              emissive={view?.mode ? "#76594b" : "#000000"}
              emissiveIntensity={0.5}
            />
          </mesh>
        ))}
      </group>
      <ChipStack
        amount={view?.chips.bot ?? 300}
        position={[-1.5, 1.18, -1.5]}
        color="#a7aaa3"
      />
      <ChipStack
        amount={view?.chips.human ?? 300}
        position={[1.6, 1.17, 1.55]}
        color="#6e8289"
      />
      <ChipStack amount={view?.pot ?? 4} position={[1.05, 1.18, 0.06]} />
      <MovingChips view={view} reduced={reduced} />
      {(home || view?.opponentCommitted) && (
        <Card
          value={showdown ? (view?.revealed.bot ?? undefined) : undefined}
          face={!!showdown}
          position={[0.35, 1.18, -1.6]}
          rotation={-0.1}
          reduced={reduced}
        />
      )}
      {view?.ownCard !== null && view?.ownCard !== undefined && (
        <Card
          value={view.ownCard}
          face={!!showdown}
          position={[-0.38, 1.18, 0.68]}
          rotation={0.06}
          reduced={reduced}
        />
      )}
      {available.length > 0 &&
        [0, 1, 2].map((i) => (
          <Card
            key={`deck-${i}`}
            face={false}
            position={[-1.27, 1.17 + i * 0.03, 1.62]}
            rotation={-0.04 + i * 0.04}
            reduced={reduced}
          />
        ))}
      {(home || view?.phase === "selecting") && preview !== undefined && (
        <Card
          key={`preview-${view?.round ?? 0}`}
          value={preview}
          face
          position={[0, 1.2, 1.82]}
          rotation={-0.035}
          selected={candidate === preview}
          onSelect={
            view?.phase === "selecting" ? () => onSelect(preview) : undefined
          }
          reduced={reduced}
        />
      )}
      <CameraRig
        phase={view?.phase ?? "home"}
        home={home}
        reduced={reduced}
        snap={snap}
      />
    </>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
function Fallback({
  view,
  candidate,
  onSelect,
}: Pick<Props, "view" | "candidate" | "onSelect">) {
  const r = view?.history.at(-1);
  const show =
    (view?.phase === "resolved" || view?.phase === "finished") &&
    r?.reason === "showdown";
  return (
    <div className="fallback-table">
      <div className="fallback-opponent">
        <span className="fallback-person" />
        <span>NPC</span>
      </div>
      <div className="fallback-card">{show ? view?.revealed.bot : "◇"}</div>
      <div className="fallback-machine">
        {view?.mode ?? "BIG / SMALL"}
        <small>軽量モード · ポット {view?.pot ?? 0}</small>
      </div>
      <div className="fallback-card own">{show ? view?.ownCard : "◇"}</div>
      <div className="fallback-hand">
        {view?.phase === "selecting" &&
          view.hand
            .filter((c) => c !== view.ownCard)
            .map((c) => (
              <button
                key={c}
                aria-label={`カード${c}を選択`}
                aria-pressed={candidate === c}
                onClick={() => onSelect(c)}
              >
                {c}
              </button>
            ))}
      </div>
    </div>
  );
}
/** 起動直後の準備を除き、遅いフレームが続く場合は影とDPRを下げる。 */
function QualityMonitor({
  enabled,
  onSlow,
}: {
  enabled: boolean;
  onSlow: () => void;
}) {
  const sample = useRef({ warmup: 0, seconds: 0, frames: 0 });
  useFrame((_, dt) => {
    if (!enabled || document.hidden || dt > 0.5) return;
    const s = sample.current;
    s.warmup += dt;
    if (s.warmup < 1.5) return;
    s.seconds += dt;
    s.frames++;
    if (s.frames >= 12) {
      if (s.seconds / s.frames > 0.045) onSlow();
      s.seconds = 0;
      s.frames = 0;
    }
  });
  return null;
}
export default function TableScene(props: Props) {
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoLow, setAutoLow] = useState(
    (navigator.hardwareConcurrency ?? 4) <= 4,
  );
  const fallbackCallback = useRef(props.onFallback);
  fallbackCallback.current = props.onFallback;
  const fail = () => {
    setFallback(true);
    fallbackCallback.current();
  };
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2");
      if (!gl) {
        setFallback(true);
        fallbackCallback.current();
      } else gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setFallback(true);
      fallbackCallback.current();
    }
  }, []); // 一度だけGPUを検査
  const low =
    props.settings.quality === "low" ||
    props.settings.reduced ||
    (props.settings.quality === "auto" && autoLow);
  return (
    <div
      className="scene"
      data-render-quality={fallback ? "fallback" : low ? "low" : "high"}
      aria-label="NPCと向き合う3Dのテーブル"
    >
      {fallback ? (
        <Fallback {...props} />
      ) : (
        <SceneBoundary onError={fail}>
          <Suspense
            fallback={
              <div className="scene-loading">テーブルを読み込み中…</div>
            }
          >
            <Canvas
              dpr={low ? 1 : [1, 1.5]}
              frameloop={props.paused ? "never" : "always"}
              shadows={!low}
              camera={{ position: [0, 4.5, 8.2], fov: 55 }}
              gl={{
                antialias: !low,
                powerPreference: low ? "low-power" : "default",
                alpha: false,
              }}
              onCreated={({ gl }) => {
                setReady(true);
                gl.domElement.addEventListener(
                  "webglcontextlost",
                  (e) => {
                    e.preventDefault();
                    fail();
                  },
                  { once: true },
                );
              }}
            >
              <Room
                {...props}
                settings={{
                  ...props.settings,
                  quality: low ? "low" : props.settings.quality,
                }}
              />
              <QualityMonitor
                enabled={props.settings.quality === "auto" && !low}
                onSlow={() => setAutoLow(true)}
              />
            </Canvas>
          </Suspense>
        </SceneBoundary>
      )}
      {!fallback && !ready && (
        <div className="scene-loading">テーブルを読み込み中…</div>
      )}
      <div className="vignette" />
    </div>
  );
}
