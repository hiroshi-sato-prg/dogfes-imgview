import { NextResponse } from "next/server";

import { importStorageArchive } from "@/lib/storage/archive";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const archiveEntry = formData.get("archive");

    if (!(archiveEntry instanceof File)) {
      return NextResponse.json(
        { error: "インポートする ZIP ファイルを選択してください。" },
        { status: 400 },
      );
    }

    const archiveBuffer = Buffer.from(await archiveEntry.arrayBuffer());
    const result = await importStorageArchive({ archiveBuffer });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "インポートアーカイブの取り込みに失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
