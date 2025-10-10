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
};

export function Item({ id, label = "Origin", imageUrl, position, onClick, isLoading = false }: ItemProps) {
  const finalPosition: Vector2D = position ?? { x: 0, y: 0 };

  return (
    <div
      className="canvas-item"
      style={{ transform: `translate(${finalPosition.x}px, ${finalPosition.y}px)` }}
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
        <img src={imageUrl} alt={label} draggable={false} />
      )}
      <span>{label}</span>
    </div>
  );
}

