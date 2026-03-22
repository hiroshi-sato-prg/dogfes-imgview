import type { PixelCrop } from "react-image-crop";

const SUPPORTED_OUTPUT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("トリミング画像の生成に失敗しました。"));
        return;
      }

      resolve(blob);
    }, mimeType, quality);
  });
}

export async function createCroppedImageFile(input: {
  image: HTMLImageElement;
  file: File;
  crop: PixelCrop;
}) {
  const { image, file, crop } = input;

  if (crop.width < 1 || crop.height < 1) {
    throw new Error("トリミング範囲を指定してください。");
  }

  const renderedWidth = image.width;
  const renderedHeight = image.height;

  if (renderedWidth < 1 || renderedHeight < 1) {
    throw new Error("画像の読み込み完了後に再度お試しください。");
  }

  const scaleX = image.naturalWidth / renderedWidth;
  const scaleY = image.naturalHeight / renderedHeight;
  const sourceX = Math.max(0, Math.round(crop.x * scaleX));
  const sourceY = Math.max(0, Math.round(crop.y * scaleY));
  const sourceWidth = Math.max(1, Math.round(crop.width * scaleX));
  const sourceHeight = Math.max(1, Math.round(crop.height * scaleY));
  const canvas = document.createElement("canvas");

  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("トリミング画像の描画に失敗しました。");
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );

  const outputType = SUPPORTED_OUTPUT_TYPES.has(file.type) ? file.type : "image/png";
  const outputQuality =
    outputType === "image/jpeg" || outputType === "image/webp" ? 0.92 : undefined;
  const blob = await canvasToBlob(canvas, outputType, outputQuality);

  return new File([blob], file.name, {
    type: blob.type,
    lastModified: Date.now(),
  });
}
