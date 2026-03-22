import removeBackground from "@imgly/background-removal-node";
import sharp from "sharp";

type BackgroundRemovalStats = {
  originalBytes: number;
  preparedBytes: number;
  originalWidth: number | null;
  originalHeight: number | null;
  preparedWidth: number | null;
  preparedHeight: number | null;
  wasResized: boolean;
};

type PreprocessedImage = {
  buffer: Buffer;
  mimeType: string;
  stats: BackgroundRemovalStats;
};

const ALPHA_THRESHOLD = 8;
const MIN_TRIMMED_AREA = 64;
const MAX_BACKGROUND_REMOVAL_DIMENSION = 1600;

function normalizedMimeType(format: string | undefined, fallbackMimeType: string) {
  switch (format) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return fallbackMimeType || "image/jpeg";
  }
}

async function prepareSourceImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{
  buffer: Buffer;
  mimeType: string;
  stats: BackgroundRemovalStats;
}> {
  const image = sharp(buffer, { animated: false }).rotate();
  const metadata = await image.metadata();
  const originalWidth = metadata.width ?? null;
  const originalHeight = metadata.height ?? null;
  const prepared = image.resize({
    width: MAX_BACKGROUND_REMOVAL_DIMENSION,
    height: MAX_BACKGROUND_REMOVAL_DIMENSION,
    fit: "inside",
    withoutEnlargement: true,
  });
  const { data, info } = await prepared.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType: normalizedMimeType(info.format, mimeType),
    stats: {
      originalBytes: buffer.byteLength,
      preparedBytes: data.byteLength,
      originalWidth,
      originalHeight,
      preparedWidth: info.width ?? null,
      preparedHeight: info.height ?? null,
      wasResized:
        (originalWidth !== null && info.width !== originalWidth) ||
        (originalHeight !== null && info.height !== originalHeight),
    },
  };
}

async function trimTransparentPadding(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer, { animated: false }).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha < ALPHA_THRESHOLD) {
        continue;
      }

      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return buffer;
  }

  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;

  if (contentWidth * contentHeight < MIN_TRIMMED_AREA) {
    return buffer;
  }

  const padding = Math.max(
    8,
    Math.round(Math.min(info.width, info.height) * 0.02),
  );
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const width = Math.min(info.width - left, contentWidth + padding * 2);
  const height = Math.min(info.height - top, contentHeight + padding * 2);

  if (left === 0 && top === 0 && width === info.width && height === info.height) {
    return buffer;
  }

  return sharp(buffer, { animated: false })
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
}

export async function removeSourceBackgroundLocally(
  sourceImage: Buffer,
  mimeType: string,
): Promise<PreprocessedImage> {
  const preparedImage = await prepareSourceImage(sourceImage, mimeType);
  const sourceArrayBuffer = new ArrayBuffer(preparedImage.buffer.byteLength);
  new Uint8Array(sourceArrayBuffer).set(preparedImage.buffer);

  const sourceBlob = new Blob([sourceArrayBuffer], {
    type: preparedImage.mimeType || "image/jpeg",
  });

  const blob = await removeBackground(sourceBlob, {
    output: {
      format: "image/png",
      quality: 0.9,
    },
  });

  const arrayBuffer = await blob.arrayBuffer();
  const extractedBuffer = Buffer.from(arrayBuffer);
  const trimmedBuffer = await trimTransparentPadding(extractedBuffer);

  return {
    buffer: trimmedBuffer,
    mimeType: "image/png",
    stats: preparedImage.stats,
  };
}
