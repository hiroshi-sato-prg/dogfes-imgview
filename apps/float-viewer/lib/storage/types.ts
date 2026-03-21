export type ImageStatus = "uploaded" | "generated" | "failed";

export type ImageSource = "upload" | "extracted";

export type ImageRecord = {
  id: string;
  originalName: string;
  storedName: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
  status: ImageStatus;
  source: ImageSource;
  derivedFromId?: string;
};

export type SaveImageInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
  source?: ImageSource;
  status?: ImageStatus;
  derivedFromId?: string;
};

export type DeleteImagesResult = {
  deletedIds: string[];
};

export interface StorageProvider {
  saveImage(input: SaveImageInput): Promise<ImageRecord>;
  listImages(): Promise<ImageRecord[]>;
  deleteImage(imageId: string): Promise<DeleteImagesResult>;
}
