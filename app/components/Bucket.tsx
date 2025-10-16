type Vector2D = {
  x: number;
  y: number;
};

type BucketProps = {
  id: string;
  label?: string;
  imageUrl?: string;
  position?: Vector2D;
  isLoading?: boolean;
  bucketName?: string;
  fileName?: string;
  version?: number;
  onClick?: (id: string) => void;
};

export function Bucket({ id, label = "Bucket", imageUrl, position, isLoading = false, bucketName, fileName, onClick }: BucketProps) {
  const finalPosition: Vector2D = position ?? { x: 0, y: 0 };

  return (
    <div
      className="canvas-item"
      style={{ transform: `translate(${finalPosition.x}px, ${finalPosition.y}px)` }}
      aria-busy={isLoading}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (!isLoading) {
          onClick?.(id);
        }
      }}
    >
      {isLoading ? (
        <div className="flex items-center justify-center w-full h-full bg-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <div className="relative w-full h-full">
          {imageUrl ? <img src={imageUrl} alt={label} draggable={false} /> : null}
          {bucketName ? (
            <div className="absolute top-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-medium bg-black/60 text-white shadow-sm max-w-[140px] truncate" title={bucketName}>
              {bucketName}
            </div>
          ) : null}
          {fileName ? (
            <div className="absolute top-7 left-2 rounded-md px-2 py-0.5 text-[10px] font-medium bg-black/60 text-white shadow-sm max-w-[140px] truncate" title={fileName}>
              {fileName}
            </div>
          ) : null}
          <div className="absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[11px] font-medium bg-black/60 text-white shadow-sm">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}


