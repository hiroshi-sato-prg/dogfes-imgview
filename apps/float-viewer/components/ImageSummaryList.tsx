import type { ImageRecord } from "@/lib/storage/types";

type ImageSummaryListProps = {
  title: string;
  images: ImageRecord[];
  emptyMessage: string;
  helperText?: string;
  deletingImageId?: string | null;
  onDelete?: (image: ImageRecord) => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ImageSummaryList({
  title,
  images,
  emptyMessage,
  helperText,
  deletingImageId,
  onDelete,
}: ImageSummaryListProps) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <p className="eyebrow">Library</p>
        <h2>{title}</h2>
        {helperText ? <p className="mutedText">{helperText}</p> : null}
      </div>

      {images.length === 0 ? (
        <p className="mutedText">{emptyMessage}</p>
      ) : (
        <div className="summaryList">
          {images.map((image) => (
            <article className="summaryCard" key={image.id}>
              <p className="summaryTitle">{image.storedName}</p>
              <p className="summaryMeta">
                {formatDate(image.createdAt)} / {(image.size / 1024 / 1024).toFixed(2)} MB
              </p>
              {onDelete ? (
                <div className="summaryActions">
                  <button
                    className="secondaryButton summaryDeleteButton"
                    type="button"
                    onClick={() => onDelete(image)}
                    disabled={deletingImageId === image.id}
                  >
                    {deletingImageId === image.id ? "削除中..." : "削除"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
