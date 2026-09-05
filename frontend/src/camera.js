/**
 * Camera module for capturing object photos
 */

export class CameraManager {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.stream = null;
    this.facingMode = "environment"; // Default to back camera on mobile
  }

  async start() {
    this.stop();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttps = window.location.protocol === "https:";
      const msg = isHttps
        ? "カメラへのアクセスがブラウザまたはOSで許可されていません。設定をご確認ください。"
        : "【カメラがブロックされました】\nブラウザのセキュリティ仕様により、LAN経由の非HTTPS（http://）ではカメラが使用できません。\nサーバーをHTTPS（https://...）で起動してアクセスするか、下の「📁 ファイル選択」から撮影した写真をアップロードしてください。";
      throw new Error(msg);
    }

    const constraints = {
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
      audio: false,
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await this.video.play();
      return true;
    } catch (err) {
      console.warn("Could not access camera with preferred constraints, trying fallback...", err);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.video.srcObject = this.stream;
        await this.video.play();
        return true;
      } catch (fallbackErr) {
        console.error("Camera access failed:", fallbackErr);
        throw fallbackErr;
      }
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  async flipCamera() {
    this.facingMode = this.facingMode === "user" ? "environment" : "user";
    return await this.start();
  }

  captureFrameBlob() {
    if (!this.video.videoWidth || !this.video.videoHeight) {
      throw new Error("カメラ映像の準備ができていません。");
    }

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    this.canvas.width = vw;
    this.canvas.height = vh;

    const ctx = this.canvas.getContext("2d");
    ctx.drawImage(this.video, 0, 0, vw, vh);

    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("画像のキャプチャに失敗しました。"));
        }
      }, "image/png");
    });
  }
}
