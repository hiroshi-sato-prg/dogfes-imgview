# Float Viewer Deployment Handoff

更新日時: `2026-03-25T22:26:26+09:00`

## 現在の運用対象

- アプリ: `apps/float-viewer`
- GitHub: `https://github.com/piropiropi0611-art/dogfes-imgview.git`
- デプロイ対象ブランチ: `main`
- 現在のローカル HEAD: `7e80b2d32e23ede33ea32f65db97db6153a0cacd`

## Railway 現在値

- Workspace: `piropiropi0611-art's Projects`
- Project 名: `dogfes-imgview`
- Project ID: `7332c565-c56a-434e-81a6-a5e9ab5db1cf`
- Environment 名: `production`
- Environment ID: `9a2aa7c0-efb7-489d-8c39-6af45030555f`
- Service 名: `dogfes-float-viewer`
- Service ID: `07a1dc37-cbab-417a-921c-f553ecc5275f`
- 最新成功デプロイ ID: `586bdf3c-d335-41f5-9017-5cfd64277583`

## 公開 URL

- ベース URL: `https://dogfes-float-viewer-production.up.railway.app`
- 閲覧用 URL: `https://dogfes-float-viewer-production.up.railway.app/viewer`

## デプロイ設定

- Source Repo: `piropiropi0611-art/dogfes-imgview`
- Root Directory: `apps/float-viewer`
- Runtime: `V2`
- Builder: `RAILPACK`
- Node runtime: `22.22.2`
- Sleep when idle: `false`
- Restart policy: `ON_FAILURE`
- Replica count: `1`

## ストレージ設定

- Volume 名: `dogfes-imgview-volume`
- Volume ID: `7e903465-0dd0-4ef1-8fa5-8b466f6ea29f`
- Mount path: `/data`
- 永続データ:
  - `/data/uploads`
  - `/data/extracted`
  - `/data/images.json`
  - `/data/temp-previews`

## 必須の環境変数

```env
STORAGE_ROOT=/data
```

## アプリ前提

- `next.config.ts`
  - `images.localPatterns`
    - `/uploads/**`
    - `/extracted/**`
    - `/backgrounds/**`
  - `turbopack.root = path.resolve(__dirname)`
- 管理画面トップ `/`
  - 画像アップロード
  - ZIP エクスポート
  - ZIP マージインポート
- 閲覧画面 `/viewer`
  - 抽出済み画像の表示専用画面

## 運用メモ

- `main` へ push すると Railway の自動デプロイが発生する
- データ移行やバックアップは、運営画面トップの ZIP エクスポート / インポートを使う
- ルート直下の `float-viewer-export-2026-03-25T11-47-42Z.zip` は画像データのバックアップ
- ルート `.gitignore` ではローカル運用データ、生成物、エクスポート ZIP を除外している
