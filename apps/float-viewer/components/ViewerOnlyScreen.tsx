"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { FloatingStage } from "@/components/FloatingStage";
import type { ImageRecord } from "@/lib/storage/types";

export function ViewerOnlyScreen() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

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

  const extractedImages = useMemo(
    () => images.filter((image) => image.source === "extracted"),
    [images],
  );

  return (
    <main className="viewerPageShell">
      <div className="viewerTopBar">
        <div className="viewerHeading">
          <p className="eyebrow">Viewer Mode</p>
          <h1>飛ぶ画像だけを大きく表示</h1>
          <p className="heroLead">
            閲覧用として、抽出済みの犬画像だけを大きな表示領域で確認できます。
          </p>
        </div>

        <div className="viewerActions">
          <span className="viewerCount">
            {isLoading ? "読み込み中..." : `${extractedImages.length} 件を表示中`}
          </span>
          <Link className="secondaryButton viewerLinkButton" href="/">
            通常画面へ戻る
          </Link>
        </div>
      </div>

      {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}

      {!errorMessage && !isLoading && extractedImages.length === 0 ? (
        <section className="panel viewerEmptyPanel">
          <p>まだ抽出画像がありません。</p>
          <p className="mutedText">
            通常画面で画像をアップロードして保存すると、この専用ビューアに表示されます。
          </p>
        </section>
      ) : null}

      {extractedImages.length > 0 ? (
        <div className="viewerStageWrap">
          <FloatingStage images={extractedImages} />
        </div>
      ) : null}
    </main>
  );
}
