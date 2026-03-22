import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { removeSourceBackgroundLocally } from "@/lib/ai/preprocess";
import { getStorageProvider } from "@/lib/storage";
import { filePathFromUrl } from "@/lib/storage/local";
import { consumeTempPreview } from "@/lib/storage/temp-preview";

export const runtime = "nodejs";

type PreprocessRequestBody = {
  imageId?: string;
  previewToken?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let inputImageId = "";
  let inputPreviewToken = "";
  let sourceStoredName = "";
  let sourceSize = 0;

  try {
    const body = (await request.json()) as PreprocessRequestBody;
    const imageId = body.imageId?.trim();
    const previewToken = body.previewToken?.trim();
    inputImageId = imageId ?? "";
    inputPreviewToken = previewToken ?? "";

    if (!imageId) {
      return NextResponse.json(
        { error: "前処理対象の元画像を選択してください。" },
        { status: 400 },
      );
    }

    const storage = getStorageProvider();
    const images = await storage.listImages();
    const sourceImage = images.find((image) => image.id === imageId);

    if (!sourceImage) {
      return NextResponse.json(
        { error: "前処理対象画像が見つかりません。" },
        { status: 404 },
      );
    }

    if (sourceImage.source !== "upload") {
      return NextResponse.json(
        { error: "前処理に使えるのはアップロードした元画像のみです。" },
        { status: 400 },
      );
    }

    sourceStoredName = sourceImage.storedName;
    sourceSize = sourceImage.size;

    console.info(
      "[float-viewer] preprocess:start",
      JSON.stringify({
        imageId,
        previewTokenProvided: Boolean(previewToken),
        storedName: sourceStoredName,
        sourceBytes: sourceSize,
        sourceSize: formatBytes(sourceSize),
      }),
    );

    const existingExtractedImage = images.find(
      (image) => image.source === "extracted" && image.derivedFromId === sourceImage.id,
    );

    if (existingExtractedImage) {
      console.info(
        "[float-viewer] preprocess:success",
        JSON.stringify({
          imageId,
          storedName: sourceStoredName,
          sourceBytes: sourceSize,
          sourceSize: formatBytes(sourceSize),
          reusedExistingImage: true,
          outputBytes: existingExtractedImage.size,
          outputSize: formatBytes(existingExtractedImage.size),
          elapsedMs: Date.now() - startedAt,
        }),
      );
      return NextResponse.json({ image: existingExtractedImage }, { status: 200 });
    }

    const extractionMode = previewToken ? "temp-preview" : "fallback-preprocess";
    const extractedImage = previewToken
      ? await consumeTempPreview(previewToken)
      : await (async () => {
          const sourceImagePath = filePathFromUrl(sourceImage.url);
          const sourceBuffer = await readFile(sourceImagePath);
          return removeSourceBackgroundLocally(sourceBuffer, sourceImage.mimeType);
        })();

    const savedImage = await storage.saveImage({
      buffer: extractedImage.buffer,
      originalName: `${sourceImage.storedName}-extracted.png`,
      mimeType: extractedImage.mimeType,
      size: extractedImage.buffer.byteLength,
      source: "extracted",
      status: "generated",
      derivedFromId: sourceImage.id,
    });

    console.info(
      "[float-viewer] preprocess:success",
      JSON.stringify({
        imageId,
        storedName: sourceStoredName,
        sourceBytes: sourceSize,
        sourceSize: formatBytes(sourceSize),
        extractionMode,
        preparedBytes: "stats" in extractedImage ? extractedImage.stats.preparedBytes : null,
        preparedSize:
          "stats" in extractedImage
            ? formatBytes(extractedImage.stats.preparedBytes)
            : null,
        preparedWidth: "stats" in extractedImage ? extractedImage.stats.preparedWidth : null,
        preparedHeight: "stats" in extractedImage ? extractedImage.stats.preparedHeight : null,
        wasResized: "stats" in extractedImage ? extractedImage.stats.wasResized : null,
        outputBytes: extractedImage.buffer.byteLength,
        outputSize: formatBytes(extractedImage.buffer.byteLength),
        elapsedMs: Date.now() - startedAt,
      }),
    );

    return NextResponse.json({ image: savedImage }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "画像抽出に失敗しました。";

    console.error(
      "[float-viewer] preprocess:error",
      JSON.stringify({
        imageId: inputImageId || null,
        previewTokenProvided: Boolean(inputPreviewToken),
        storedName: sourceStoredName || null,
        sourceBytes: sourceSize || null,
        sourceSize: sourceSize ? formatBytes(sourceSize) : null,
        elapsedMs: Date.now() - startedAt,
        error: message,
      }),
    );

    const status =
      message.includes("見つかりません") || message.includes("有効期限")
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
