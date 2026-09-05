/**
 * Main Application Controller
 * Orchestrates Capture, 3D Hologram Loading, and Off-Axis Virtual Window Viewing
 */

import { checkHealth, uploadScan, pollJobStatus } from './api.js';
import { CameraManager } from './camera.js';
import { Loader3D } from './loader3d.js';
import { HeadTracker } from './tracker.js';
import { OffAxisProjection } from './offaxis.js';
import { SplatViewer } from './viewer.js';

class App {
  constructor() {
    this.currentView = "capture"; // "capture" | "loading" | "viewer"
    this.capturedBlob = null;

    // Subsystems
    this.cameraManager = null;
    this.loader3d = null;
    this.splatViewer = null;
    this.offAxis = null;
    this.headTracker = null;

    this.initElements();
    this.initSubsystems();
    this.bindEvents();
    this.runInitialDiagnostics();
  }

  initElements() {
    // Views
    this.viewCapture = document.getElementById("viewCapture");
    this.viewLoading = document.getElementById("viewLoading");
    this.viewViewer = document.getElementById("viewViewer");

    // HUD Elements
    this.deviceText = document.getElementById("deviceText");
    this.cacheText = document.getElementById("cacheText");
    this.trackerText = document.getElementById("trackerText");
    this.btnSwitchMode = document.getElementById("btnSwitchMode");
    this.btnFullscreen = document.getElementById("btnFullscreen");

    // Capture Elements
    this.cameraVideo = document.getElementById("cameraVideo");
    this.cameraCanvas = document.getElementById("cameraCanvas");
    this.btnShutter = document.getElementById("btnShutter");
    this.btnFlipCamera = document.getElementById("btnFlipCamera");
    this.fileInput = document.getElementById("fileInput");
    this.selectRotation = document.getElementById("selectRotation");
    this.capturedPreviewWrap = document.getElementById("capturedPreviewWrap");
    this.capturedImage = document.getElementById("capturedImage");
    this.captureActionButtons = document.getElementById("captureActionButtons");
    this.btnRetake = document.getElementById("btnRetake");
    this.btnGenerate3D = document.getElementById("btnGenerate3D");

    // Loading Elements
    this.loadingCanvas = document.getElementById("loading3DCanvas");
    this.loadingProgressBar = document.getElementById("loadingProgressBar");
    this.loadingProgressPercent = document.getElementById("loadingProgressPercent");
    this.loadingMessage = document.getElementById("loadingMessage");
    this.stepSegment = document.getElementById("stepSegment");
    this.step3DGS = document.getElementById("step3DGS");
    this.stepClean = document.getElementById("stepClean");
    this.stepRender = document.getElementById("stepRender");

    // Viewer Elements
    this.viewerCanvasContainer = document.getElementById("viewerCanvasContainer");
    this.btnTrackFace = document.getElementById("btnTrackFace");
    this.btnTrackMouse = document.getElementById("btnTrackMouse");
    this.btnTrackGyro = document.getElementById("btnTrackGyro");
    this.sliderDepthScale = document.getElementById("sliderDepthScale");
    this.labelDepthScale = document.getElementById("labelDepthScale");
    this.sliderSplatSize = document.getElementById("sliderSplatSize");
    this.labelSplatSize = document.getElementById("labelSplatSize");
    this.btnResetView = document.getElementById("btnResetView");
    this.btnToggleRoom = document.getElementById("btnToggleRoom");
    this.btnOpenSuperSplat = document.getElementById("btnOpenSuperSplat");
    this.btnDownloadPly = document.getElementById("btnDownloadPly");

    // PiP Tracker
    this.trackingVideo = document.getElementById("trackingVideo");
    this.trackingCanvas = document.getElementById("trackingCanvas");
    this.pipCoords = document.getElementById("pipCoords");
    this.faceTrackerPip = document.getElementById("faceTrackerPip");
    this.btnMinimizePip = document.getElementById("btnMinimizePip");

    // Toast
    this.toastEl = document.getElementById("toast");
  }

  initSubsystems() {
    // 1. Camera Manager
    this.cameraManager = new CameraManager(this.cameraVideo, this.cameraCanvas);
    this.cameraManager.start().catch((err) => {
      console.warn("Camera init failed:", err);
      this.showToast(err.message || "カメラを起動できませんでした。ファイル選択をご利用ください。", 6000);
    });

    // 2. 3D Loading Swarm
    this.loader3d = new Loader3D(this.loadingCanvas);

    // 3. 3DGS & Virtual Room Viewer
    this.splatViewer = new SplatViewer(this.viewerCanvasContainer);

    // 4. Off-Axis Projection Engine
    this.offAxis = new OffAxisProjection(this.splatViewer.camera, {
      depthScale: parseFloat(this.sliderDepthScale.value),
    });

    // 5. Head Tracker (MediaPipe + Fallbacks)
    this.headTracker = new HeadTracker(this.trackingVideo, this.trackingCanvas, this.pipCoords);

    // Start Viewer Render Loop
    this.startViewerLoop();
  }

  async runInitialDiagnostics() {
    const health = await checkHealth();
    if (health && health.device) {
      const dev = health.device.selected_device.toUpperCase();
      this.deviceText.textContent = `DEVICE: ${dev}`;
      if (dev === "CUDA" || dev === "MPS") {
        document.getElementById("devicePill").querySelector(".dot").className = "dot green";
      }

      if (health.checkpoint_cached) {
        this.cacheText.textContent = "CACHE: ACTIVE (24h)";
      } else {
        this.cacheText.textContent = "CACHE: WILL SYNC";
      }
    } else {
      this.deviceText.textContent = "DEVICE: STANDALONE";
    }
  }

  bindEvents() {
    // Shutter capture
    this.btnShutter.addEventListener("click", async () => {
      try {
        const blob = await this.cameraManager.captureFrameBlob();
        this.setCapturedBlob(blob);
      } catch (err) {
        this.showToast("キャプチャに失敗しました。");
      }
    });

    // Flip Camera
    this.btnFlipCamera.addEventListener("click", () => {
      this.cameraManager.flipCamera().catch(() => {
        this.showToast("カメラ切り替えに失敗しました。");
      });
    });

    // File Input
    this.fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        this.setCapturedBlob(file);
      }
    });

    // Retake
    this.btnRetake.addEventListener("click", () => {
      this.capturedBlob = null;
      this.capturedPreviewWrap.style.display = "none";
      this.btnShutter.style.display = "flex";
      this.captureActionButtons.style.display = "none";
    });

    // Start 3D Generation Pipeline
    this.btnGenerate3D.addEventListener("click", () => {
      if (!this.capturedBlob) return;
      const rotation = parseFloat(this.selectRotation.value) || 0;
      this.startPipeline(this.capturedBlob, rotation);
    });

    // Header Mode Switch
    this.btnSwitchMode.addEventListener("click", () => {
      this.switchView(this.currentView === "viewer" ? "capture" : "viewer");
    });

    // Fullscreen Toggle
    this.btnFullscreen.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });

    // Tracking Mode Buttons
    this.btnTrackFace.addEventListener("click", () => this.setTrackerMode("face"));
    this.btnTrackMouse.addEventListener("click", () => this.setTrackerMode("mouse"));
    this.btnTrackGyro.addEventListener("click", () => this.setTrackerMode("gyro"));

    // Depth Scale Slider
    this.sliderDepthScale.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      this.labelDepthScale.textContent = `${val.toFixed(1)}x`;
      this.offAxis.setDepthScale(val);
    });

    // Splat Density Slider
    if (this.sliderSplatSize) {
      this.sliderSplatSize.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        this.labelSplatSize.textContent = `${val.toFixed(1)}x`;
        this.splatViewer.setSplatSize(val);
      });
    }

    // Reset View
    this.btnResetView.addEventListener("click", () => {
      this.headTracker.reset();
      this.showToast("視点をリセットしました。");
    });

    // Toggle Room Diorama
    this.btnToggleRoom.addEventListener("click", () => {
      this.splatViewer.toggleRoomVisibility();
    });

    // Open in SuperSplat Editor
    if (this.btnOpenSuperSplat) {
      this.btnOpenSuperSplat.addEventListener("click", () => {
        window.open("https://superspl.at/editor", "_blank");
        this.showToast("SuperSplatを開きました！ダウンロードしたPLYファイルをドラッグ＆ドロップして高精細編集できます。", 6000);
      });
    }

    // Download PLY
    if (this.btnDownloadPly) {
      this.btnDownloadPly.addEventListener("click", () => {
        const url = this.currentPlyUrl || (this.splatViewer && this.splatViewer.currentPlyUrl);
        if (url) {
          const a = document.createElement("a");
          a.href = url;
          a.download = "3dgs_model.ply";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          this.showToast("3DGS PLYモデルのダウンロードを開始しました。");
        } else {
          this.showToast("まだ3Dモデルが生成されていません。");
        }
      });
    }

    // Minimize PiP
    this.btnMinimizePip.addEventListener("click", () => {
      this.faceTrackerPip.classList.toggle("minimized");
    });
  }

  setCapturedBlob(blob) {
    this.capturedBlob = blob;
    this.capturedImage.src = URL.createObjectURL(blob);
    this.capturedPreviewWrap.style.display = "block";
    this.btnShutter.style.display = "none";
    this.captureActionButtons.style.display = "flex";
  }

  switchView(viewName) {
    this.currentView = viewName;
    this.viewCapture.classList.remove("active");
    this.viewLoading.classList.remove("active");
    this.viewViewer.classList.remove("active");

    if (viewName === "capture") {
      this.viewCapture.classList.add("active");
      this.btnSwitchMode.querySelector(".label").textContent = "3D VIEW";
      this.cameraManager.start().catch(() => {});
    } else if (viewName === "loading") {
      this.viewLoading.classList.add("active");
      this.cameraManager.stop();
    } else if (viewName === "viewer") {
      this.viewViewer.classList.add("active");
      this.btnSwitchMode.querySelector(".label").textContent = "SCAN NEW";
      this.cameraManager.stop();
      this.headTracker.start(this.headTracker.mode);
      if (!this.splatViewer.splatObject) {
        this.splatViewer.loadSplat("/api/jobs/latest/model.ply")
          .then(() => {
            this.currentPlyUrl = "/api/jobs/latest/model.ply";
          })
          .catch((err) => {
            console.log("No previous scan available yet:", err);
          });
      }
    }
  }

  setTrackerMode(mode) {
    this.btnTrackFace.classList.toggle("active", mode === "face");
    this.btnTrackMouse.classList.toggle("active", mode === "mouse");
    this.btnTrackGyro.classList.toggle("active", mode === "gyro");

    this.headTracker.setMode(mode);
    this.trackerText.textContent = `TRACKER: ${mode.toUpperCase()}`;
    this.showToast(`トラッキングモードを「${mode.toUpperCase()}」に変更しました。`);
  }

  async startPipeline(blob, rotationDeg) {
    this.switchView("loading");
    this.resetLoadingUI();

    try {
      this.showToast("画像アップロード完了。3DGS再構成を開始します...");
      const scanRes = await uploadScan(blob, rotationDeg);
      const jobId = scanRes.job_id;

      // Poll job progress
      const completedJob = await pollJobStatus(jobId, (progressData) => {
        this.updateLoadingProgress(progressData);
      });

      // Pipeline completed successfully!
      this.showToast("3DGS生成完了！仮想空間を描画します。");
      this.loader3d.setProgress(100);

      // Load PLY into SplatViewer
      const plyUrl = completedJob.splat_url || `/api/jobs/${jobId}/model.ply`;
      this.currentPlyUrl = plyUrl;
      await this.splatViewer.loadSplat(plyUrl);

      // Transition to viewer
      setTimeout(() => {
        this.switchView("viewer");
      }, 800);

    } catch (err) {
      console.error("Pipeline failed:", err);
      this.showToast(`エラー: ${err.message}`);
      setTimeout(() => {
        this.switchView("capture");
      }, 3000);
    }
  }

  updateLoadingProgress(job) {
    const p = job.progress || 10;
    this.loadingProgressBar.style.width = `${p}%`;
    this.loadingProgressPercent.textContent = `${p}%`;
    if (job.message) this.loadingMessage.textContent = job.message;
    this.loader3d.setProgress(p);

    // Update Stepper
    const st = job.status;
    if (st === "segmenting") {
      this.stepSegment.className = "step-item active";
    } else if (st === "generating_3dgs") {
      this.stepSegment.className = "step-item completed";
      this.step3DGS.className = "step-item active";
    } else if (st === "cleaning_ply") {
      this.stepSegment.className = "step-item completed";
      this.step3DGS.className = "step-item completed";
      this.stepClean.className = "step-item active";
    } else if (st === "completed") {
      this.stepSegment.className = "step-item completed";
      this.step3DGS.className = "step-item completed";
      this.stepClean.className = "step-item completed";
      this.stepRender.className = "step-item completed";
    }
  }

  resetLoadingUI() {
    this.loadingProgressBar.style.width = "10%";
    this.loadingProgressPercent.textContent = "10%";
    this.loadingMessage.textContent = "処理を開始しています...";
    this.stepSegment.className = "step-item active";
    this.step3DGS.className = "step-item";
    this.stepClean.className = "step-item";
    this.stepRender.className = "step-item";
    this.loader3d.setProgress(10);
  }

  startViewerLoop() {
    const loop = () => {
      requestAnimationFrame(loop);

      if (this.currentView === "viewer") {
        // 1. Update smoothed head position
        const headPos = this.headTracker.update();

        // 2. Apply Off-Axis Projection to camera
        this.offAxis.apply(headPos);

        // 3. Render 3D Scene
        this.splatViewer.render();
      }
    };
    loop();
  }

  showToast(message, duration = 3000) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("show");
    setTimeout(() => {
      this.toastEl.classList.remove("show");
    }, duration);
  }
}

// Bootstrap
window.addEventListener("DOMContentLoaded", () => {
  new App();
});
