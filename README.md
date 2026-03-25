# DogFes ImgView Workspace

犬イベント向けの画像表示アプリをまとめたワークスペースです。現在は `apps/float-viewer` を運用対象として管理しています。

## 提供中のアプリ

### `apps/float-viewer`

公開運用中のアプリです。アップロードした犬画像を背景除去し、会場背景の上でふわふわ動かして表示します。

主な機能:
- 画像アップロード
- アップロード前の自由トリミング
- 抽出プレビュー確認後の保存
- ローカル背景除去
- 抽出画像の浮遊表示
- 閲覧用 `/viewer` 画面
- 元画像 / 抽出画像の削除
- 画像データ一式の ZIP エクスポート / マージインポート
- 元画像一覧 / 抽出画像一覧のサムネイル表示とクリック時プレビュー

## アーキテクチャ

### ワークスペース構成

- `apps/float-viewer`
  一般公開中の閲覧 / 運営向けアップロードアプリ
- `apps/float-viewer` が独立した `package.json`、`node_modules`、Next.js 設定を持つ構成

### `float-viewer` のデータフロー

1. ユーザーが画像を選択
2. ブラウザ側でトリミング
3. `/api/preview-extract` で背景除去プレビューを生成
4. 抽出結果を一時保存し、`previewToken` を返却
5. `/api/upload` で元画像を保存
6. `/api/preprocess` で `previewToken` に対応する抽出結果だけを保存
7. 保存済みの抽出画像を一覧表示と浮遊表示に利用

### `float-viewer` の主要 API

- `POST /api/upload`
  元画像を保存
- `POST /api/preview-extract`
  背景除去プレビューを作成し、一時保存トークンを返却
- `GET /api/preview-extract/[token]`
  一時保存した抽出プレビュー画像を配信
- `POST /api/preprocess`
  `previewToken` に対応する抽出結果を正式保存
- `GET /api/images`
  画像一覧を取得
- `DELETE /api/images`
  元画像または抽出画像を削除
- `GET /api/export`
  元画像 / 抽出画像 / `images.json` を ZIP でエクスポート
- `POST /api/import`
  ZIP を受け取り、既存データを残したままマージインポート
- `GET /uploads/[...segments]`
  元画像を配信
- `GET /extracted/[...segments]`
  抽出画像を配信

### 保存方式

`float-viewer` はローカルファイル保存を採用しています。

- ローカル開発時
  - 元画像: `apps/float-viewer/public/uploads`
  - 抽出画像: `apps/float-viewer/public/extracted`
  - メタデータ: `apps/float-viewer/data/images.json`
- Railway 運用時 (`STORAGE_ROOT=/data`)
  - 元画像: `/data/uploads`
  - 抽出画像: `/data/extracted`
  - メタデータ: `/data/images.json`
  - 一時プレビュー: `/data/temp-previews`

## 開発方法

### 前提

- Node.js / npm

### `float-viewer` 起動

```bash
cd apps/float-viewer
npm install
env -u STORAGE_ROOT npm run dev
```

別ポートで起動したい場合:

```bash
cd apps/float-viewer
env -u STORAGE_ROOT npm run dev -- --port 3001
```

### よく使う確認コマンド

```bash
cd apps/float-viewer
npm run lint
npm run build
```

### データのエクスポート / インポート

運営画面トップ `/` の「データ管理」パネルから操作できます。

- エクスポート
  - 現在の元画像 / 抽出画像 / `images.json` を ZIP 1 ファイルで保存
- インポート
  - ZIP を選んで既存データへ追加マージ
  - `storedName` または `id` が重複する画像はスキップ
  - 対応する元画像が存在しない抽出画像もスキップ

## 環境変数

### `float-viewer`

`apps/float-viewer/.env.example`

```env
STORAGE_ROOT=/data
```

- ローカル開発では通常 `STORAGE_ROOT` を設定しません
- Railway では `STORAGE_ROOT=/data` を設定し、Volume を `/data` にマウントします

## 性能上の制約と注意点

`float-viewer` の背景除去は `@imgly/background-removal-node` と `sharp` を使うため、メモリ使用量が大きくなりやすいです。特に Railway trial 環境では、入力画像やタイミングによってコンテナが `Killed` されることがあります。

現在入れている対策:
- アップロード前トリミング
- 背景除去前の縮小
- 背景除去前の JPEG 正規化
- `preview-extract` 結果の一時保存と再利用
- `preprocess` の再背景除去フォールバック削除
- API 開始 / 成功 / 失敗ログの出力

それでも残る制約:
- 大きい画像や複雑な画像では `preview-extract` が重い
- trial プランではまれにクラッシュが起きる可能性がある
- `preview-extract` は数秒から十数秒以上かかる場合がある

運用上の推奨:
- なるべく高解像度すぎる画像は避ける
- スマホ撮影画像は必要に応じて事前に圧縮する
- Railway ログで `preview-extract:start` / `success` / `error` を確認する

## Railway デプロイ

`float-viewer` は Railway で公開する前提です。

現在の運用構成:
- GitHub: `piropiropi0611-art/dogfes-imgview`
- Railway Project: `dogfes-imgview`
- Railway Service: `dogfes-float-viewer`
- Root Directory: `apps/float-viewer`
- Volume を `/data` にマウント
- `STORAGE_ROOT=/data`

公開 URL:
- ベース: `https://dogfes-float-viewer-production.up.railway.app`
- トップ: `/`
- 閲覧用: `/viewer`

## デプロイについて

現在の運用では、**`piropiropi0611-art/dogfes-imgview` の `main` に push すると Railway の自動デプロイが発生します。**

注意点:
- README のみの更新でも `main` へ push すればデプロイ対象になります
- デプロイを発生させたくない場合は、`main` 以外のブランチで作業するか、push を保留してください

## 補足

- 保存ファイル名は `IMG_YYYYMMDD_HHMMSS_XX.ext` 形式
- `float-viewer` の閲覧用 `/viewer` は、公開表示向けの単独画面として利用
- 運営向け操作はトップ画面 `/` 側で行う想定
