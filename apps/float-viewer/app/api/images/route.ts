import { NextResponse } from "next/server";

import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const storage = getStorageProvider();
    const images = await storage.listImages();

    return NextResponse.json({ images });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "画像一覧の取得に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type DeleteImagesRequestBody = {
  imageId?: string;
};

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as DeleteImagesRequestBody;
    const imageId = body.imageId?.trim();

    if (!imageId) {
      return NextResponse.json(
        { error: "削除対象の画像を選択してください。" },
        { status: 400 },
      );
    }

    const storage = getStorageProvider();
    const result = await storage.deleteImage(imageId);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "画像の削除に失敗しました。";

    const status = message.includes("見つかりません") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
