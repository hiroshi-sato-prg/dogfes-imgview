import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  DeleteImagesResult,
  ImageRecord,
  ImageSource,
  SaveImageInput,
  StorageProvider,
} from "@/lib/storage/types";

const STORAGE_ROOT = process.env.STORAGE_ROOT?.trim();
const PUBLIC_UPLOAD_DIR = STORAGE_ROOT
  ? path.join(STORAGE_ROOT, "uploads")
  : path.join(process.cwd(), "public", "uploads");
const PUBLIC_EXTRACTED_DIR = STORAGE_ROOT
  ? path.join(STORAGE_ROOT, "extracted")
  : path.join(process.cwd(), "public", "extracted");
const DATA_DIR = STORAGE_ROOT ? STORAGE_ROOT : path.join(process.cwd(), "data");
const IMAGE_INDEX_PATH = STORAGE_ROOT
  ? path.join(STORAGE_ROOT, "images.json")
  : path.join(DATA_DIR, "images.json");

export async function ensureStorageDirs() {
  await mkdir(PUBLIC_UPLOAD_DIR, { recursive: true });
  await mkdir(PUBLIC_EXTRACTED_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readImageIndex(): Promise<ImageRecord[]> {
  try {
    const file = await readFile(IMAGE_INDEX_PATH, "utf8");
    const data = JSON.parse(file) as ImageRecord[];
    return data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function writeImageIndex(records: ImageRecord[]) {
  await writeFile(IMAGE_INDEX_PATH, JSON.stringify(records, null, 2) + "\n", "utf8");
}

async function removeImageFile(record: ImageRecord) {
  await rm(filePathForSource(record.source, record.storedName), { force: true });
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extensionFromMimeType(mimeType: string) {
  const subtype = mimeType.split("/")[1];
  return subtype ? `.${subtype.replace(/[^a-zA-Z0-9]/g, "")}` : "";
}

function padTwoDigits(value: number) {
  return value.toString().padStart(2, "0");
}

function formatTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = padTwoDigits(date.getMonth() + 1);
  const day = padTwoDigits(date.getDate());
  const hours = padTwoDigits(date.getHours());
  const minutes = padTwoDigits(date.getMinutes());
  const seconds = padTwoDigits(date.getSeconds());

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function nextSequence(records: ImageRecord[], timestamp: string) {
  const prefix = `IMG_${timestamp}_`;
  const maxSequence = records.reduce((currentMax, record) => {
    if (!record.storedName.startsWith(prefix)) {
      return currentMax;
    }

    const match = record.storedName.match(/^IMG_\d{8}_\d{6}_(\d{2})/);
    if (!match) {
      return currentMax;
    }

    return Math.max(currentMax, Number(match[1]));
  }, 0);

  return padTwoDigits(maxSequence + 1);
}

function publicDirForSource(source: ImageSource) {
  return source === "extracted" ? PUBLIC_EXTRACTED_DIR : PUBLIC_UPLOAD_DIR;
}

export function urlPathForSource(source: ImageSource, storedName: string) {
  return source === "extracted"
    ? `/extracted/${storedName}`
    : `/uploads/${storedName}`;
}

export function getStorageRoot() {
  return STORAGE_ROOT;
}

export function filePathForSource(source: ImageSource, storedName: string) {
  return path.join(publicDirForSource(source), storedName);
}

export function filePathFromUrl(imageUrl: string) {
  if (imageUrl.startsWith("/uploads/")) {
    return filePathForSource("upload", imageUrl.replace("/uploads/", ""));
  }

  if (imageUrl.startsWith("/extracted/")) {
    return filePathForSource("extracted", imageUrl.replace("/extracted/", ""));
  }

  throw new Error("保存ファイルの URL が不正です。");
}

export class LocalStorageProvider implements StorageProvider {
  async saveImage(input: SaveImageInput): Promise<ImageRecord> {
    await ensureStorageDirs();

    const records = await readImageIndex();
    const createdAt = new Date();
    const timestamp = formatTimestamp(createdAt);
    const sequence = nextSequence(records, timestamp);
    const originalName = sanitizeFileName(input.originalName || "upload");
    const extension = path.extname(originalName) || extensionFromMimeType(input.mimeType);
    const storedName = `IMG_${timestamp}_${sequence}${extension}`;
    const source = input.source ?? "upload";
    const targetPath = path.join(publicDirForSource(source), storedName);

    await writeFile(targetPath, input.buffer);

    const record: ImageRecord = {
      id: `${timestamp}-${sequence}`,
      originalName,
      storedName,
      url: urlPathForSource(source, storedName),
      mimeType: input.mimeType,
      size: input.size,
      createdAt: createdAt.toISOString(),
      status: input.status ?? "uploaded",
      source,
      derivedFromId: input.derivedFromId,
    };

    records.unshift(record);
    await writeImageIndex(records);

    return record;
  }

  async listImages(): Promise<ImageRecord[]> {
    await ensureStorageDirs();
    return readImageIndex();
  }

  async deleteImage(imageId: string): Promise<DeleteImagesResult> {
    await ensureStorageDirs();

    const records = await readImageIndex();
    const targetImage = records.find((record) => record.id === imageId);

    if (!targetImage) {
      throw new Error("削除対象の画像が見つかりません。");
    }

    const recordsToDelete = records.filter((record) => {
      if (record.id === targetImage.id) {
        return true;
      }

      if (targetImage.source === "upload" && record.derivedFromId === targetImage.id) {
        return true;
      }

      return false;
    });

    await Promise.all(recordsToDelete.map((record) => removeImageFile(record)));

    const deletedIds = new Set(recordsToDelete.map((record) => record.id));
    const remainingRecords = records.filter((record) => !deletedIds.has(record.id));
    await writeImageIndex(remainingRecords);

    return {
      deletedIds: [...deletedIds],
    };
  }
}
