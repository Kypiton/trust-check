'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

type Palette = {
  foreground: string;
  muted: string;
  primary: string;
  danger: string;
  surface: string;
  border: string;
  dark: boolean;
};

export function TrustCoreCanvas({
  boosted,
  palette,
  active,
}: {
  boosted: boolean;
  palette: Palette;
  active: boolean;
}) {
  return (
    <div aria-hidden='true' className='absolute inset-0'>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={active ? 'always' : 'demand'}
        camera={{ position: [0, 0.08, 7.75], fov: 37, near: 0.1, far: 50 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <TrustCoreScene boosted={boosted} palette={palette} />
      </Canvas>
    </div>
  );
}

function TrustCoreScene({ boosted, palette }: { boosted: boolean; palette: Palette }) {
  const root = useRef<THREE.Group>(null);
  const nearParticles = useRef<THREE.Group>(null);
  const deepLayer = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    if (!root.current) return;

    const targetY = pointer.x * 0.16;
    const targetX = -pointer.y * 0.095;
    root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, targetY, 4.8, delta);
    root.current.rotation.x = THREE.MathUtils.damp(root.current.rotation.x, targetX, 4.8, delta);
    root.current.position.x = THREE.MathUtils.damp(root.current.position.x, pointer.x * 0.055, 4.2, delta);
    root.current.position.y = THREE.MathUtils.damp(root.current.position.y, pointer.y * 0.032, 4.2, delta);
    root.current.position.z = THREE.MathUtils.damp(root.current.position.z, boosted ? 0.2 : 0, 3.4, delta);

    if (nearParticles.current) {
      nearParticles.current.position.x = THREE.MathUtils.damp(nearParticles.current.position.x, pointer.x * 0.22, 3.1, delta);
      nearParticles.current.position.y = THREE.MathUtils.damp(nearParticles.current.position.y, pointer.y * 0.14, 3.1, delta);
    }

    if (deepLayer.current) {
      deepLayer.current.position.x = THREE.MathUtils.damp(deepLayer.current.position.x, -pointer.x * 0.045, 2.5, delta);
      deepLayer.current.position.y = THREE.MathUtils.damp(deepLayer.current.position.y, -pointer.y * 0.03, 2.5, delta);
    }
  });

  return (
    <>
      <ambientLight intensity={palette.dark ? 0.3 : 0.72} />
      <pointLight position={[3.5, 2.8, 4.2]} color={palette.primary} intensity={boosted ? 24 : 15} distance={13} />
      <pointLight
        position={[-3.8, -2.4, 2.6]}
        color={palette.dark ? palette.danger : '#7C3AED'}
        intensity={palette.dark ? 5.4 : 2.4}
        distance={10}
      />
      <pointLight position={[0, 0.6, -3]} color={palette.dark ? '#22D3EE' : '#60A5FA'} intensity={4.5} distance={8} />

      <group ref={deepLayer}>
        <DepthLattice palette={palette} boosted={boosted} />
        <ParticleField palette={palette} boosted={boosted} layer='far' />
      </group>
      <group ref={nearParticles}>
        <ParticleField palette={palette} boosted={boosted} layer='near' />
      </group>

      <group ref={root} scale={boosted ? 1.035 : 1}>
        <OrbitRings palette={palette} boosted={boosted} />
        <Core palette={palette} boosted={boosted} />
        <EnergyPulse palette={palette} boosted={boosted} />
        <ScanSequence palette={palette} boosted={boosted} />
        <Orbiter kind='message' index={0} radius={2.5} speed={0.32} tilt={0.32} palette={palette} boosted={boosted} />
        <Orbiter kind='link' index={1} radius={2.82} speed={-0.25} tilt={-0.46} palette={palette} boosted={boosted} />
        <Orbiter kind='screenshot' index={2} radius={2.26} speed={0.29} tilt={0.76} palette={palette} boosted={boosted} />
      </group>
    </>
  );
}

const coreVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPosition;
  varying float vWave;
  uniform float uTime;
  uniform float uEnergy;

  void main() {
    vec3 displaced = position;
    float a = sin(position.y * 10.0 + uTime * 1.7);
    float b = sin(position.x * 12.0 - uTime * 1.25);
    float c = sin((position.x + position.z) * 8.0 + uTime * 0.95);
    float wave = a * 0.44 + b * 0.34 + c * 0.22;
    displaced += normal * wave * (0.018 + uEnergy * 0.014);

    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vWave = wave;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const coreFragment = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPosition;
  varying float vWave;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uAlert;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uAlertColor;
  uniform vec3 uInner;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 2.65);
    float bandA = 0.5 + 0.5 * sin(vWorldPosition.y * 15.0 - uTime * 2.2 + vWave * 2.4);
    float bandB = 0.5 + 0.5 * sin(vWorldPosition.x * 9.0 + vWorldPosition.z * 7.0 + uTime * 1.45);
    float bandC = 0.5 + 0.5 * sin(length(vWorldPosition.xy) * 18.0 - uTime * 1.8);
    float pulse = 0.78 + 0.22 * sin(uTime * 2.35);

    vec3 baseAccent = mix(uPrimary, uSecondary, 0.28 + bandB * 0.18);
    vec3 accent = mix(baseAccent, uAlertColor, uAlert);
    float energyBands = bandA * 0.12 + bandB * 0.08 + bandC * 0.055;
    vec3 color = mix(uInner, accent, clamp(fresnel * 1.22 + energyBands + 0.06, 0.0, 1.0));
    color += accent * fresnel * (0.24 + 0.34 * uEnergy) * pulse;
    color += uSecondary * max(vWave, 0.0) * 0.05;

    float alpha = 0.3 + fresnel * 0.56 + energyBands * 0.26;
    gl_FragColor = vec4(color, alpha);
  }
`;

function Core({ palette, boosted }: { palette: Palette; boosted: boolean }) {
  const shell = useRef<THREE.Mesh>(null);
  const shellInner = useRef<THREE.Mesh>(null);
  const wire = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const nucleus = useRef<THREE.Mesh>(null);
  const knot = useRef<THREE.Mesh>(null);
  const cage = useRef<THREE.Group>(null);
  const bandOne = useRef<THREE.Mesh>(null);
  const bandTwo = useRef<THREE.Mesh>(null);
  const bandThree = useRef<THREE.Mesh>(null);

  const alertColor = palette.dark ? palette.danger : '#7C3AED';
  const secondaryColor = palette.dark ? '#22D3EE' : '#4F46E5';
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0.58 },
      uAlert: { value: 0 },
      uPrimary: { value: new THREE.Color(palette.primary) },
      uSecondary: { value: new THREE.Color(secondaryColor) },
      uAlertColor: { value: new THREE.Color(alertColor) },
      uInner: { value: new THREE.Color(palette.dark ? '#030711' : '#EEF4FF') },
    }),
    [alertColor, palette.dark, palette.primary, secondaryColor],
  );

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const cycle = elapsed % 10;
    const scan = cycle > 4.0 && cycle < 7.2 ? Math.sin(((cycle - 4.0) / 3.2) * Math.PI) : 0;
    const energy = Math.min(1, 0.5 + scan * 0.4 + (boosted ? 0.3 : 0));

    if (material.current) {
      material.current.uniforms.uTime.value = elapsed;
      material.current.uniforms.uEnergy.value = THREE.MathUtils.damp(material.current.uniforms.uEnergy.value, energy, 4.2, delta);
      material.current.uniforms.uAlert.value = THREE.MathUtils.damp(
        material.current.uniforms.uAlert.value,
        scan * (palette.dark ? 0.86 : 0.42),
        3.3,
        delta,
      );
      material.current.uniforms.uPrimary.value.set(palette.primary);
      material.current.uniforms.uSecondary.value.set(secondaryColor);
      material.current.uniforms.uAlertColor.value.set(alertColor);
    }

    if (shell.current) {
      const scale = 1 + Math.sin(elapsed * 1.55) * 0.012 + scan * 0.045;
      shell.current.scale.setScalar(scale);
      shell.current.rotation.y += delta * (boosted ? 0.15 : 0.085);
      shell.current.rotation.x += delta * 0.02;
    }
    if (shellInner.current) {
      shellInner.current.rotation.y -= delta * 0.064;
      shellInner.current.rotation.z += delta * 0.04;
    }
    if (wire.current) {
      wire.current.rotation.y -= delta * 0.095;
      wire.current.rotation.z += delta * 0.058;
    }
    if (halo.current) {
      const haloScale = 1.3 + Math.sin(elapsed * 1.18) * 0.028 + scan * 0.07;
      halo.current.scale.setScalar(haloScale);
    }
    if (nucleus.current) {
      const nucleusScale = 1 + Math.sin(elapsed * 2.15) * 0.024 + scan * 0.052;
      nucleus.current.scale.setScalar(nucleusScale);
      nucleus.current.rotation.y += delta * 0.16;
      nucleus.current.rotation.x -= delta * 0.04;
    }
    if (knot.current) {
      knot.current.rotation.x += delta * (boosted ? 0.18 : 0.12);
      knot.current.rotation.y -= delta * (boosted ? 0.22 : 0.145);
      knot.current.rotation.z += delta * 0.07;
      knot.current.scale.setScalar(0.62 + scan * 0.055);
    }
    if (cage.current) {
      cage.current.rotation.y += delta * 0.045;
      cage.current.rotation.x -= delta * 0.026;
    }
    if (bandOne.current) {
      bandOne.current.rotation.x += delta * 0.11;
      bandOne.current.rotation.z += delta * 0.072;
    }
    if (bandTwo.current) {
      bandTwo.current.rotation.y -= delta * 0.094;
      bandTwo.current.rotation.z -= delta * 0.056;
    }
    if (bandThree.current) {
      bandThree.current.rotation.x -= delta * 0.075;
      bandThree.current.rotation.y += delta * 0.065;
    }
  });

  return (
    <group>
      <mesh ref={halo}>
        <sphereGeometry args={[1.18, 48, 48]} />
        <meshBasicMaterial
          color={secondaryColor}
          transparent
          opacity={palette.dark ? 0.045 : 0.026}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={shell}>
        <icosahedronGeometry args={[0.96, 6]} />
        <shaderMaterial
          ref={material}
          vertexShader={coreVertex}
          fragmentShader={coreFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh ref={shellInner} scale={0.82}>
        <icosahedronGeometry args={[0.96, 4]} />
        <meshBasicMaterial
          color={secondaryColor}
          transparent
          opacity={palette.dark ? 0.065 : 0.04}
          wireframe
          depthWrite={false}
        />
      </mesh>

      <mesh ref={wire} scale={1.055}>
        <icosahedronGeometry args={[0.96, 2]} />
        <meshBasicMaterial
          color={palette.primary}
          transparent
          opacity={palette.dark ? 0.14 : 0.075}
          wireframe
          depthWrite={false}
        />
      </mesh>

      <mesh ref={nucleus} scale={0.39}>
        <octahedronGeometry args={[1, 4]} />
        <meshStandardMaterial
          color={palette.dark ? '#020611' : '#DCE9FF'}
          emissive={palette.primary}
          emissiveIntensity={palette.dark ? 1.35 : 0.5}
          roughness={0.12}
          metalness={0.38}
          transparent
          opacity={0.96}
        />
      </mesh>

      <mesh ref={knot} scale={0.62}>
        <torusKnotGeometry args={[0.67, 0.018, 128, 14, 2, 3]} />
        <meshBasicMaterial
          color={secondaryColor}
          transparent
          opacity={palette.dark ? 0.48 : 0.24}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <group ref={cage}>
        <CoreBracket rotation={[0, 0, 0]} palette={palette} />
        <CoreBracket rotation={[Math.PI / 2, 0, Math.PI / 4]} palette={palette} />
        <CoreBracket rotation={[0, Math.PI / 2, -Math.PI / 4]} palette={palette} />
      </group>

      <mesh ref={bandOne} rotation={[0.92, 0.2, 0.55]}>
        <torusGeometry args={[0.73, 0.011, 10, 120]} />
        <meshBasicMaterial color={palette.primary} transparent opacity={palette.dark ? 0.36 : 0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={bandTwo} rotation={[1.55, -0.4, -0.25]}>
        <torusGeometry args={[0.82, 0.008, 10, 120]} />
        <meshBasicMaterial color={alertColor} transparent opacity={palette.dark ? 0.2 : 0.09} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={bandThree} rotation={[0.35, 1.1, 0.92]}>
        <torusGeometry args={[0.88, 0.006, 10, 120]} />
        <meshBasicMaterial color={secondaryColor} transparent opacity={palette.dark ? 0.2 : 0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function CoreBracket({ rotation, palette }: { rotation: [number, number, number]; palette: Palette }) {
  return (
    <mesh rotation={rotation}>
      <torusGeometry args={[1.17, 0.012, 8, 96, Math.PI * 0.52]} />
      <meshBasicMaterial
        color={palette.primary}
        transparent
        opacity={palette.dark ? 0.19 : 0.09}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function OrbitRings({ palette, boosted }: { palette: Palette; boosted: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * (boosted ? 0.075 : 0.038);
    group.current.rotation.z += delta * 0.012;
  });

  return (
    <group ref={group}>
      <Ring radius={2.46} rotation={[1.1, 0.1, 0.05]} palette={palette} opacity={0.13} />
      <Ring radius={2.92} rotation={[0.72, -0.32, 1.02]} palette={palette} opacity={0.07} />
      <Ring radius={2.15} rotation={[1.44, 0.7, -0.64]} palette={palette} opacity={0.055} />
    </group>
  );
}

function Ring({
  radius,
  rotation,
  palette,
  opacity,
}: {
  radius: number;
  rotation: [number, number, number];
  palette: Palette;
  opacity: number;
}) {
  return (
    <mesh rotation={rotation}>
      <torusGeometry args={[radius, 0.006, 8, 200]} />
      <meshBasicMaterial color={palette.primary} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function ParticleField({
  palette,
  boosted,
  layer,
}: {
  palette: Palette;
  boosted: boolean;
  layer: 'far' | 'near';
}) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(layer === 'far' ? 20261113 : 20261201);
    const count = layer === 'far' ? 300 : 110;
    const array = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = (layer === 'far' ? 2.3 : 1.65) + random() * (layer === 'far' ? 2.6 : 2.1);
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      array[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      array[index * 3 + 1] = radius * Math.cos(phi) * (layer === 'far' ? 0.76 : 0.62);
      array[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) * (layer === 'far' ? 0.8 : 0.58);
    }
    return array;
  }, [layer]);

  useFrame((_, delta) => {
    if (!points.current) return;
    const direction = layer === 'far' ? 1 : -1;
    points.current.rotation.y += delta * direction * (boosted ? 0.05 : 0.021);
    points.current.rotation.x += delta * direction * (layer === 'far' ? 0.004 : 0.009);
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach='attributes-position' args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={palette.primary}
        size={layer === 'far' ? 0.013 : boosted ? 0.032 : 0.025}
        transparent
        opacity={layer === 'far' ? (palette.dark ? 0.25 : 0.11) : palette.dark ? 0.46 : 0.22}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function DepthLattice({ palette, boosted }: { palette: Palette; boosted: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.z += delta * (boosted ? 0.018 : 0.009);
    group.current.rotation.y -= delta * 0.006;
  });

  return (
    <group ref={group} position={[0, 0, -1.2]}>
      {[1.8, 2.45, 3.1].map((radius, index) => (
        <mesh key={radius} rotation={[Math.PI / 2.2 + index * 0.18, index * 0.25, index * 0.42]}>
          <ringGeometry args={[radius, radius + 0.012, 128]} />
          <meshBasicMaterial
            color={palette.primary}
            transparent
            opacity={(palette.dark ? 0.035 : 0.018) / (index + 1) * 1.7}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function EnergyPulse({ palette, boosted }: { palette: Palette; boosted: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const ringTwo = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const materialTwo = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(state => {
    const duration = boosted ? 4.5 : 6.6;
    const progress = (state.clock.elapsedTime % duration) / duration;
    const progressTwo = (progress + 0.48) % 1;
    const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
    const easedTwo = THREE.MathUtils.smoothstep(progressTwo, 0, 1);
    if (ring.current) ring.current.scale.setScalar(0.82 + eased * 1.7);
    if (ringTwo.current) ringTwo.current.scale.setScalar(0.86 + easedTwo * 1.5);
    if (material.current) material.current.opacity = Math.sin(progress * Math.PI) * (palette.dark ? 0.17 : 0.07);
    if (materialTwo.current) materialTwo.current.opacity = Math.sin(progressTwo * Math.PI) * (palette.dark ? 0.08 : 0.035);
  });

  return (
    <>
      <mesh ref={ring} rotation={[0.1, 0.12, 0]}>
        <ringGeometry args={[0.82, 0.855, 128]} />
        <meshBasicMaterial ref={material} color={palette.primary} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ringTwo} rotation={[0.86, -0.22, 0.38]}>
        <ringGeometry args={[0.86, 0.88, 128]} />
        <meshBasicMaterial ref={materialTwo} color={palette.dark ? '#22D3EE' : '#4F46E5'} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}

function ScanSequence({ palette, boosted }: { palette: Palette; boosted: boolean }) {
  const sheet = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const aperture = useRef<THREE.Mesh>(null);
  const apertureMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMaterial = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(state => {
    const elapsed = state.clock.elapsedTime;
    const cycle = elapsed % (boosted ? 6.0 : 8.6);
    const start = boosted ? 1.25 : 2.9;
    const duration = boosted ? 2.55 : 2.9;
    const progress = THREE.MathUtils.clamp((cycle - start) / duration, 0, 1);
    const visible = progress > 0 && progress < 1;
    const envelope = visible ? Math.sin(progress * Math.PI) : 0;

    if (sheet.current) {
      sheet.current.position.x = THREE.MathUtils.lerp(-1.35, 1.35, progress);
      sheet.current.rotation.z = Math.sin(progress * Math.PI) * 0.08;
    }
    if (material.current) material.current.opacity = envelope * (palette.dark ? 0.085 : 0.034);

    if (aperture.current) {
      aperture.current.position.x = THREE.MathUtils.lerp(-1.35, 1.35, progress);
      aperture.current.scale.setScalar(0.82 + envelope * 0.18);
    }
    if (apertureMaterial.current) apertureMaterial.current.opacity = envelope * (palette.dark ? 0.38 : 0.15);

    if (halo.current) halo.current.scale.setScalar(0.9 + envelope * 1.55);
    if (haloMaterial.current) haloMaterial.current.opacity = envelope * (palette.dark ? 0.12 : 0.045);
  });

  return (
    <>
      <mesh ref={sheet} rotation={[0, 0.06, 0]}>
        <planeGeometry args={[0.1, 2.8]} />
        <meshBasicMaterial ref={material} color={palette.dark ? '#67E8F9' : '#2563EB'} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={aperture}>
        <ringGeometry args={[0.7, 1.22, 128]} />
        <meshBasicMaterial ref={apertureMaterial} color={palette.primary} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={halo}>
        <ringGeometry args={[0.92, 0.955, 128]} />
        <meshBasicMaterial ref={haloMaterial} color={palette.dark ? '#22D3EE' : '#4F46E5'} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}

type OrbiterKind = 'message' | 'link' | 'screenshot';
const TRAIL_POINTS = 22;

function Orbiter({
  kind,
  index,
  radius,
  speed,
  tilt,
  palette,
  boosted,
}: {
  kind: OrbiterKind;
  index: number;
  radius: number;
  speed: number;
  tilt: number;
  palette: Palette;
  boosted: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const connectionAttribute = useRef<THREE.BufferAttribute>(null);
  const connectionMaterial = useRef<THREE.LineBasicMaterial>(null);
  const trailAttribute = useRef<THREE.BufferAttribute>(null);
  const trailMaterial = useRef<THREE.LineBasicMaterial>(null);
  const auraMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const trailInitialized = useRef(false);
  const { camera } = useThree();

  useFrame((state, delta) => {
    if (!group.current) return;
    const elapsed = state.clock.elapsedTime;
    const cycleDuration = boosted ? 7.2 : 10.2;
    const sceneCycle = elapsed % cycleDuration;
    const selected = Math.floor(elapsed / cycleDuration) % 3;
    const phaseStart = boosted ? 1.35 : 3.55;
    const phaseDuration = boosted ? 3.25 : 3.45;
    const localProgress = THREE.MathUtils.clamp((sceneCycle - phaseStart) / phaseDuration, 0, 1);
    const pull = selected === index ? Math.sin(localProgress * Math.PI) : 0;
    const currentRadius = THREE.MathUtils.lerp(radius, 1.28, pull * 0.88);
    const theta = elapsed * speed + index * 2.1;

    const x = Math.cos(theta) * currentRadius;
    const z = Math.sin(theta) * currentRadius * 0.54;
    const y = Math.sin(theta * 1.17 + tilt) * (0.52 + Math.abs(tilt) * 0.3);
    group.current.position.set(x, y, z);
    group.current.lookAt(camera.position);
    group.current.rotation.z += Math.sin(elapsed * 0.8 + index) * 0.0008;
    const targetScale = 0.86 + pull * 0.3 + (boosted ? 0.035 : 0);
    const scale = THREE.MathUtils.damp(group.current.scale.x, targetScale, 5, delta);
    group.current.scale.setScalar(scale);

    if (connectionAttribute.current) {
      connectionAttribute.current.setXYZ(0, 0, 0, 0);
      connectionAttribute.current.setXYZ(1, x, y, z);
      connectionAttribute.current.needsUpdate = true;
    }
    if (connectionMaterial.current) connectionMaterial.current.opacity = 0.018 + pull * (palette.dark ? 0.18 : 0.07);
    if (auraMaterial.current) auraMaterial.current.opacity = (palette.dark ? 0.028 : 0.012) + pull * 0.045;

    if (trailAttribute.current) {
      if (!trailInitialized.current) {
        for (let point = 0; point < TRAIL_POINTS; point += 1) trailAttribute.current.setXYZ(point, x, y, z);
        trailInitialized.current = true;
      } else {
        for (let point = TRAIL_POINTS - 1; point > 0; point -= 1) {
          trailAttribute.current.setXYZ(
            point,
            trailAttribute.current.getX(point - 1),
            trailAttribute.current.getY(point - 1),
            trailAttribute.current.getZ(point - 1),
          );
        }
        trailAttribute.current.setXYZ(0, x, y, z);
      }
      trailAttribute.current.needsUpdate = true;
    }
    if (trailMaterial.current) trailMaterial.current.opacity = (palette.dark ? 0.14 : 0.055) + pull * 0.1;
  });

  return (
    <>
      <line>
        <bufferGeometry>
          <bufferAttribute ref={connectionAttribute} attach='attributes-position' args={[new Float32Array(6), 3]} />
        </bufferGeometry>
        <lineBasicMaterial ref={connectionMaterial} color={palette.primary} transparent opacity={0.018} depthWrite={false} />
      </line>

      <line>
        <bufferGeometry>
          <bufferAttribute ref={trailAttribute} attach='attributes-position' args={[new Float32Array(TRAIL_POINTS * 3), 3]} />
        </bufferGeometry>
        <lineBasicMaterial ref={trailMaterial} color={palette.dark ? '#38BDF8' : palette.primary} transparent opacity={palette.dark ? 0.14 : 0.055} depthWrite={false} blending={THREE.AdditiveBlending} />
      </line>

      <group ref={group}>
        <mesh scale={1.2}>
          <circleGeometry args={[0.68, 64]} />
          <meshBasicMaterial ref={auraMaterial} color={palette.primary} transparent opacity={palette.dark ? 0.028 : 0.012} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
        {kind === 'message' && <MessageNode palette={palette} />}
        {kind === 'link' && <LinkNode palette={palette} />}
        {kind === 'screenshot' && <ScreenshotNode palette={palette} />}
      </group>
    </>
  );
}

function HologramPanel({ palette, size }: { palette: Palette; size: [number, number] }) {
  return (
    <>
      <mesh>
        <boxGeometry args={[size[0], size[1], 0.026]} />
        <meshPhysicalMaterial
          color={palette.surface}
          emissive={palette.primary}
          emissiveIntensity={palette.dark ? 0.2 : 0.045}
          roughness={0.18}
          metalness={0.12}
          transparent
          opacity={palette.dark ? 0.42 : 0.3}
          depthWrite={false}
          clearcoat={0.72}
          clearcoatRoughness={0.18}
        />
      </mesh>
      <mesh scale={[1.035, 1.055, 1]}>
        <boxGeometry args={[size[0], size[1], 0.032]} />
        <meshBasicMaterial color={palette.primary} transparent opacity={palette.dark ? 0.14 : 0.075} wireframe depthWrite={false} />
      </mesh>
      <CornerBrackets palette={palette} size={size} />
    </>
  );
}

function CornerBrackets({ palette, size }: { palette: Palette; size: [number, number] }) {
  const x = size[0] / 2 + 0.015;
  const y = size[1] / 2 + 0.015;
  const color = palette.dark ? '#67E8F9' : palette.primary;
  const corners: Array<[number, number, number]> = [
    [-x, y, 0],
    [x, y, Math.PI / 2],
    [x, -y, Math.PI],
    [-x, -y, -Math.PI / 2],
  ];

  return (
    <group position={[0, 0, 0.026]}>
      {corners.map(([cx, cy, rotation], index) => (
        <group key={index} position={[cx, cy, 0]} rotation={[0, 0, rotation]}>
          <mesh position={[0.06, 0, 0]}><boxGeometry args={[0.12, 0.012, 0.008]} /><meshBasicMaterial color={color} transparent opacity={0.7} /></mesh>
          <mesh position={[0, -0.06, 0]}><boxGeometry args={[0.012, 0.12, 0.008]} /><meshBasicMaterial color={color} transparent opacity={0.7} /></mesh>
        </group>
      ))}
    </group>
  );
}

function MessageNode({ palette }: { palette: Palette }) {
  return (
    <group>
      <HologramPanel palette={palette} size={[1.08, 0.66]} />
      {[0.16, 0.01, -0.14].map((y, index) => (
        <mesh key={y} position={[-0.07 + index * 0.02, y, 0.035]}>
          <boxGeometry args={[0.62 - index * 0.11, 0.028, 0.012]} />
          <meshBasicMaterial color={index === 0 ? palette.primary : palette.muted} transparent opacity={index === 0 ? 0.95 : 0.42} />
        </mesh>
      ))}
      <mesh position={[-0.4, 0.17, 0.04]}>
        <sphereGeometry args={[0.052, 16, 16]} />
        <meshBasicMaterial color={palette.dark ? '#67E8F9' : palette.primary} />
      </mesh>
    </group>
  );
}

function LinkNode({ palette }: { palette: Palette }) {
  return (
    <group>
      <mesh rotation={[0, 0, -0.55]} position={[-0.22, 0, 0]}>
        <torusGeometry args={[0.27, 0.045, 18, 48, Math.PI * 1.42]} />
        <meshStandardMaterial color={palette.primary} emissive={palette.primary} emissiveIntensity={palette.dark ? 0.62 : 0.17} roughness={0.18} metalness={0.34} transparent opacity={0.9} />
      </mesh>
      <mesh rotation={[0, 0, -0.55]} position={[0.22, 0, 0]}>
        <torusGeometry args={[0.27, 0.045, 18, 48, Math.PI * 1.42]} />
        <meshStandardMaterial color={palette.surface} emissive={palette.dark ? '#22D3EE' : palette.primary} emissiveIntensity={palette.dark ? 0.34 : 0.08} roughness={0.2} metalness={0.28} transparent opacity={0.8} />
      </mesh>
      <mesh rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.42, 0.046, 0.055]} />
        <meshBasicMaterial color={palette.dark ? '#67E8F9' : palette.primary} transparent opacity={0.92} />
      </mesh>
      <mesh scale={1.15}>
        <torusGeometry args={[0.47, 0.006, 8, 72]} />
        <meshBasicMaterial color={palette.primary} transparent opacity={palette.dark ? 0.18 : 0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function ScreenshotNode({ palette }: { palette: Palette }) {
  return (
    <group>
      <HologramPanel palette={palette} size={[0.92, 0.7]} />
      <mesh position={[0, 0.03, 0.025]}>
        <planeGeometry args={[0.67, 0.43]} />
        <meshBasicMaterial color={palette.dark ? '#07111F' : '#EDF4FF'} transparent opacity={palette.dark ? 0.58 : 0.5} depthWrite={false} />
      </mesh>
      <mesh position={[-0.2, 0.12, 0.036]}>
        <sphereGeometry args={[0.052, 16, 16]} />
        <meshBasicMaterial color={palette.dark ? '#67E8F9' : palette.primary} />
      </mesh>
      <mesh position={[0.11, -0.08, 0.037]} rotation={[0, 0, -0.48]}>
        <planeGeometry args={[0.48, 0.035]} />
        <meshBasicMaterial color={palette.muted} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, -0.02, 0.044]}>
        <ringGeometry args={[0.28, 0.29, 64]} />
        <meshBasicMaterial color={palette.primary} transparent opacity={palette.dark ? 0.12 : 0.06} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
