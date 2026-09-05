/**
 * Head Tracking Module using MediaPipe Face Mesh with Mouse and Gyroscope Fallbacks
 */

export class HeadTracker {
  constructor(videoElement, canvasElement, coordsElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.coordsEl = coordsElement;
    this.mode = "face"; // "face" | "mouse" | "gyro"

    // Raw and Smoothed Normalized Position (-1 to 1 for X/Y, ~0.5 to 2.0 for Z distance)
    this.rawPos = { x: 0, y: 0, z: 1.0 };
    this.pos = { x: 0, y: 0, z: 1.0 };

    this.isTracking = false;
    this.faceMesh = null;
    this.cameraUtils = null;

    // Mouse tracking handlers
    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onDeviceOrientation = this.handleDeviceOrientation.bind(this);
  }

  async start(mode = "face") {
    this.mode = mode;
    this.isTracking = true;

    if (this.mode === "face") {
      await this.initFaceMesh();
    } else if (this.mode === "mouse") {
      this.initMouseTracking();
    } else if (this.mode === "gyro") {
      this.initGyroTracking();
    }
  }

  setMode(mode) {
    this.stop();
    return this.start(mode);
  }

  async initFaceMesh() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("navigator.mediaDevices unavailable (non-HTTPS). Falling back to mouse/gyro tracking.");
      this.mode = "mouse";
      this.initMouseTracking();
      return;
    }

    if (!window.FaceMesh) {
      console.warn("MediaPipe FaceMesh not loaded. Falling back to mouse tracking.");
      this.mode = "mouse";
      this.initMouseTracking();
      return;
    }

    try {
      this.faceMesh = new window.FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.faceMesh.onResults(this.onFaceMeshResults.bind(this));

      // Request user-facing camera for tracking
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();

      if (window.Camera) {
        this.cameraUtils = new window.Camera(this.video, {
          onFrame: async () => {
            if (this.isTracking && this.mode === "face") {
              await this.faceMesh.send({ image: this.video });
            }
          },
          width: 320,
          height: 240,
        });
        this.cameraUtils.start();
      }
    } catch (err) {
      console.warn("Face tracking camera access failed, falling back to mouse:", err);
      this.mode = "mouse";
      this.initMouseTracking();
    }
  }

  onFaceMeshResults(results) {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext("2d");
    this.canvas.width = this.video.videoWidth || 320;
    this.canvas.height = this.video.videoHeight || 240;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];

      // Nose tip (index 1), Left eye outer (index 33), Right eye outer (index 263)
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];

      // Estimate distance Z based on interocular distance
      const dx = rightEye.x - leftEye.x;
      const dy = rightEye.y - leftEye.y;
      const eyeDist = Math.sqrt(dx * dx + dy * dy);
      // Average eye distance in normalized screen space is ~0.25 at standard 50cm viewing
      const estimatedZ = THREE_clamp(0.22 / Math.max(eyeDist, 0.05), 0.5, 2.5);

      // Inverted X because webcam is mirrored
      this.rawPos.x = -(nose.x - 0.5) * 2.0;
      this.rawPos.y = -(nose.y - 0.5) * 2.0;
      this.rawPos.z = estimatedZ;

      // Draw debug points on mini canvas
      ctx.fillStyle = "#00f0ff";
      ctx.beginPath();
      ctx.arc(nose.x * this.canvas.width, nose.y * this.canvas.height, 4, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = "#00ffaa";
      ctx.beginPath();
      ctx.arc(leftEye.x * this.canvas.width, leftEye.y * this.canvas.height, 3, 0, 2 * Math.PI);
      ctx.arc(rightEye.x * this.canvas.width, rightEye.y * this.canvas.height, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  initMouseTracking() {
    window.addEventListener("mousemove", this.onMouseMove);
  }

  handleMouseMove(e) {
    if (this.mode !== "mouse") return;
    const nx = (e.clientX / window.innerWidth - 0.5) * 2.0;
    const ny = -(e.clientY / window.innerHeight - 0.5) * 2.0;
    this.rawPos.x = nx * 1.2;
    this.rawPos.y = ny * 1.2;
    this.rawPos.z = 1.0;
  }

  initGyroTracking() {
    if (window.DeviceOrientationEvent) {
      // iOS 13+ permission request
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then((response) => {
            if (response === 'granted') {
              window.addEventListener("deviceorientation", this.onDeviceOrientation);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener("deviceorientation", this.onDeviceOrientation);
      }
    }
  }

  handleDeviceOrientation(e) {
    if (this.mode !== "gyro") return;
    // gamma: left-to-right (-90 to 90)
    // beta: front-to-back (-180 to 180)
    const gamma = THREE_clamp(e.gamma || 0, -45, 45) / 45;
    const beta = THREE_clamp((e.beta || 45) - 45, -45, 45) / 45;
    this.rawPos.x = gamma * 1.2;
    this.rawPos.y = -beta * 1.2;
    this.rawPos.z = 1.0;
  }

  /**
   * Updates smoothed position with LERP (call every frame)
   */
  update(lerpFactor = 0.12) {
    this.pos.x += (this.rawPos.x - this.pos.x) * lerpFactor;
    this.pos.y += (this.rawPos.y - this.pos.y) * lerpFactor;
    this.pos.z += (this.rawPos.z - this.pos.z) * lerpFactor;

    if (this.coordsEl) {
      this.coordsEl.textContent = `X: ${this.pos.x.toFixed(2)} | Y: ${this.pos.y.toFixed(2)} | Z: ${this.pos.z.toFixed(2)}`;
    }

    return this.pos;
  }

  reset() {
    this.rawPos = { x: 0, y: 0, z: 1.0 };
    this.pos = { x: 0, y: 0, z: 1.0 };
  }

  stop() {
    this.isTracking = false;
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("deviceorientation", this.onDeviceOrientation);

    if (this.cameraUtils) {
      try { this.cameraUtils.stop(); } catch (_) {}
      this.cameraUtils = null;
    }
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((t) => t.stop());
      this.video.srcObject = null;
    }
  }
}

function THREE_clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
