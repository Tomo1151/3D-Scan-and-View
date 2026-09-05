import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

/**
 * 3DGS Scene and Virtual Window Viewer
 * Renders the scanned 3DGS object inside a virtual recessed room box,
 * providing the rich depth cues required for convincing Off-Axis 3D illusions.
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

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00f0ff, 1.2);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x9d4edd, 0.8);
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
   * Loads a 3DGS PLY file into the virtual diorama
   * Uses Three.js PLYLoader with Gaussian Splat SH coloring fallback.
   */
  async loadSplat(plyUrl) {
    console.log("Loading 3DGS model from:", plyUrl);

    // Remove existing splat
    if (this.splatObject) {
      this.scene.remove(this.splatObject);
      this.splatObject = null;
    }

    // Try using @mkkellogg/gaussian-splats-3d if available in scope
    if (window.GaussianSplats3D) {
      try {
        const viewer = new window.GaussianSplats3D.Viewer({
          selfDrivenMode: false,
          useBuiltInControls: false,
          rootElement: this.container,
          camera: this.camera,
          scene: this.scene,
          renderer: this.renderer,
        });
        await viewer.addSplatScene(plyUrl, {
          splatAlphaRemovalThreshold: 5,
          position: [0, 0, -1.0],
          scale: [1, 1, 1],
        });
        this.splatObject = viewer;
        console.log("Loaded with GaussianSplats3D Viewer");
        return;
      } catch (e) {
        console.warn("GaussianSplats3D viewer failed, falling back to Three.js PLY points loader:", e);
      }
    }

    // High-performance Three.js Points / Splat renderer fallback
    const loader = new PLYLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        plyUrl,
        (geometry) => {
          geometry.computeVertexNormals();
          geometry.center();

          // Compute bounding box and normalize scale to fit diorama box
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox;
          const maxDim = Math.max(
            bbox.max.x - bbox.min.x,
            bbox.max.y - bbox.min.y,
            bbox.max.z - bbox.min.z
          );
          const scaleFactor = 1.5 / Math.max(maxDim, 0.001);

          // Check for colors in PLY attributes
          let hasColors = geometry.hasAttribute('color');

          const material = new THREE.PointsMaterial({
            size: 0.022,
            vertexColors: hasColors,
            color: hasColors ? 0xffffff : 0x00f0ff,
            transparent: true,
            opacity: 0.95,
            depthWrite: true,
          });

          const points = new THREE.Points(geometry, material);
          points.scale.set(scaleFactor, scaleFactor, scaleFactor);
          // Position inside the virtual window (Z = -0.9, slightly recessed into the box)
          points.position.set(0, 0, -0.9);

          this.splatObject = points;
          this.scene.add(this.splatObject);
          console.log("Loaded PLY Points Cloud into scene with vertices:", geometry.attributes.position.count);
          resolve(points);
        },
        undefined,
        (err) => {
          console.error("Error loading PLY:", err);
          reject(err);
        }
      );
    });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
