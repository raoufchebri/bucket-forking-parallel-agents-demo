type Vector2D = {
  x: number;
  y: number;
};

type ItemProps = {
  id: string;
  label?: string;
  imageUrl?: string;
  position?: Vector2D;
  onClick?: (id: string) => void;
  isLoading?: boolean;
  onRefresh?: (id: string) => void;
  bucketName?: string;
  isGenerating?: boolean;
  version?: number;
};

export function Item({ id, label = "Origin", imageUrl, position, onClick, isLoading = false, onRefresh, bucketName, isGenerating = false }: ItemProps) {
  const finalPosition: Vector2D = position ?? { x: 0, y: 0 };

  return (
    <div
      className="canvas-item"
      style={{ transform: `translate(${finalPosition.x}px, ${finalPosition.y}px)` }}
      aria-busy={isLoading || isGenerating}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (!isLoading && !isGenerating) {
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
          <img src={imageUrl} alt={label} draggable={false} />
          {bucketName ? (
            <div className="absolute top-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-medium bg-black/60 text-white shadow-sm max-w-[120px] truncate" title={bucketName}>
              {bucketName}
            </div>
          ) : null}
          <button
            type="button"
            className="absolute top-2 right-2 inline-flex items-center justify-center h-8 w-8 rounded-md bg-white/80 backdrop-blur border border-black/10 shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={(e) => { e.stopPropagation(); onRefresh?.(id); }}
            aria-label="Refresh image"
            title="Refresh"
            disabled={isGenerating}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-gray-800">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <div className="absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[11px] font-medium bg-black/60 text-white shadow-sm">
            {label}
          </div>
          {isGenerating ? (
            <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] flex items-center justify-center z-10">
              <div className="flex items-center gap-2 text-white text-xs font-medium">
                <div className="h-5 w-5 rounded-full border-2 border-white/60 border-t-transparent animate-spin"></div>
                Generating...
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

