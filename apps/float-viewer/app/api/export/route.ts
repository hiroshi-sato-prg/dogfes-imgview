import { NextResponse } from "next/server";

import { exportStorageArchive } from "@/lib/storage/archive";

export const runtime = "nodejs";

function formatArchiveTimestamp(value: string) {
  return value.replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
}

export async function GET() {
  try {
    const archive = await exportStorageArchive();
    const fileName = `float-viewer-export-${formatArchiveTimestamp(archive.manifest.exportedAt)}.zip`;

    return new NextResponse(new Uint8Array(archive.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "エクスポートアーカイブの作成に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
