import * as THREE from 'three';

/**
 * Off-Axis Projection (Generalized Perspective Projection) Engine
 * Based on Robert Kooima's formulation:
 * "Generalized Perspective Projection", 2009.
 * 
 * Treats the computer screen as a fixed "Virtual Window".
 * The camera position matches the user's physical eye position,
 * and the frustum boundaries (left, right, bottom, top) are dynamically calculated
 * to create an asymmetric frustum perfectly anchored to the screen frame.
 */
export class OffAxisProjection {
  constructor(camera, options = {}) {
    this.camera = camera;
    // Physical virtual screen size (in Three.js world units)
    this.screenHeight = options.screenHeight || 1.8; // Base height of the virtual window
    this.screenWidth = this.screenHeight * (camera.aspect || 16 / 9);
    this.near = options.near || 0.1;
    this.far = options.far || 100.0;
    this.depthScale = options.depthScale || 1.4; // Multiplier for depth perception

    // Base eye distance from screen in world units
    this.baseEyeDist = options.baseEyeDist || 2.8;
  }

  updateScreenDimensions(aspectRatio) {
    this.screenWidth = this.screenHeight * aspectRatio;
  }

  setDepthScale(scale) {
    this.depthScale = Math.max(0.2, scale);
  }

  /**
   * Applies off-axis projection to the camera given normalized head coordinates.
   * @param {Object} headPos - { x: -1 to 1, y: -1 to 1, z: ~0.5 to 2.0 }
   */
  apply(headPos) {
    // Convert normalized head tracker coords to Three.js world coordinates
    const eyeX = headPos.x * (this.screenWidth * 0.5) * this.depthScale;
    const eyeY = headPos.y * (this.screenHeight * 0.5) * this.depthScale;
    const eyeZ = Math.max(headPos.z * this.baseEyeDist, this.near * 1.5);

    // Place camera at user's eye position
    this.camera.position.set(eyeX, eyeY, eyeZ);

    // Camera faces straight forward toward the screen plane (Z = 0)
    this.camera.rotation.set(0, 0, 0);

    // Kooima's asymmetric frustum bounds at the near plane
    const left = this.near * (-this.screenWidth * 0.5 - eyeX) / eyeZ;
    const right = this.near * (this.screenWidth * 0.5 - eyeX) / eyeZ;
    const bottom = this.near * (-this.screenHeight * 0.5 - eyeY) / eyeZ;
    const top = this.near * (this.screenHeight * 0.5 - eyeY) / eyeZ;

    // Construct asymmetric perspective projection matrix
    this.camera.projectionMatrix.makePerspective(left, right, top, bottom, this.near, this.far);
  }
}
