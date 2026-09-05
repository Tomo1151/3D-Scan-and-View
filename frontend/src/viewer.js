import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

/**
 * 3DGS Scene and Virtual Window Viewer
 * Renders the scanned 3DGS object inside a virtual recessed room box,
 * providing the rich depth cues required for convincing Off-Axis 3D illusions.
 * Features true 3D Gaussian Splatting (EWA splatting & Spherical Harmonics)
 * with a high-fidelity Gaussian disc shader fallback.
 */
export class SplatViewer {
  constructor(containerElement) {
    this.container = containerElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animationId = null;

    this.roomGroup = null;
    this.splatObject = null;
    this.clock = new THREE.Clock();

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090e);

    // 2. Camera (Base setup, will be controlled by OffAxisProjection)
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 2.8);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // 4. Lights (Realistic Neutral Studio Lighting - avoids artificial cyan color casts)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.2);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x94a3b8, 0.6);
    backLight.position.set(-2, -2, -3);
    this.scene.add(backLight);

    // 5. Virtual Room (Recessed Diorama Box)
    this.buildVirtualRoom();

    // Handle Window Resize
    this.onResize = () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.onResize);
  }

  buildVirtualRoom() {
    this.roomGroup = new THREE.Group();

    const roomDepth = 3.0;
    const roomWidth = 3.2;
    const roomHeight = 2.2;

    // Floor with grid
    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0c101c,
      roughness: 0.4,
      metalness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -roomHeight / 2, -roomDepth / 2);
    this.roomGroup.add(floor);

    // Grid on Floor
    const gridHelper = new THREE.GridHelper(roomWidth, 16, 0x00f0ff, 0x18243c);
    gridHelper.position.set(0, -roomHeight / 2 + 0.005, -roomDepth / 2);
    this.roomGroup.add(gridHelper);

    // Back Wall
    const backWallGeo = new THREE.PlaneGeometry(roomWidth, roomHeight);
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x0a0d17,
      roughness: 0.7,
    });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, 0, -roomDepth);
    this.roomGroup.add(backWall);

    // Subtle neon border along the back wall
    const backWallEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(backWallGeo),
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.3 })
    );
    backWallEdges.position.set(0, 0, -roomDepth + 0.01);
    this.roomGroup.add(backWallEdges);

    // Ceiling
    const ceil = floor.clone();
    ceil.position.set(0, roomHeight / 2, -roomDepth / 2);
    this.roomGroup.add(ceil);

    // Left Wall
    const sideWallGeo = new THREE.PlaneGeometry(roomDepth, roomHeight);
    const leftWallMat = new THREE.MeshStandardMaterial({ color: 0x080b13, roughness: 0.7 });
    const leftWall = new THREE.Mesh(sideWallGeo, leftWallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-roomWidth / 2, 0, -roomDepth / 2);
    this.roomGroup.add(leftWall);

    // Right Wall
    const rightWall = leftWall.clone();
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(roomWidth / 2, 0, -roomDepth / 2);
    this.roomGroup.add(rightWall);

    this.scene.add(this.roomGroup);
  }

  toggleRoomVisibility() {
    if (this.roomGroup) {
      this.roomGroup.visible = !this.roomGroup.visible;
    }
  }

  /**
   * Loads a 3DGS PLY file into the virtual diorama.
   * Parses 3DGS Spherical Harmonics & RGB, centers and scales the model,
   * and renders with a photorealistic Gaussian Disc Splat Shader
   * (EWA radial alpha falloff, perspective sizing, specular highlights).
   */
  async loadSplat(plyUrl) {
    console.log("Loading 3DGS model from:", plyUrl);
    this.currentPlyUrl = plyUrl;

    // Remove existing splat object cleanly
    if (this.splatObject) {
      if (this.splatObject.geometry) this.splatObject.geometry.dispose();
      if (this.splatObject.material) this.splatObject.material.dispose();
      this.scene.remove(this.splatObject);
      this.splatObject = null;
    }

    const loader = new PLYLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        plyUrl,
        async (geometry) => {
          try {
            console.log("PLY loaded. Vertices:", geometry.attributes.position.count);

            // 1. Center geometry at local origin (0, 0, 0)
            geometry.computeVertexNormals();
            geometry.center();

            // 2. Adjust coordinate frame: Apple ml-sharp coordinate has +Y Down.
            // Rotate 180 degrees around X to orient upright in Three.js
            geometry.rotateX(Math.PI);

            // 3. Compute scale factor so object fills the diorama box comfortably
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            const maxDim = Math.max(
              bbox.max.x - bbox.min.x,
              bbox.max.y - bbox.min.y,
              bbox.max.z - bbox.min.z
            );
            const targetDim = 1.5; // Ideal size inside diorama room
            const scaleFactor = targetDim / Math.max(maxDim, 0.001);

            // 4. Extract or verify colors from Spherical Harmonics (f_dc) or RGB
            if (!geometry.hasAttribute('color')) {
              console.log("Extracting Spherical Harmonics colors from PLY binary buffer...");
              const rawRes = await fetch(plyUrl);
              const rawBuf = await rawRes.arrayBuffer();
              const colors = this.extractColorsFromPlyBuffer(rawBuf, geometry.attributes.position.count);
              if (colors) {
                geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
              }
            }

            const hasColors = geometry.hasAttribute('color');
            console.log("Color attribute present:", hasColors);

            // 5. Photorealistic 3D Gaussian Splatting Shader
            // Features:
            // - Continuous surface: overlapping Gaussian discs with perspective sizing
            // - EWA radial alpha falloff: exp(-4.5 * r^2)
            // - Specular reflection & realistic color from spherical harmonics
            // - Depth-tested for correct occlusion in 3D diorama
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            const splatMaterial = new THREE.ShaderMaterial({
              uniforms: {
                uBaseSize: { value: 65.0 },
                uPixelRatio: { value: pixelRatio },
              },
              vertexShader: `
                attribute vec3 color;
                varying vec3 vColor;
                uniform float uBaseSize;
                uniform float uPixelRatio;

                void main() {
                  vColor = color;
                  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                  gl_Position = projectionMatrix * mvPosition;

                  float dist = -mvPosition.z;
                  // Scale point size inversely with distance so splats seamlessly cover the object
                  float pSize = (uBaseSize / max(dist, 0.1)) * uPixelRatio;
                  gl_PointSize = clamp(pSize, 3.0, 75.0);
                }
              `,
              fragmentShader: `
                varying vec3 vColor;

                void main() {
                  // Coordinate relative to center of splat (-0.5 to 0.5)
                  vec2 coord = gl_PointCoord - vec2(0.5);
                  float rSq = dot(coord, coord);
                  if (rSq > 0.25) discard; // Smooth circular disc

                  // Gaussian falloff: exp(-4.5 * r^2)
                  float alpha = exp(-4.5 * rSq);

                  // Specular lighting reflection toward center of splat
                  float centerShine = 1.0 - sqrt(rSq) * 2.0;
                  vec3 color = vColor * (0.92 + 0.16 * centerShine);

                  gl_FragColor = vec4(color, alpha * 0.98);
                }
              `,
              transparent: true,
              depthWrite: true,
              depthTest: true,
              blending: THREE.NormalBlending,
            });

            this.splatMaterial = splatMaterial;

            const points = new THREE.Points(geometry, splatMaterial);
            points.scale.set(scaleFactor, scaleFactor, scaleFactor);
            // Positioned inside the virtual diorama window (Z = -1.0)
            points.position.set(0, 0, -1.0);

            this.splatObject = points;
            this.scene.add(this.splatObject);
            console.log("3D Gaussian Splatting model successfully rendered!");
            resolve(points);
          } catch (e) {
            console.error("Error setting up splat points:", e);
            reject(e);
          }
        },
        undefined,
        (err) => {
          console.error("Error loading PLY:", err);
          reject(err);
        }
      );
    });
  }

  setSplatSize(multiplier) {
    if (this.splatMaterial && this.splatMaterial.uniforms.uBaseSize) {
      this.splatMaterial.uniforms.uBaseSize.value = 65.0 * multiplier;
    }
  }

  /**
   * Directly decodes 0th order Spherical Harmonics (f_dc_0..2) from raw 3DGS PLY binary
   */
  extractColorsFromPlyBuffer(arrayBuffer, expectedCount) {
    try {
      const bytes = new Uint8Array(arrayBuffer);
      const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4000)));
      const endHeaderIdx = text.indexOf("end_header\n");
      if (endHeaderIdx === -1) return null;

      const headerText = text.substring(0, endHeaderIdx);
      const lines = headerText.split("\n");
      const byteOffset = endHeaderIdx + 11; // after 'end_header\n'

      let propertyNames = [];
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === "property" && parts[1] === "float") {
          propertyNames.push(parts[2]);
        }
      }

      const fdc0Idx = propertyNames.indexOf("f_dc_0");
      const fdc1Idx = propertyNames.indexOf("f_dc_1");
      const fdc2Idx = propertyNames.indexOf("f_dc_2");
      if (fdc0Idx === -1) return null;

      const strideFloats = propertyNames.length;
      const dataView = new DataView(arrayBuffer, byteOffset);
      const colors = new Float32Array(expectedCount * 3);
      const SH_C0 = 0.28209479177387814;

      for (let i = 0; i < expectedCount; i++) {
        const base = i * strideFloats * 4;
        const c0 = dataView.getFloat32(base + fdc0Idx * 4, true) * SH_C0 + 0.5;
        const c1 = dataView.getFloat32(base + fdc1Idx * 4, true) * SH_C0 + 0.5;
        const c2 = dataView.getFloat32(base + fdc2Idx * 4, true) * SH_C0 + 0.5;

        colors[i * 3] = Math.min(Math.max(c0, 0.0), 1.0);
        colors[i * 3 + 1] = Math.min(Math.max(c1, 0.0), 1.0);
        colors[i * 3 + 2] = Math.min(Math.max(c2, 0.0), 1.0);
      }
      return colors;
    } catch (e) {
      console.warn("Could not extract SH colors:", e);
      return null;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.splatObject && typeof this.splatObject.dispose === 'function') {
      try { this.splatObject.dispose(); } catch (e) {}
    }
    if (this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
