import * as THREE from 'three';

/**
 * Interactive 3D Holographic Particle Loader using Three.js
 * Renders an ethereal, pulsating swarm of particles that gradually crystallizes
 * into an object silhouette as generation progress approaches 100%.
 */
export class Loader3D {
  constructor(containerElement) {
    this.container = containerElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.particles = null;
    this.animationId = null;
    this.progress = 0.15;
    this.clock = new THREE.Clock();

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 4.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Create Particles
    const particleCount = 2400;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const targetPositions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorA = new THREE.Color(0x94a3b8);
    const colorB = new THREE.Color(0x3b82f6);

    for (let i = 0; i < particleCount; i++) {
      // Initial spread positions (chaotic cloud)
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 2.0 + Math.random() * 1.5;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Target positions (smooth crystalline torus / object core)
      const tTheta = Math.random() * Math.PI * 2;
      const tPhi = Math.random() * Math.PI * 2;
      const tubeR = 0.4;
      const ringR = 1.1;
      targetPositions[i * 3] = (ringR + tubeR * Math.cos(tPhi)) * Math.cos(tTheta);
      targetPositions[i * 3 + 1] = (ringR + tubeR * Math.cos(tPhi)) * Math.sin(tTheta);
      targetPositions[i * 3 + 2] = tubeR * Math.sin(tPhi);

      // Gradient colors
      const mixed = colorA.clone().lerp(colorB, Math.random());
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('targetPosition', new THREE.BufferAttribute(targetPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle Material
    const material = new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);

    // Subtle core ring
    const ringGeo = new THREE.RingGeometry(1.05, 1.07, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x64748b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
    });
    this.coreRing = new THREE.Mesh(ringGeo, ringMat);
    this.scene.add(this.coreRing);

    // Handle Resize
    this.onResize = () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.onResize);

    this.animate();
  }

  setProgress(percent) {
    this.progress = Math.min(Math.max(percent / 100, 0.05), 1.0);
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    const time = this.clock.getElapsedTime();

    if (this.particles) {
      this.particles.rotation.y = time * 0.35;
      this.particles.rotation.x = Math.sin(time * 0.25) * 0.2;

      const posAttr = this.particles.geometry.attributes.position;
      const targetAttr = this.particles.geometry.attributes.targetPosition;

      // Interpolate positions toward target as progress advances
      const factor = THREE.MathUtils.lerp(0.1, 0.95, this.progress);
      for (let i = 0; i < posAttr.count; i++) {
        const tx = targetAttr.getX(i);
        const ty = targetAttr.getY(i);
        const tz = targetAttr.getZ(i);

        let cx = posAttr.getX(i);
        let cy = posAttr.getY(i);
        let cz = posAttr.getZ(i);

        // Breathing noise wave
        const wave = Math.sin(time * 3.0 + i) * 0.02 * (1.0 - this.progress * 0.8);

        cx += (tx - cx) * 0.03 * factor + wave;
        cy += (ty - cy) * 0.03 * factor + wave;
        cz += (tz - cz) * 0.03 * factor + wave;

        posAttr.setXYZ(i, cx, cy, cz);
      }
      posAttr.needsUpdate = true;
    }

    if (this.coreRing) {
      this.coreRing.rotation.z = -time * 0.5;
      this.coreRing.rotation.y = Math.cos(time * 0.3) * 0.3;
      const s = 1.0 + Math.sin(time * 2.0) * 0.05 * (1.0 - this.progress * 0.5);
      this.coreRing.scale.set(s, s, s);
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.onResize);
    if (this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
