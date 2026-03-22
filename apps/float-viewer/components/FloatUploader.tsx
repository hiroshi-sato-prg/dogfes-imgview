"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";

import { createCroppedImageFile } from "@/lib/client/crop-image";
import type { ImageRecord } from "@/lib/storage/types";

type FloatUploaderProps = {
  onUploaded: (uploadImage: ImageRecord, extractedImage: ImageRecord) => void;
};

export function FloatUploader({ onUploaded }: FloatUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewToken, setPreviewToken] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [croppedLocalPreviewUrl, setCroppedLocalPreviewUrl] = useState("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl("");
      setCroppedLocalPreviewUrl("");
      setCrop(undefined);
      setCompletedCrop(null);
      imageRef.current = null;
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function updateCroppedPreview() {
      if (!selectedFile || !completedCrop || !imageRef.current) {
        setCroppedLocalPreviewUrl("");
        return;
      }

      try {
        const croppedFile = await createCroppedImageFile({
          image: imageRef.current,
          file: selectedFile,
          crop: completedCrop,
        });

        if (!active) {
          return;
        }

        objectUrl = URL.createObjectURL(croppedFile);
        setCroppedLocalPreviewUrl(objectUrl);
      } catch {
        if (active) {
          setCroppedLocalPreviewUrl("");
        }
      }
    }

    void updateCroppedPreview();

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [completedCrop, selectedFile]);

  const selectedFileSummary = useMemo(() => {
    if (!selectedFile) {
      return "未選択";
    }

    const sizeInMb = (selectedFile.size / 1024 / 1024).toFixed(2);
    return `${selectedFile.name} (${sizeInMb} MB)`;
  }, [selectedFile]);

  function invalidateExtractedPreview() {
    if (!previewUrl && !previewToken) {
      return;
    }

    setPreviewUrl("");
    setPreviewToken("");
    setErrorMessage("");
    setStatusMessage("トリミング範囲を変更しました。もう一度抽出画像を確認してください。");
  }

  function handleSourceImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;

    imageRef.current = image;
    setCrop({
      unit: "%",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    setCompletedCrop({
      unit: "px",
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  async function createPreparedUploadFile() {
    if (!selectedFile) {
      throw new Error("アップロードする画像を選択してください。");
    }

    if (!completedCrop || !imageRef.current) {
      throw new Error("画像の読み込み完了後に再度お試しください。");
    }

    return createCroppedImageFile({
      image: imageRef.current,
      file: selectedFile,
      crop: completedCrop,
    });
  }

  async function handlePreview() {
    if (!selectedFile) {
      setErrorMessage("アップロードする画像を選択してください。");
      return;
    }

    setIsPreviewing(true);
    setErrorMessage("");
    setStatusMessage("抽出画像を確認用に作成しています...");
    setPreviewUrl("");
    setPreviewToken("");

    try {
      const preparedFile = await createPreparedUploadFile();
      const formData = new FormData();
      formData.append("image", preparedFile);

      const previewResponse = await fetch("/api/preview-extract", {
        method: "POST",
        body: formData,
      });

      const previewPayload = (await previewResponse.json()) as {
        error?: string;
        previewUrl?: string;
        previewToken?: string;
      };

      if (
        !previewResponse.ok ||
        !previewPayload.previewUrl ||
        !previewPayload.previewToken
      ) {
        throw new Error(previewPayload.error ?? "抽出画像の確認に失敗しました。");
      }

      setPreviewUrl(previewPayload.previewUrl);
      setPreviewToken(previewPayload.previewToken);
      setStatusMessage("抽出画像を確認しました。問題なければアップロードしてください。");
    } catch (error) {
      setStatusMessage("");
      setPreviewToken("");
      setErrorMessage(
        error instanceof Error ? error.message : "抽出画像の確認に失敗しました。",
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setErrorMessage("アップロードする画像を選択してください。");
      return;
    }

    if (!previewUrl || !previewToken) {
      setErrorMessage("先に抽出画像を確認してください。");
      return;
    }

    setIsUploading(true);
    setErrorMessage("");
    setStatusMessage("アップロード中です...");

    try {
      const preparedFile = await createPreparedUploadFile();
      const formData = new FormData();
      formData.append("image", preparedFile);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const uploadPayload = (await uploadResponse.json()) as {
        error?: string;
        image?: ImageRecord;
      };

      if (!uploadResponse.ok || !uploadPayload.image) {
        throw new Error(uploadPayload.error ?? "アップロードに失敗しました。");
      }

      setStatusMessage("確認済みの抽出画像を保存しています...");

      const preprocessResponse = await fetch("/api/preprocess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageId: uploadPayload.image.id,
          previewToken,
        }),
      });

      const preprocessPayload = (await preprocessResponse.json()) as {
        error?: string;
        image?: ImageRecord;
      };

      if (!preprocessResponse.ok || !preprocessPayload.image) {
        throw new Error(preprocessPayload.error ?? "画像抽出に失敗しました。");
      }

      onUploaded(uploadPayload.image, preprocessPayload.image);
      setSelectedFile(null);
      setPreviewUrl("");
      setPreviewToken("");
      setCrop(undefined);
      setCompletedCrop(null);
      setStatusMessage("抽出画像を追加しました。背景の上をふわふわ飛びます。");
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(
        error instanceof Error ? error.message : "アップロードに失敗しました。",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panelHeader">
        <p className="eyebrow">Upload</p>
        <h2>画像をアップロードして抽出</h2>
      </div>

      <form className="uploadForm" onSubmit={handleSubmit}>
        <label className="uploadDropzone" htmlFor="image-file">
          <span className="uploadDropzoneTitle">
            犬の画像を選択して抽出結果を確認
          </span>
          <span className="uploadDropzoneDescription">
            JPG / PNG / WebP を 10MB まで選択できます。まず抽出画像を確認し、問題なければ保存します。
          </span>
          <input
            id="image-file"
            type="file"
            accept="image/*"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null);
              setPreviewUrl("");
              setPreviewToken("");
              setErrorMessage("");
              setStatusMessage("");
            }}
          />
        </label>

        <div className="uploadMetaRow">
          <span className="uploadMetaLabel">選択中</span>
          <span className="uploadMetaValue">{selectedFileSummary}</span>
        </div>

        {selectedFile ? (
          <div className="previewGrid">
            <div className="previewCard previewCardWide">
              <p className="previewTitle">元画像のトリミング範囲</p>
              {localPreviewUrl ? (
                <div className="cropStage">
                  <ReactCrop
                    crop={crop}
                    onChange={(_, nextPercentCrop) => {
                      setCrop(nextPercentCrop);
                      invalidateExtractedPreview();
                    }}
                    onComplete={(nextPixelCrop) => {
                      setCompletedCrop(nextPixelCrop);
                    }}
                    minWidth={40}
                    minHeight={40}
                    keepSelection
                  >
                    {/* react-image-crop requires a plain img element as its direct child. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={localPreviewUrl}
                      alt="選択した元画像"
                      className="cropImage"
                      onLoad={handleSourceImageLoad}
                    />
                  </ReactCrop>
                </div>
              ) : null}
              <p className="mutedText cropHint">
                ドラッグして保存したい範囲を自由に調整できます。抽出確認とアップロードには、この切り抜き結果が使われます。
              </p>
            </div>

            <div className="previewCard">
              <p className="previewTitle">トリミング後プレビュー</p>
              {croppedLocalPreviewUrl ? (
                <div className="previewFrame">
                  <Image
                    src={croppedLocalPreviewUrl}
                    alt="トリミング後プレビュー"
                    width={320}
                    height={320}
                    className="previewImage"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="previewPlaceholder">
                  <p>画像の読み込み中です。</p>
                  <p className="mutedText">
                    読み込みが終わると、ここに切り抜き結果が表示されます。
                  </p>
                </div>
              )}
            </div>

            <div className="previewCard">
              <p className="previewTitle">抽出プレビュー</p>
              {previewUrl ? (
                <div className="previewFrame previewFrameDark">
                  <Image
                    src={previewUrl}
                    alt="抽出プレビュー"
                    width={320}
                    height={320}
                    className="previewImage"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="previewPlaceholder">
                  <p>まだ抽出プレビューはありません。</p>
                  <p className="mutedText">
                    「抽出画像を確認する」を押すとここに表示されます。
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {statusMessage ? <p className="infoText">{statusMessage}</p> : null}
        {errorMessage ? <p className="errorText">{errorMessage}</p> : null}

        <div className="actionRow">
          <button
            className="secondaryButton"
            type="button"
            onClick={() => void handlePreview()}
            disabled={!selectedFile || !completedCrop || isPreviewing || isUploading}
          >
            {isPreviewing ? "抽出確認中..." : "抽出画像を確認する"}
          </button>

          <button
            className="primaryButton"
            type="submit"
            disabled={
              !selectedFile ||
              !completedCrop ||
              !previewUrl ||
              isPreviewing ||
              isUploading
            }
          >
            {isUploading ? "アップロード中..." : "問題なければアップロード"}
          </button>
        </div>
      </form>
    </section>
  );
}
