import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { RosterStudent } from '../types';

export interface Race3DRacer {
  student: RosterStudent;
  progress: number;
  boosting: boolean;
  finishedOrder: number;
}

interface RaceEngine3DProps {
  racers: Race3DRacer[];
  racerEmoji: string;
  racing: boolean;
  onWebGLError: () => void;
}

const LANE_COLORS = [
  0xf43f5e, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0x06b6d4, 0xec4899,
  0x84cc16, 0xf97316, 0x6366f1, 0x14b8a6, 0xeab308, 0xd946ef, 0x0ea5e9,
];

function createRacerBillboard(name: string, emoji: string, colorHex: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 220;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Pill background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(16, 18, 480, 180, 36);
  ctx.fill();
  ctx.stroke();

  // Emoji
  ctx.font = '88px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 86, 108);

  // Student Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  const shortName = name.length > 14 ? `${name.slice(0, 12)}…` : name;
  ctx.fillText(shortName, 152, 110);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createCheckeredTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const size = 32;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#0f172a';
      ctx.fillRect(x * size, y * size, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const RaceEngine3D: React.FC<RaceEngine3DProps> = ({
  racers,
  racerEmoji,
  racing,
  onWebGLError,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const racersRef = useRef(racers);
  racersRef.current = racers;
  const racingRef = useRef(racing);
  racingRef.current = racing;

  const rebuildTrackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      onWebGLError();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 420;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.0085);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 250);
    camera.position.set(0, 8.5, 14);
    camera.lookAt(0, 1, -20);

    // Stadium Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const dirLight = new THREE.DirectionalLight(0xfffbeb, 2.1);
    dirLight.position.set(16, 28, 12);
    scene.add(dirLight);

    const finishLight = new THREE.PointLight(0xfbbf24, 30, 45);
    finishLight.position.set(0, 7, -100);
    scene.add(finishLight);

    // Starfield / Stadium ambience
    const starsCount = 220;
    const starPos = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 90;
      starPos[i * 3 + 1] = 4 + Math.random() * 28;
      starPos[i * 3 + 2] = 15 - Math.random() * 145;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xe2e8f0, size: 0.22, transparent: true, opacity: 0.7 });
    scene.add(new THREE.Points(starGeo, starMat));

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    const racerMeshes: Array<{
      group: THREE.Group;
      podMat: THREE.MeshStandardMaterial;
      ringMesh: THREE.Mesh;
      sprite: THREE.Sprite;
    }> = [];

    let trackWidth = 12;

    const clearDynamic = () => {
      racerMeshes.length = 0;
      while (dynamicGroup.children.length > 0) {
        const obj = dynamicGroup.children[0];
        obj.traverse((child) => {
          if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
          const mat = (child as THREE.Mesh).material;
          if (mat) {
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else {
              if ((mat as THREE.MeshStandardMaterial).map) {
                (mat as THREE.MeshStandardMaterial).map?.dispose();
              }
              mat.dispose();
            }
          }
        });
        dynamicGroup.remove(obj);
      }
    };

    const buildTrackAndRacers = () => {
      clearDynamic();
      const list = racersRef.current;
      const count = Math.max(1, list.length);
      const spacing = 1.55;
      trackWidth = count * spacing + 1.4;

      // Ground asphalt / stadium floor
      const floorGeo = new THREE.PlaneGeometry(trackWidth, 114);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.65,
        metalness: 0.2,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.position.set(0, 0, -51);
      dynamicGroup.add(floor);

      // Start & Milestone lines (25%, 50%, 75%)
      [0, -25, -50, -75].forEach((zPos, idx) => {
        const lineGeo = new THREE.PlaneGeometry(trackWidth, idx === 0 ? 0.6 : 0.25);
        lineGeo.rotateX(-Math.PI / 2);
        const lineMat = new THREE.MeshBasicMaterial({
          color: idx === 0 ? 0x38bdf8 : 0x475569,
          transparent: true,
          opacity: idx === 0 ? 0.85 : 0.5,
        });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(0, 0.015, zPos);
        dynamicGroup.add(line);
      });

      // Checkered Finish Line Strip
      const checkerTex = createCheckeredTexture();
      const finStripGeo = new THREE.PlaneGeometry(trackWidth, 2.2);
      finStripGeo.rotateX(-Math.PI / 2);
      const finStripMat = new THREE.MeshBasicMaterial({ map: checkerTex });
      const finStrip = new THREE.Mesh(finStripGeo, finStripMat);
      finStrip.position.set(0, 0.02, -100);
      dynamicGroup.add(finStrip);

      // Finish Arch Pillars + Banner
      const pillarGeo = new THREE.BoxGeometry(0.45, 5.2, 0.45);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.45,
        metalness: 0.7,
        roughness: 0.2,
      });
      const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
      leftPillar.position.set(-trackWidth / 2 - 0.1, 2.6, -100);
      const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
      rightPillar.position.set(trackWidth / 2 + 0.1, 2.6, -100);
      dynamicGroup.add(leftPillar, rightPillar);

      const archGeo = new THREE.BoxGeometry(trackWidth + 0.8, 0.85, 0.5);
      const archMat = new THREE.MeshStandardMaterial({ map: checkerTex });
      const archMesh = new THREE.Mesh(archGeo, archMat);
      archMesh.position.set(0, 5.2, -100);
      dynamicGroup.add(archMesh);

      // Lanes & Racers
      list.forEach((r, idx) => {
        const laneX = (idx - (count - 1) / 2) * spacing;
        const laneColor = LANE_COLORS[idx % LANE_COLORS.length];

        // Lane Divider
        if (idx > 0) {
          const divGeo = new THREE.PlaneGeometry(0.06, 108);
          divGeo.rotateX(-Math.PI / 2);
          const divMat = new THREE.MeshBasicMaterial({
            color: 0x334155,
            transparent: true,
            opacity: 0.7,
          });
          const div = new THREE.Mesh(divGeo, divMat);
          div.position.set(laneX - spacing / 2, 0.012, -50);
          dynamicGroup.add(div);
        }

        const rGroup = new THREE.Group();
        rGroup.position.set(laneX, 0, 0);

        // 3D Racer Pod
        const podGeo = new THREE.CylinderGeometry(0.46, 0.54, 0.34, 24);
        const podMat = new THREE.MeshStandardMaterial({
          color: laneColor,
          emissive: laneColor,
          emissiveIntensity: 0.25,
          metalness: 0.45,
          roughness: 0.25,
        });
        const podMesh = new THREE.Mesh(podGeo, podMat);
        podMesh.position.y = 0.2;
        rGroup.add(podMesh);

        // Neon underglow ring
        const ringGeo = new THREE.TorusGeometry(0.55, 0.05, 10, 24);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.y = 0.06;
        ringMesh.visible = false;
        rGroup.add(ringMesh);

        // Billboard Sprite
        const tex = createRacerBillboard(r.student.name, racerEmoji, laneColor);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(0, 1.35, 0);
        sprite.scale.set(2.35, 1.02, 1);
        rGroup.add(sprite);

        dynamicGroup.add(rGroup);
        racerMeshes.push({ group: rGroup, podMat, ringMesh, sprite });
      });
    };

    rebuildTrackRef.current = buildTrackAndRacers;
    buildTrackAndRacers();

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let rafId = 0;
    const renderLoop = (now: number) => {
      rafId = requestAnimationFrame(renderLoop);
      const list = racersRef.current;

      let leadProgress = 0;
      for (let i = 0; i < list.length && i < racerMeshes.length; i++) {
        const r = list[i];
        const m = racerMeshes[i];
        const targetZ = -r.progress; // 0 -> -100
        m.group.position.z = THREE.MathUtils.lerp(m.group.position.z, targetZ, 0.35);

        const bounce = racingRef.current && r.progress < 100
          ? Math.abs(Math.sin(now * 0.012 + i * 1.1)) * 0.16
          : 0;
        m.group.position.y = bounce;

        m.ringMesh.visible = r.boosting && r.progress < 100;
        m.podMat.emissiveIntensity = r.boosting ? 0.9 : 0.25;

        if (r.progress > leadProgress) leadProgress = r.progress;
      }

      // Dynamic Broadcast Camera
      if (!racingRef.current && leadProgress === 0) {
        const panX = Math.sin(now * 0.00055) * Math.min(4.5, trackWidth * 0.22);
        camera.position.lerp(new THREE.Vector3(panX, 7.6, 12.5), 0.06);
        camera.lookAt(0, 1.0, -14);
      } else if (leadProgress >= 84) {
        // Dramatic Photo-Finish Side/Angle Broadcast Camera
        const sideX = Math.min(11, trackWidth * 0.56 + 2.8);
        camera.position.lerp(new THREE.Vector3(sideX, 4.4, -90.5), 0.06);
        camera.lookAt(0, 1.3, -100);
      } else {
        // Chase cam following the leader
        const chaseZ = -leadProgress + 14.5;
        const swayX = Math.sin(now * 0.0006) * 2.2;
        camera.position.lerp(new THREE.Vector3(swayX, 8.2, chaseZ), 0.08);
        camera.lookAt(0, 1.0, -leadProgress - 11);
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      clearDynamic();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      rebuildTrackRef.current = null;
    };
  }, [onWebGLError, racerEmoji]);

  // Rebuild track only when racer roster IDs change
  const rosterKey = racers.map((r) => r.student.id).join('|');
  useEffect(() => {
    rebuildTrackRef.current?.();
  }, [rosterKey, racerEmoji]);

  return (
    <div
      ref={mountRef}
      className="w-full h-[360px] sm:h-[430px] lg:h-[470px] rounded-2xl overflow-hidden border border-white/15 bg-slate-950/70 shadow-2xl"
    />
  );
};
