/**
 * API communication module
 */

const API_BASE = window.location.origin;

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error("Health check failed");
    return await res.json();
  } catch (err) {
    console.warn("Health check error:", err);
    return null;
  }
}

export async function uploadScan(imageBlob, rotationDeg = 0) {
  const formData = new FormData();
  formData.append("image", imageBlob, "capture.png");
  formData.append("rotation_deg", rotationDeg.toString());

  const res = await fetch(`${API_BASE}/api/scan`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "スキャンの開始に失敗しました。");
  }

  return await res.json();
}

export async function pollJobStatus(jobId, onProgress) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/jobs/${jobId}/status`);
        if (!res.ok) {
          clearInterval(interval);
          return reject(new Error("ジョブステータスの取得に失敗しました。"));
        }

        const data = await res.json();
        if (onProgress) onProgress(data);

        if (data.status === "completed") {
          clearInterval(interval);
          resolve(data);
        } else if (data.status === "failed") {
          clearInterval(interval);
          reject(new Error(data.error || data.message || "生成に失敗しました。"));
        }
      } catch (err) {
        clearInterval(interval);
        reject(err);
      }
    }, 1000);
  });
}
