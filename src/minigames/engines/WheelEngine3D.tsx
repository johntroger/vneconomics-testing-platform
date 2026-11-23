import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { playWheelTick } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import { PACE_META, type PaceMode } from '../stageContext';
import type { RosterStudent } from '../types';

interface WheelEngine3DProps {
  students: RosterStudent[];
  palette: string[];
  centerEmoji: string;
  muted: boolean;
  paceMode: PaceMode;
  spinTrigger: number;
  onSpinStateChange: (spinning: boolean) => void;
  onPointerNameChange: (name: string) => void;
  onProgressChange: (progress: number) => void;
  onPickStudent: (student: RosterStudent) => void;
  onWebGLError: () => void;
}

function buildWheelFaceTexture(
  students: RosterStudent[],
  palette: string[],
): THREE.CanvasTexture {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 16;
  const count = Math.max(1, students.length);
  const sliceAngle = (Math.PI * 2) / count;

  ctx.clearRect(0, 0, size, size);

  if (students.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chưa có sinh viên', cx, cy);
  } else {
    for (let i = 0; i < count; i++) {
      const start = i * sliceAngle;
      const end = start + sliceAngle;
      const color = palette[i % palette.length];

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();

      const grad = ctx.createRadialGradient(cx, cy, radius * 0.14, cx, cy, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, '#0f172a55');
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      const fontSize = count > 22 ? 32 : count > 14 ? 40 : 50;
      ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 8;
      const rawName = students[i].name;
      const shortName = rawName.length > 18 ? `${rawName.slice(0, 16)}…` : rawName;
      ctx.fillText(shortName, radius - 58, 0);
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function buildEmojiCapTexture(emoji: string): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  const grad = ctx.createRadialGradient(cx - 40, cy - 40, 20, cx, cy, size / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.75, '#e2e8f0');
  grad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '210px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, cx, cy + 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const WheelEngine3D: React.FC<WheelEngine3DProps> = ({
  students,
  palette,
  centerEmoji,
  muted,
  paceMode,
  spinTrigger,
  onSpinStateChange,
  onPointerNameChange,
  onProgressChange,
  onPickStudent,
  onWebGLError,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglReady, setWebglReady] = useState(false);

  // Refs synced with latest props for the animation loop
  const studentsRef = useRef(students);
  studentsRef.current = students;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const paceRef = useRef(paceMode);
  paceRef.current = paceMode;
  const callbacksRef = useRef({
    onSpinStateChange,
    onPointerNameChange,
    onProgressChange,
    onPickStudent,
    onWebGLError,
  });
  callbacksRef.current = {
    onSpinStateChange,
    onPointerNameChange,
    onProgressChange,
    onPickStudent,
    onWebGLError,
  };

  const sceneRefs = useRef<{
    wheelGroup: THREE.Group;
    faceMesh: THREE.Mesh;
    capMesh: THREE.Mesh;
    pegsGroup: THREE.Group;
    bulbs: Array<{ mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }>;
    pointerGroup: THREE.Group;
    camera: THREE.PerspectiveCamera;
    rotZ: number;
    pointerKickUntil: number;
    spinState: {
      active: boolean;
      startTime: number;
      duration: number;
      startAngle: number;
      targetAngle: number;
      lastSliceIdx: number;
    };
  } | null>(null);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      callbacksRef.current.onWebGLError();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 520;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, -1.35, 6.9);
    camera.lookAt(0, 0.15, 0);

    // Studio Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);

    const keySpot = new THREE.SpotLight(0xfffbeb, 48, 30, Math.PI / 4, 0.45, 1.2);
    keySpot.position.set(2.5, 4.5, 6.5);
    keySpot.castShadow = true;
    scene.add(keySpot);

    const rimLightCyan = new THREE.PointLight(0x38bdf8, 18, 18);
    rimLightCyan.position.set(-4.5, 2.2, 3.5);
    scene.add(rimLightCyan);

    const rimLightRose = new THREE.PointLight(0xf43f5e, 16, 18);
    rimLightRose.position.set(4.5, -2.2, 3.2);
    scene.add(rimLightRose);

    // Floating 3D studio particles
    const particleCount = 140;
    const pPos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 14;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pPos[i * 3 + 2] = -1.5 - Math.random() * 5;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xfde047,
      size: 0.065,
      transparent: true,
      opacity: 0.65,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Outer static stage ring & stand
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const bezelGeo = new THREE.TorusGeometry(2.56, 0.16, 24, 96);
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
    bezelMesh.position.z = 0.05;
    stageGroup.add(bezelMesh);

    const goldRingGeo = new THREE.TorusGeometry(2.71, 0.04, 16, 96);
    const goldRingMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.9,
      roughness: 0.2,
    });
    const goldRing = new THREE.Mesh(goldRingGeo, goldRingMat);
    goldRing.position.z = 0.08;
    stageGroup.add(goldRing);

    // 24 Chasing 3D LED Bulbs
    const bulbGeo = new THREE.SphereGeometry(0.068, 16, 16);
    const bulbs: Array<{ mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }> = [];
    for (let b = 0; b < 24; b++) {
      const a = (b / 24) * Math.PI * 2;
      const mat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 0.9,
        roughness: 0.2,
      });
      const mesh = new THREE.Mesh(bulbGeo, mat);
      mesh.position.set(Math.cos(a) * 2.56, Math.sin(a) * 2.56, 0.21);
      stageGroup.add(mesh);
      bulbs.push({ mesh, mat });
    }

    // Rotating Wheel Group
    const wheelGroup = new THREE.Group();
    stageGroup.add(wheelGroup);

    // 3D Wheel Backing Drum
    const drumGeo = new THREE.CylinderGeometry(2.42, 2.42, 0.28, 72);
    drumGeo.rotateX(Math.PI / 2);
    const drumMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.5,
      roughness: 0.4,
    });
    const drumMesh = new THREE.Mesh(drumGeo, drumMat);
    drumMesh.position.z = -0.14;
    wheelGroup.add(drumMesh);

    // Front Wheel Face
    const faceGeo = new THREE.CircleGeometry(2.42, 96);
    const faceMat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.1,
    });
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.position.z = 0.01;
    wheelGroup.add(faceMesh);

    // Pegs at slice borders
    const pegsGroup = new THREE.Group();
    wheelGroup.add(pegsGroup);

    // Center 3D Medallion Cap
    const capGeo = new THREE.CylinderGeometry(0.46, 0.48, 0.16, 48);
    capGeo.rotateX(Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({
      metalness: 0.3,
      roughness: 0.25,
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.z = 0.08;
    stageGroup.add(capMesh);

    // Top 3D Pointer Flapper (12 o'clock)
    const pointerGroup = new THREE.Group();
    pointerGroup.position.set(0, 2.66, 0.24);
    stageGroup.add(pointerGroup);

    const coneGeo = new THREE.ConeGeometry(0.22, 0.56, 24);
    coneGeo.rotateZ(Math.PI);
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0x9f1239,
      emissiveIntensity: 0.45,
      metalness: 0.4,
      roughness: 0.25,
    });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    coneMesh.position.y = -0.18;
    pointerGroup.add(coneMesh);

    const pinGeo = new THREE.SphereGeometry(0.13, 20, 20);
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.9,
      roughness: 0.15,
    });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pointerGroup.add(pinMesh);

    sceneRefs.current = {
      wheelGroup,
      faceMesh,
      capMesh,
      pegsGroup,
      bulbs,
      pointerGroup,
      camera,
      rotZ: 0,
      pointerKickUntil: 0,
      spinState: {
        active: false,
        startTime: 0,
        duration: 22500,
        startAngle: 0,
        targetAngle: 0,
        lastSliceIdx: -1,
      },
    };

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let rafId = 0;
    const renderLoop = (now: number) => {
      rafId = requestAnimationFrame(renderLoop);
      const refs = sceneRefs.current;
      if (!refs) return;

      particles.rotation.z += 0.0006;

      // LED Chasing animation
      const ledSpeed = refs.spinState.active ? 90 : 320;
      const ledStep = Math.floor(now / ledSpeed);
      for (let i = 0; i < refs.bulbs.length; i++) {
        const lit = (i + ledStep) % 2 === 0;
        refs.bulbs[i].mat.emissiveIntensity = lit ? 1.8 : 0.12;
        refs.bulbs[i].mesh.scale.setScalar(lit ? 1.16 : 0.88);
      }

      if (refs.spinState.active) {
        const elapsed = now - refs.spinState.startTime;
        const t = Math.min(1, elapsed / refs.spinState.duration);
        // Ultra-dramatic ease-out curve for long suspense crawl
        const ease = 1 - Math.pow(1 - t, 4.2);
        const currentRot =
          refs.spinState.startAngle + (refs.spinState.targetAngle - refs.spinState.startAngle) * ease;
        refs.rotZ = currentRot;
        refs.wheelGroup.rotation.z = currentRot;
        callbacksRef.current.onProgressChange(t);

        const list = studentsRef.current;
        const count = Math.max(1, list.length);
        const sliceAngle = (Math.PI * 2) / count;
        const normalized = (((currentRot - Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const sliceIdx = Math.floor(normalized / sliceAngle) % count;

        if (sliceIdx !== refs.spinState.lastSliceIdx) {
          refs.spinState.lastSliceIdx = sliceIdx;
          refs.pointerKickUntil = now + 75;
          if (list[sliceIdx]) {
            callbacksRef.current.onPointerNameChange(list[sliceIdx].name);
          }
          if (!mutedRef.current) playWheelTick();
        }

        // Dramatic Camera Zoom toward 12 o'clock pointer in final 42%
        const zoomPhase = Math.max(0, (t - 0.58) / 0.42);
        const smoothZoom = zoomPhase * zoomPhase * (3 - 2 * zoomPhase);
        const camY = THREE.MathUtils.lerp(-1.35, 1.45, smoothZoom);
        const camZ = THREE.MathUtils.lerp(7.1, 4.35, smoothZoom);
        const lookY = THREE.MathUtils.lerp(0.15, 1.6, smoothZoom);
        refs.camera.position.set(0, camY, camZ);
        refs.camera.lookAt(0, lookY, 0);

        if (t >= 1) {
          refs.spinState.active = false;
          callbacksRef.current.onSpinStateChange(false);
          const winner = list[sliceIdx];
          if (winner) callbacksRef.current.onPickStudent(winner);
        }
      } else {
        // Gentle idle studio camera float back to overview
        refs.camera.position.x = Math.sin(now * 0.0005) * 0.18;
        refs.camera.position.y = THREE.MathUtils.lerp(refs.camera.position.y, -1.35, 0.05);
        refs.camera.position.z = THREE.MathUtils.lerp(refs.camera.position.z, 6.9, 0.05);
        refs.camera.lookAt(0, 0.15, 0);
      }

      // Pointer flapper spring kick
      const targetPointerRot = now < refs.pointerKickUntil ? -0.45 : 0;
      refs.pointerGroup.rotation.z = THREE.MathUtils.lerp(
        refs.pointerGroup.rotation.z,
        targetPointerRot,
        0.38,
      );

      renderer.render(scene, refs.camera);
    };

    rafId = requestAnimationFrame(renderLoop);
    setWebglReady(true);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.dispose();
      pGeo.dispose();
      pMat.dispose();
      bezelGeo.dispose();
      bezelMat.dispose();
      goldRingGeo.dispose();
      goldRingMat.dispose();
      bulbGeo.dispose();
      bulbs.forEach((b) => b.mat.dispose());
      drumGeo.dispose();
      drumMat.dispose();
      faceGeo.dispose();
      faceMat.dispose();
      capGeo.dispose();
      capMat.dispose();
      coneGeo.dispose();
      coneMat.dispose();
      pinGeo.dispose();
      pinMat.dispose();
      sceneRefs.current = null;
    };
  }, []);

  // Update textures & pegs when students/palette/emoji change
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs || !webglReady) return;

    const faceTex = buildWheelFaceTexture(students, palette);
    const faceMat = refs.faceMesh.material as THREE.MeshStandardMaterial;
    faceMat.map?.dispose();
    faceMat.map = faceTex;
    faceMat.needsUpdate = true;

    const capTex = buildEmojiCapTexture(centerEmoji);
    const capMat = refs.capMesh.material as THREE.MeshStandardMaterial;
    capMat.map?.dispose();
    capMat.map = capTex;
    capMat.needsUpdate = true;

    // Rebuild slice border pegs
    while (refs.pegsGroup.children.length > 0) {
      const child = refs.pegsGroup.children[0] as THREE.Mesh;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      refs.pegsGroup.remove(child);
    }

    const count = Math.max(1, students.length);
    const pegGeo = new THREE.SphereGeometry(0.045, 10, 10);
    const pegMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.8,
      roughness: 0.2,
    });
    for (let i = 0; i < count; i++) {
      const angle = -(i / count) * Math.PI * 2;
      const peg = new THREE.Mesh(pegGeo, pegMat);
      peg.position.set(Math.cos(angle) * 2.34, Math.sin(angle) * 2.34, 0.06);
      refs.pegsGroup.add(peg);
    }
  }, [students, palette, centerEmoji, webglReady]);

  // Trigger spin when spinTrigger increments
  useEffect(() => {
    if (spinTrigger === 0) return;
    const refs = sceneRefs.current;
    if (!refs || refs.spinState.active) return;

    const list = studentsRef.current;
    if (list.length === 0) return;
    if (list.length === 1) {
      callbacksRef.current.onPickStudent(list[0]);
      return;
    }

    const duration = PACE_META[paceRef.current].wheelMs;
    const extraLoops = paceRef.current === 'EPIC' ? 15 + cryptoRandomInt(4) : paceRef.current === 'NORMAL' ? 10 + cryptoRandomInt(3) : 6 + cryptoRandomInt(2);
    const extraSpins = extraLoops * Math.PI * 2;
    const randomOffset = (cryptoRandomInt(3600) / 3600) * Math.PI * 2;

    refs.spinState = {
      active: true,
      startTime: performance.now(),
      duration,
      startAngle: refs.rotZ,
      targetAngle: refs.rotZ + extraSpins + randomOffset,
      lastSliceIdx: -1,
    };
    callbacksRef.current.onSpinStateChange(true);
    callbacksRef.current.onProgressChange(0);
  }, [spinTrigger]);

  return (
    <div
      ref={mountRef}
      className="w-full h-[380px] sm:h-[480px] lg:h-[520px] relative select-none"
    />
  );
};
