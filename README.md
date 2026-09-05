# 3D Scan & View (Spatial 3DGS & Off-Axis Window)

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-green.svg)](https://fastapi.tiangolo.com/)
[![Three.js](https://img.shields.io/badge/Three.js-r162-black.svg)](https://threejs.org/)
[![apple/ml-sharp](https://img.shields.io/badge/apple%2Fml--sharp-3DGS-orange.svg)](https://github.com/apple/ml-sharp)

撮影した物体の単眼写真から **Apple の `ml-sharp`** を用いて **3D Gaussian Splatting (3DGS)** の PLY データを生成し、**Off-Axis Projection (斜視投影/錯視3D)** と顔追跡を組み合わせて、ブラウザ上で画面の奥にリアルな立体物が実在するかのように覗き込めるWebシステムです。

---

## 🌟 システムの特徴と体験フロー

1. **直感的なWebスキャン撮影**:
   - Webブラウザ上でカメラを起動し、物体を撮影（イン/アウトカメラ切替、画像ファイルアップロードにも対応）。
2. **自動背景透過 (rembg)**:
   - AIセグメンテーション（`rembg`）により物体の背景を瞬時に透過し、クリーンな前景を抽出。
3. **apple/ml-sharp による高速3DGS生成**:
   - 単眼写真からわずか数秒で 3D Gaussian Splatting の PLY を推論・生成。
   - **1日1回のチェックポイントキャッシュ**: モデルの再ダウンロードを抑え、`-c` 引数でローカルキャッシュを利用。
   - **デバイス自動選択**: NVIDIA GPU (`CUDA`) $\to$ Apple Silicon (`MPS`) $\to$ `CPU` に自動フォールバック。
4. **PLY黒点・孤立ノイズ除去フィルタ (`ply_cleaner.py`)**:
   - 背景透過に伴って発生する黒色背景由来のスプラットノイズ（球面調和関数 SH0 色空間での閾値判定）と、`cKDTree` による浮遊孤立点を高精度にクレンジング。
   - 必要に応じた座標・クォータニオンのY軸回転処理。
5. **インタラクティブ 3D サイバーローディング画面**:
   - 推論中の待機時間を、Three.js による点群スワーム（パーティクルが物体の形状へと結晶化していくハイテク演出）とリアルタイム進捗インジケータでリッチに演出。
6. **Off-Axis Projection による疑似3D立体視**:
   - MediaPipe Face Mesh でユーザーの顔・視点位置 $(X, Y, Z)$ をリアルタイム追跡。
   - Robert Kooima の一般化透視投影式に基づき、ディスプレイ枠を「バーチャルウィンドウ」として定義した非対称視錐台（Asymmetric Frustum）を動的計算。
   - 画面の奥を覗き込むように顔を動かすと、角度に応じたリアルなパースペクティブ変化と立体錯視が得られます。
   - マウス追跡・スマホジャイロモードへのワンクリック切り替えにも対応。

---

## 🏗️ システムアーキテクチャ

```
3D-Scan-and-View/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI メインアプリ & API ルーティング
│   │   ├── config.py              # 環境設定、キャッシュ期間、クリーニングパラメータ
│   │   ├── checkpoint_manager.py  # 1日1回チェックポイント保存・キャッシュ管理 (-c)
│   │   ├── device_utils.py        # CUDA / MPS / CPU 自動選択
│   │   ├── pipeline.py            # 非同期パイプライン (rembg -> ml-sharp -> cleaner)
│   │   ├── ply_cleaner.py         # PLY黒点・孤立点除去スクリプト (検証済ロジック)
│   │   └── job_manager.py         # 非同期ジョブ進捗・ステータス管理
│   ├── tests/                     # 各モジュールの単体テスト
│   ├── requirements.txt           # バックエンド依存パッケージ
│   └── Dockerfile                 # PyTorch CUDA 12.1 コンテナ定義
├── frontend/
│   ├── index.html                 # メインページ (HUD、撮影ビュー、3Dビューア)
│   ├── style.css                  # サイバーダーク & ガラスモーフィズムUI
│   └── src/
│       ├── main.js                # アプリケーション全体制御
│       ├── camera.js              # カメラキャプチャ・切り替え
│       ├── api.js                 # バックエンドAPI通信 & ポーリング
│       ├── loader3d.js            # 3D点群サイバーローディング演出
│       ├── tracker.js             # MediaPipe Face Mesh 顔追跡 (マウス/ジャイロ対応)
│       ├── offaxis.js             # Kooima式 Off-Axis Projection 数学エンジン
│       └── viewer.js              # Three.js + GaussianSplats3D シーン描画
├── docker-compose.yml             # Docker Compose (NVIDIA GPU パススルー対応)
├── run_local.sh                   # Mac (MPS) / Linux 用ローカル起動スクリプト
├── run_local.ps1                  # Windows 用ローカル起動スクリプト
└── README.md                      # 本ドキュメント
```

---

## 🚀 クイックスタート

### 方式 1: Docker Compose (NVIDIA GPU / Linux / Windows WSL2 推奨)

```bash
# リポジトリ直下でビルド＆起動
docker compose up --build
```
起動後、ブラウザで **`http://localhost:8000`** にアクセスします。

### 方式 2: Mac (Apple Silicon MPS) またはホスト直接実行

Apple Silicon の Metal 加速 (MPS) を最大限活用する場合、ローカルホストの Python 仮想環境で直接起動することが推奨されます。

```bash
# 実行権限を付与して起動スクリプトを実行
chmod +x run_local.sh
./run_local.sh
```

### 方式 3: Windows (PowerShell)

```powershell
.\run_local.ps1
```

---

## ⚙️ 環境変数 & チューニングパラメータ

バックエンドの各設定は環境変数または `backend/app/config.py` で調整可能です。

| 環境変数名 | デフォルト値 | 説明 |
| :--- | :--- | :--- |
| `CHECKPOINT_CACHE_TTL_SECONDS` | `86400` (24時間) | ml-sharp チェックポイントのキャッシュ有効期間。この期間内は再ダウンロードを行わずローカルファイルを使用。 |
| `CHECKPOINT_URL` | 公式CDN | Apple ml-sharp のデフォルト重みダウンロードURL。 |
| `BLACK_THRESH` | `0.015` | PLY黒色ノイズ判定のRGB閾値。背景透過由来の暗いガウシアンを除去。 |
| `OUTLIER_K` | `20` | 孤立点判定（cKDTree）で探索する近傍点数。 |
| `OUTLIER_STD_RATIO` | `2.0` | 孤立点判定の標準偏差倍率（厳密さ）。 |
| `DATA_DIR` | `./data` | アップロード画像および生成PLYの保存ディレクトリ。 |
| `MODELS_DIR` | `./models` | キャッシュされたチェックポイント重みの保存先。 |

---

## 📐 Off-Axis Projection (斜視投影) の数学的原理

一般的な3D描画では、画面の中心を向く対称な視錐台（Symmetric Frustum）が使われますが、これでは観察者が左右上下から画面を覗き込んでも絵が変化しません。

本システムでは **Robert Kooima の一般化透視投影式 (Generalized Perspective Projection)** を採用しています：
1. 画面の物理的な四隅を仮想の窓枠（Window Plane, $Z = 0$）として固定。
2. MediaPipe Face Mesh によって測定された観察者の目の実空間位置 $(p_x, p_y, p_z)$（$p_z > 0$）にカメラを配置。
3. 近クリップ面 $near$ における上下左右のクリップ境界を次式で動的に計算：
   $$\text{left} = near \times \frac{-W/2 - p_x}{p_z}, \quad \text{right} = near \times \frac{W/2 - p_x}{p_z}$$
   $$\text{bottom} = near \times \frac{-H/2 - p_y}{p_z}, \quad \text{top} = near \times \frac{H/2 - p_y}{p_z}$$
4. これらを Three.js の `camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far)` に適用。

これにより、観察者が顔を右に動かすと物体の左奥が覗き込め、顔を上に動かすと物体の天面が見えるという、**「箱の中の本物の物体を覗き込んでいる」** 錯視体験を生み出します。

---

## 📄 ライセンス

- 本プロジェクトのコードは MIT License です。
- `apple/ml-sharp` のコードおよび学習済みモデル重みのライセンスに関しては、[apple/ml-sharp 公式リポジトリ](https://github.com/apple/ml-sharp) の `LICENSE` および `LICENSE_MODEL` をご確認ください。
