import { readFile, writeFile } from "node:fs/promises";

import AdmZip from "adm-zip";

import {
  ensureStorageDirs,
  filePathForSource,
  readImageIndex,
  urlPathForSource,
  writeImageIndex,
} from "@/lib/storage/local";
import type { ImageRecord, ImageSource, ImageStatus } from "@/lib/storage/types";

const ARCHIVE_VERSION = 1;

type ArchiveManifest = {
  version: number;
  exportedAt: string;
  imageCount: number;
  uploadCount: number;
  extractedCount: number;
};

type ImportIssue = {
  storedName?: string;
  imageId?: string;
  reason: string;
};

export type ImportArchiveResult = {
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  importedImages: number;
  importedUploads: number;
  importedExtracted: number;
  skipped: ImportIssue[];
  errors: ImportIssue[];
};

function isImageStatus(value: string): value is ImageStatus {
  return value === "uploaded" || value === "generated" || value === "failed";
}

function isImageSource(value: string): value is ImageSource {
  return value === "upload" || value === "extracted";
}

function isImageRecord(value: unknown): value is ImageRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.originalName === "string" &&
    typeof candidate.storedName === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.status === "string" &&
    (candidate.derivedFromId === undefined || typeof candidate.derivedFromId === "string") &&
    isImageSource(candidate.source) &&
    isImageStatus(candidate.status)
  );
}

function archivePathForSource(source: ImageSource, storedName: string) {
  return source === "extracted" ? `extracted/${storedName}` : `uploads/${storedName}`;
}

function normalizeImportedRecord(record: ImageRecord): ImageRecord {
  return {
    ...record,
    url: urlPathForSource(record.source, record.storedName),
  };
}

function compareImportOrder(left: ImageRecord, right: ImageRecord) {
  if (left.source !== right.source) {
    return left.source === "upload" ? -1 : 1;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

export async function exportStorageArchive() {
  await ensureStorageDirs();

  const records = await readImageIndex();
  const zip = new AdmZip();
  const manifest: ArchiveManifest = {
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    imageCount: records.length,
    uploadCount: records.filter((record) => record.source === "upload").length,
    extractedCount: records.filter((record) => record.source === "extracted").length,
  };

  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"));
  zip.addFile("images.json", Buffer.from(JSON.stringify(records, null, 2) + "\n", "utf8"));

  for (const record of records) {
    const fileBuffer = await readFile(filePathForSource(record.source, record.storedName));
    zip.addFile(archivePathForSource(record.source, record.storedName), fileBuffer);
  }

  return {
    buffer: zip.toBuffer(),
    manifest,
  };
}

export async function importStorageArchive(input: { archiveBuffer: Buffer }) {
  await ensureStorageDirs();

  const zip = new AdmZip(input.archiveBuffer);
  const imageIndexEntry = zip.getEntry("images.json");

  if (!imageIndexEntry) {
    throw new Error("アーカイブに images.json が含まれていません。");
  }

  let importedRecordsRaw: unknown;
  try {
    importedRecordsRaw = JSON.parse(imageIndexEntry.getData().toString("utf8"));
  } catch {
    throw new Error("images.json の読み取りに失敗しました。");
  }

  if (!Array.isArray(importedRecordsRaw)) {
    throw new Error("images.json の形式が不正です。");
  }

  const invalidRecord = importedRecordsRaw.find((record) => !isImageRecord(record));
  if (invalidRecord) {
    throw new Error("images.json に不正なレコードが含まれています。");
  }

  const importedRecords = (importedRecordsRaw as ImageRecord[])
    .map(normalizeImportedRecord)
    .sort(compareImportOrder);
  const existingRecords = await readImageIndex();
  const mergedRecords = [...existingRecords];
  const knownIds = new Set(existingRecords.map((record) => record.id));
  const knownStoredNames = new Set(existingRecords.map((record) => record.storedName));
  const skipped: ImportIssue[] = [];
  const errors: ImportIssue[] = [];
  let importedUploads = 0;
  let importedExtracted = 0;

  for (const record of importedRecords) {
    const issueBase = {
      imageId: record.id,
      storedName: record.storedName,
    };

    if (knownIds.has(record.id)) {
      skipped.push({ ...issueBase, reason: "同じ imageId が既に存在するためスキップしました。" });
      continue;
    }

    if (knownStoredNames.has(record.storedName)) {
      skipped.push({
        ...issueBase,
        reason: "同じ storedName が既に存在するためスキップしました。",
      });
      continue;
    }

    if (record.source === "extracted" && record.derivedFromId && !knownIds.has(record.derivedFromId)) {
      skipped.push({
        ...issueBase,
        reason: "対応する元画像が存在しないため抽出画像をスキップしました。",
      });
      continue;
    }

    const archivePath = archivePathForSource(record.source, record.storedName);
    const fileEntry = zip.getEntry(archivePath);

    if (!fileEntry) {
      errors.push({
        ...issueBase,
        reason: `${archivePath} がアーカイブに見つかりません。`,
      });
      continue;
    }

    const targetPath = filePathForSource(record.source, record.storedName);
    await writeFile(targetPath, fileEntry.getData());

    mergedRecords.unshift(record);
    knownIds.add(record.id);
    knownStoredNames.add(record.storedName);

    if (record.source === "upload") {
      importedUploads += 1;
    } else {
      importedExtracted += 1;
    }
  }

  await writeImageIndex(mergedRecords);

  return {
    importedCount: importedUploads + importedExtracted,
    skippedCount: skipped.length,
    errorCount: errors.length,
    importedImages: importedUploads + importedExtracted,
    importedUploads,
    importedExtracted,
    skipped,
    errors,
  } satisfies ImportArchiveResult;
}
