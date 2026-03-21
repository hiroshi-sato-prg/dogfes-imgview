"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { FloatingStage } from "@/components/FloatingStage";
import { FloatUploader } from "@/components/FloatUploader";
import { ImageSummaryList } from "@/components/ImageSummaryList";
import type { ImageRecord } from "@/lib/storage/types";

export function FloatDashboard() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadImages() {
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

        if (active) {
          setImages(payload.images ?? []);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "画像一覧の取得に失敗しました。",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadImages();

    return () => {
      active = false;
    };
  }, []);

  function handleUploaded(uploadImage: ImageRecord, extractedImage: ImageRecord) {
    setImages((current) => [extractedImage, uploadImage, ...current]);
    setErrorMessage("");
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
        <h1>抽出した犬画像が会場背景をふわふわ飛び回る</h1>
        <p className="heroLead">
          このサイトでは、アップロードした画像へ背景除去を適用して抽出画像を作り、
          ふちゅう犬まつりの背景上を複数の犬画像が漂う様子を楽しめます。
        </p>
        <div className="heroActionRow">
          <Link className="secondaryButton heroLinkButton" href="/viewer">
            飛ぶ画像だけを大きく見る
          </Link>
        </div>
        <p className="heroLead">
          この公開版は GitHub の <code>main</code> 更新後に自動デプロイされます。
        </p>
      </div>

      {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}

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
        />
        <ImageSummaryList
          title="抽出済み画像"
          images={extractedImages}
          emptyMessage={isLoading ? "読み込み中です..." : "まだ抽出画像はありません。"}
          helperText="抽出画像のみを個別に削除できます。"
          deletingImageId={deletingImageId}
          onDelete={(image) => void handleDelete(image)}
        />
      </div>
    </div>
  );
}
