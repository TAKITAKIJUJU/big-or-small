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
  onFallback: () => void;
}
const brass = "#9e8551";
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
            color={selected ? "#d0b36c" : "#b1a589"}
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
function Keeper({
  view,
  reduced,
  home,
}: {
  view: PlayerView | null;
  reduced: boolean;
  home: boolean;
}) {
  const head = useRef<THREE.Group>(null),
    arm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (head.current) {
      head.current.rotation.z = reduced ? 0 : Math.sin(t * 0.38) * 0.035;
      head.current.rotation.y = reduced ? 0 : Math.sin(t * 0.22) * 0.07;
      head.current.position.y =
        2.85 + (reduced ? 0 : Math.sin(t * 0.8) * 0.012);
    }
    if (arm.current)
      arm.current.rotation.x = reduced
        ? 0
        : view?.turn === "bot" && view?.phase === "betting"
          ? Math.sin(t * 3) * 0.045
          : Math.sin(t * 0.7) * 0.01;
  });
  return (
    <group position={[0, 0, -2.7]}>
      <mesh position={[0, 1.75, 0.04]} castShadow>
        <coneGeometry args={[0.85, 1.8, 7]} />
        <meshStandardMaterial color="#242b28" roughness={0.96} />
      </mesh>
      <mesh position={[0, 2.34, 0]} castShadow>
        <cylinderGeometry args={[0.31, 0.38, 0.18, 12]} />
        <meshStandardMaterial color={brass} metalness={0.65} roughness={0.4} />
      </mesh>
      <group ref={head} position={[0, 2.85, 0]}>
        <mesh castShadow scale={[0.43, 0.59, 0.32]}>
          <icosahedronGeometry args={[1, 2]} />
          <meshStandardMaterial color="#bdb9a1" roughness={0.78} />
        </mesh>
        <mesh position={[0.09, 0, 0.292]} rotation={[0, 0, -0.07]}>
          <boxGeometry args={[0.025, 0.91, 0.035]} />
          <meshStandardMaterial color="#494c3c" metalness={0.6} />
        </mesh>
        {[-1, 1].map((x) => (
          <group key={x}>
            <mesh
              position={[x * 0.18, 0.09, 0.299]}
              rotation={[0, 0, x * 0.12]}
            >
              <boxGeometry args={[0.2, 0.047, 0.035]} />
              <meshStandardMaterial color="#111611" />
            </mesh>
            <mesh position={[x * 0.18, 0.085, 0.322]}>
              <boxGeometry args={[0.095, 0.013, 0.01]} />
              <meshBasicMaterial color={x === 1 ? "#c3a35e" : "#738e79"} />
            </mesh>
          </group>
        ))}
        <mesh position={[-0.05, -0.26, 0.29]} rotation={[0, 0, 0.08]}>
          <boxGeometry args={[0.2, 0.018, 0.02]} />
          <meshStandardMaterial color="#555947" />
        </mesh>
        <mesh position={[-0.36, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.095, 0.021, 6, 12]} />
          <meshStandardMaterial color={brass} metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      {[-1, 1].map((side) => (
        <group
          key={side}
          ref={side === 1 ? arm : undefined}
          position={[side * 0.64, 1.95, 0.12]}
          rotation={[0, 0, side * 0.38]}
        >
          <mesh position={[0, -0.36, 0.15]} castShadow rotation={[-0.5, 0, 0]}>
            <cylinderGeometry args={[0.18, 0.14, 0.85, 7]} />
            <meshStandardMaterial color="#2f3530" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.74, 0.38]} rotation={[-1.2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.1, 0.7, 7]} />
            <meshStandardMaterial color="#353a30" />
          </mesh>
          <group position={[0, -0.96, 0.74]}>
            <Box
              position={[0, 0, 0]}
              size={[0.25, 0.11, 0.28]}
              color="#a29b7f"
            />
            {[0, 1, 2, 3].map((i) => (
              <Box
                key={i}
                position={[(i - 1.5) * 0.063, -0.01, 0.22 + (i % 2) * 0.03]}
                size={[0.045, 0.075, 0.24]}
                color="#a29b7f"
              />
            ))}
          </group>
        </group>
      ))}
      <Box
        position={[0, 1.9, -0.44]}
        size={[1.75, 2.25, 0.18]}
        color="#201e18"
      />
      <Plate
        text={home ? "THE KEEPER" : "KEEPER / 01"}
        position={[0, 1.175, 0.83]}
        width={1.3}
      />
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
  const { camera, size } = useThree(),
    lastSnap = useRef(snap);
  const portrait = size.width / size.height < 0.8;
  useFrame((_, dt) => {
    const force = reduced || lastSnap.current !== snap;
    lastSnap.current = snap;
    const target = new THREE.Vector3(
      0,
      portrait ? 4.6 : 4.5,
      portrait ? 8.2 : 7.6,
    );
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
      const fov = portrait ? 65 : 43;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    camera.lookAt(0, portrait ? 1.15 : 1.18, -0.55);
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
  let center = available.indexOf(candidate ?? -1);
  if (center < 0) center = Math.floor(available.length / 2);
  const visible = available.slice(
    Math.max(0, Math.min(available.length - 5, center - 2)),
    Math.max(0, Math.min(available.length - 5, center - 2)) + 5,
  );
  const record = view?.history.at(-1);
  const showdown =
    (view?.phase === "resolved" || view?.phase === "finished") &&
    record?.reason === "showdown";
  useFrame(({ clock }) => {
    if (lamp.current)
      lamp.current.intensity =
        17 + (reduced ? 0 : Math.sin(clock.elapsedTime * 2.3) * 0.3);
  });
  return (
    <>
      <color attach="background" args={["#0c110f"]} />
      <fog attach="fog" args={["#0c110f", 8, 22]} />
      <ambientLight intensity={0.3} color="#92a995" />
      <hemisphereLight args={["#7f928a", "#1c130b", 0.65]} />
      <spotLight
        position={[0, 6, 0.2]}
        target-position={[0, 1, -0.3]}
        angle={0.68}
        penumbra={0.8}
        intensity={100}
        color="#ffe0a1"
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
        color="#ffd38a"
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
      <Box position={[0, 3.1, -5.2]} size={[16, 7, 0.3]} color="#26302a" />
      {Array.from({ length: 13 }, (_, i) => (
        <Box
          key={i}
          position={[(i - 6) * 0.9, 2.25, -4.99]}
          size={[0.028, 4.4, 0.055]}
          color="#4a5040"
        />
      ))}
      <Box position={[0, 0.6, -4.9]} size={[16, 0.09, 0.18]} color="#807047" />
      {[-1, 1].map((x) => (
        <group key={x}>
          <Box
            position={[x * 5.2, 2.9, -1]}
            size={[0.25, 7, 12]}
            color="#1a251f"
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
        color="#313e31"
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
          color="#384235"
          side={THREE.DoubleSide}
          roughness={0.5}
          metalness={0.6}
        />
      </mesh>
      <mesh position={[0, 4.12, -0.75]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.54, 24]} />
        <meshBasicMaterial color="#edce8f" />
      </mesh>
      <Keeper view={view} reduced={reduced} home={home} />
      <group position={[0, 1.16, -0.55]}>
        <Box
          position={[0, 0.08, 0]}
          size={[1.8, 0.16, 0.68]}
          color="#242b24"
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
                    ? "#d6b76e"
                    : "#8aaea3"
                  : "#70644b"
              }
              emissive={view?.mode ? "#947b42" : "#000000"}
              emissiveIntensity={0.5}
            />
          </mesh>
        ))}
      </group>
      <Plate text="XIII" position={[-1.7, 1.145, -0.1]} width={0.5} />
      <ChipStack
        amount={view?.chips.bot ?? 300}
        position={[-1.5, 1.18, -1.5]}
        color="#a29268"
      />
      <ChipStack
        amount={view?.chips.human ?? 300}
        position={[1.6, 1.17, 1.55]}
        color="#8c9a80"
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
      {visible.map((c, i) => (
        <Card
          key={`${view?.round ?? 0}-${c}`}
          value={c}
          face
          position={[
            (i - (visible.length - 1) / 2) * 0.64,
            1.18 + 0.003 * i,
            1.92 + Math.abs(i - (visible.length - 1) / 2) * 0.04,
          ]}
          rotation={(i - (visible.length - 1) / 2) * -0.08}
          selected={candidate === c}
          onSelect={view?.phase === "selecting" ? () => onSelect(c) : undefined}
          reduced={reduced}
        />
      ))}
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
      <div className="fallback-keeper">
        ◇<span>番人</span>
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
      aria-label="番人と向き合う3Dの卓"
    >
      {fallback ? (
        <Fallback {...props} />
      ) : (
        <SceneBoundary onError={fail}>
          <Suspense
            fallback={
              <div className="scene-loading">卓に明かりを灯しています…</div>
            }
          >
            <Canvas
              dpr={low ? 1 : [1, 1.5]}
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
        <div className="scene-loading">卓に明かりを灯しています…</div>
      )}
      <div className="vignette" />
    </div>
  );
}
