import { NextResponse } from "next/server";

import { removeSourceBackgroundLocally } from "@/lib/ai/preprocess";
import { createTempPreview } from "@/lib/storage/temp-preview";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

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
  let inputName = "";
  let inputType = "";
  let inputSize = 0;

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("image");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "画像ファイルを選択してください。" },
        { status: 400 },
      );
    }

    if (!fileEntry.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "画像ファイルのみアップロードできます。" },
        { status: 400 },
      );
    }

    if (fileEntry.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: "10MB 以下の画像を選択してください。" },
        { status: 400 },
      );
    }

    inputName = fileEntry.name;
    inputType = fileEntry.type;
    inputSize = fileEntry.size;

    console.info(
      "[float-viewer] preview-extract:start",
      JSON.stringify({
        fileName: inputName,
        mimeType: inputType,
        inputBytes: inputSize,
        inputSize: formatBytes(inputSize),
      }),
    );

    const arrayBuffer = await fileEntry.arrayBuffer();
    const extractedImage = await removeSourceBackgroundLocally(
      Buffer.from(arrayBuffer),
      fileEntry.type,
    );
    const preview = await createTempPreview({
      buffer: extractedImage.buffer,
      mimeType: extractedImage.mimeType,
      size: extractedImage.buffer.byteLength,
    });

    console.info(
      "[float-viewer] preview-extract:success",
      JSON.stringify({
        fileName: inputName,
        mimeType: inputType,
        inputBytes: inputSize,
        inputSize: formatBytes(inputSize),
        preparedBytes: extractedImage.stats.preparedBytes,
        preparedSize: formatBytes(extractedImage.stats.preparedBytes),
        preparedWidth: extractedImage.stats.preparedWidth,
        preparedHeight: extractedImage.stats.preparedHeight,
        wasResized: extractedImage.stats.wasResized,
        outputBytes: extractedImage.buffer.byteLength,
        outputSize: formatBytes(extractedImage.buffer.byteLength),
        elapsedMs: Date.now() - startedAt,
      }),
    );

    return NextResponse.json(
      {
        previewUrl: preview.previewUrl,
        previewToken: preview.previewToken,
        mimeType: preview.mimeType,
        size: preview.size,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "抽出画像の確認に失敗しました。";

    console.error(
      "[float-viewer] preview-extract:error",
      JSON.stringify({
        fileName: inputName || null,
        mimeType: inputType || null,
        inputBytes: inputSize || null,
        inputSize: inputSize ? formatBytes(inputSize) : null,
        elapsedMs: Date.now() - startedAt,
        error: message,
      }),
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
