"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FloatingStage } from "@/components/FloatingStage";
import { FloatUploader } from "@/components/FloatUploader";
import { ImageSummaryList } from "@/components/ImageSummaryList";
import type { ImageRecord } from "@/lib/storage/types";

type ImportIssue = {
  storedName?: string;
  imageId?: string;
  reason: string;
};

type ImportArchiveResult = {
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  importedUploads: number;
  importedExtracted: number;
  skipped: ImportIssue[];
  errors: ImportIssue[];
};

export function FloatDashboard() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const [transferError, setTransferError] = useState("");
  const [importResult, setImportResult] = useState<ImportArchiveResult | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const loadImages = useCallback(async () => {
    try {
      const response = await fetch("/api/images", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        images?: ImageRecord[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "画像一覧の取得に失敗しました。");
      }

      setImages(payload.images ?? []);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "画像一覧の取得に失敗しました。",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  function handleUploaded(uploadImage: ImageRecord, extractedImage: ImageRecord) {
    setImages((current) => [extractedImage, uploadImage, ...current]);
    setErrorMessage("");
  }

  async function handleExport() {
    setIsExporting(true);
    setTransferMessage("");
    setTransferError("");

    try {
      const response = await fetch("/api/export", {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "エクスポートに失敗しました。");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="(.+?)"/);
      const fileName = fileNameMatch?.[1] ?? "float-viewer-export.zip";
      const anchor = document.createElement("a");

      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setTransferMessage("現在の画像データ一式を ZIP でエクスポートしました。");
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : "エクスポートに失敗しました。",
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImport() {
    if (!importFile) {
      setTransferError("インポートする ZIP ファイルを選択してください。");
      return;
    }

    setIsImporting(true);
    setTransferMessage("");
    setTransferError("");
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("archive", importFile);

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImportArchiveResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "インポートに失敗しました。");
      }

      setImportResult(payload);
      setTransferMessage(
        `インポート完了: ${payload.importedCount} 件追加、${payload.skippedCount} 件スキップ、${payload.errorCount} 件エラー`,
      );
      setImportFile(null);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
      await loadImages();
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : "インポートに失敗しました。",
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handleDelete(image: ImageRecord) {
    const confirmMessage =
      image.source === "upload"
        ? "この元画像を削除します。対応する抽出画像も一緒に削除されます。"
        : "この抽出画像を削除します。";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeletingImageId(image.id);

    try {
      const response = await fetch("/api/images", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageId: image.id }),
      });

      const payload = (await response.json()) as {
        deletedIds?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "画像の削除に失敗しました。");
      }

      const deletedIds = new Set(payload.deletedIds ?? []);
      setImages((current) => current.filter((item) => !deletedIds.has(item.id)));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "画像の削除に失敗しました。",
      );
    } finally {
      setDeletingImageId(null);
    }
  }

  const uploadImages = useMemo(
    () => images.filter((image) => image.source === "upload"),
    [images],
  );
  const extractedImages = useMemo(
    () => images.filter((image) => image.source === "extracted"),
    [images],
  );

  return (
    <div className="dashboardShell">
      <div className="heroBlock">
        <p className="eyebrow">Float Viewer</p>
        <h1>ふわふわわんこ in 犬まつり</h1>
        <p className="heroLead">
          このサイトでは、アップロードした画像へ背景除去を適用して抽出画像を作り、
          ふちゅう犬まつりの背景上を複数の犬画像が漂う様子を楽しめます。
        </p>
        <div className="heroActionRow">
          <Link className="secondaryButton heroLinkButton" href="/viewer">
            閲覧用画面に移動
          </Link>
        </div>
        <p className="heroLead">
          この公開版は GitHub の <code>main</code> 更新後に自動デプロイされます。
        </p>
      </div>

      {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}

      <section className="panel transferPanel">
        <div className="panelHeader">
          <h2>データ管理</h2>
          <p className="mutedText">
            元画像、抽出画像、`images.json` をまとめて ZIP でエクスポート / マージインポートできます。
          </p>
        </div>
        <div className="transferActions">
          <button
            className="secondaryButton"
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting || isImporting}
          >
            {isExporting ? "エクスポート中..." : "ZIP をエクスポート"}
          </button>
          <label className="transferFilePicker">
            <span>{importFile ? "別の ZIP を選ぶ" : "ZIP を選択"}</span>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => {
                setImportFile(event.target.files?.[0] ?? null);
                setTransferError("");
                setTransferMessage("");
              }}
              disabled={isExporting || isImporting}
            />
          </label>
          <button
            className="primaryButton"
            type="button"
            onClick={() => void handleImport()}
            disabled={!importFile || isExporting || isImporting}
          >
            {isImporting ? "インポート中..." : "ZIP をインポート"}
          </button>
        </div>
        {importFile ? (
          <p className="mutedText transferFileName">
            選択中: <code>{importFile.name}</code>
          </p>
        ) : null}
        {transferMessage ? <p className="infoText">{transferMessage}</p> : null}
        {transferError ? <p className="errorText">{transferError}</p> : null}
        {importResult ? (
          <div className="transferResult">
            <p className="transferResultSummary">
              追加 {importResult.importedCount} 件
              {" / "}元画像 {importResult.importedUploads} 件
              {" / "}抽出画像 {importResult.importedExtracted} 件
            </p>
            <p className="transferResultSummary">
              スキップ {importResult.skippedCount} 件 / エラー {importResult.errorCount} 件
            </p>
            {importResult.skipped.length > 0 ? (
              <div className="transferIssueBlock">
                <p className="summaryTitle">スキップ詳細</p>
                <ul className="transferIssueList">
                  {importResult.skipped.map((issue) => (
                    <li key={`skip-${issue.imageId ?? issue.storedName ?? issue.reason}`}>
                      <code>{issue.storedName ?? issue.imageId ?? "unknown"}</code>
                      {" - "}
                      {issue.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {importResult.errors.length > 0 ? (
              <div className="transferIssueBlock">
                <p className="summaryTitle">エラー詳細</p>
                <ul className="transferIssueList">
                  {importResult.errors.map((issue) => (
                    <li key={`error-${issue.imageId ?? issue.storedName ?? issue.reason}`}>
                      <code>{issue.storedName ?? issue.imageId ?? "unknown"}</code>
                      {" - "}
                      {issue.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="dashboardGrid">
        <FloatUploader onUploaded={handleUploaded} />
        <FloatingStage images={extractedImages} />
      </div>

      <div className="summaryGrid">
        <ImageSummaryList
          title="アップロード済み元画像"
          images={uploadImages}
          emptyMessage={isLoading ? "読み込み中です..." : "まだ元画像はありません。"}
          helperText="元画像を削除すると、対応する抽出画像も一緒に削除されます。"
          deletingImageId={deletingImageId}
          onDelete={(image) => void handleDelete(image)}
          showPreview
        />
        <ImageSummaryList
          title="抽出済み画像"
          images={extractedImages}
          emptyMessage={isLoading ? "読み込み中です..." : "まだ抽出画像はありません。"}
          helperText="抽出画像のみを個別に削除できます。"
          deletingImageId={deletingImageId}
          onDelete={(image) => void handleDelete(image)}
          showPreview
        />
      </div>
    </div>
  );
}
