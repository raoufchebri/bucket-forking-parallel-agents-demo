"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";

import { Item } from "./components/Item";

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_SENSITIVITY = 0.0015;
const GRID_BASE_SIZE = 32;
const ITEM_SIZE = 160;
const HALF_ITEM_SIZE = ITEM_SIZE / 2;
const CHILD_OFFSET_X = ITEM_SIZE + 120;
const CHILD_VERTICAL_GAP = ITEM_SIZE + 40;

type Point = {
  x: number;
  y: number;
};

type CanvasState = {
  scale: number;
  translation: Point;
};

type CanvasItem = {
  id: string;
  label: string;
  imageUrl?: string;
  position: Point;
  parentId?: string;
  isLoading?: boolean;
  bucketName?: string;
  fileName?: string;
  isGenerating?: boolean;
};

type Connection = {
  id: string;
  from: string;
  to: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function Home() {
  return (
    <main className="w-screen h-screen">
      <InfiniteCanvas />
    </main>
  );
}

function InfiniteCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CanvasState>({
    scale: 1,
    translation: { x: 0, y: 0 },
  });
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [forkOnAdd, setForkOnAdd] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const anyGenerating = useMemo(() => items.some((i) => i.isGenerating), [items]);
  const pointerRef = useRef<{
    pointerId: number;
    lastPosition: Point;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const isInitialisedRef = useRef(false);

  const applyPan = useCallback((delta: Point) => {
    setState((prev) => ({
      ...prev,
      translation: {
        x: prev.translation.x + delta.x,
        y: prev.translation.y + delta.y,
      },
    }));
  }, []);

  const applyZoom = useCallback(
    (zoomDelta: number, anchor: Point) => {
      setState((prev) => {
        const nextScale = clamp(
          prev.scale * Math.exp(-zoomDelta * ZOOM_SENSITIVITY),
          MIN_SCALE,
          MAX_SCALE,
        );

        if (!containerRef.current) {
          return { ...prev, scale: nextScale };
        }

        const rect = containerRef.current.getBoundingClientRect();
        const offset = {
          x: anchor.x - rect.left,
          y: anchor.y - rect.top,
        };

        const scaleRatio = nextScale / prev.scale;
        const nextTranslation = {
          x: offset.x - (offset.x - prev.translation.x) * scaleRatio,
          y: offset.y - (offset.y - prev.translation.y) * scaleRatio,
        };

        return {
          scale: nextScale,
          translation: nextTranslation,
        };
      });
    },
    [],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      pointerId: event.pointerId,
      lastPosition: { x: event.clientX, y: event.clientY },
    };
    setIsPanning(true);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerRef.current || pointerRef.current.pointerId !== event.pointerId) {
      return;
    }

    const { lastPosition } = pointerRef.current;
    const delta = {
      x: event.clientX - lastPosition.x,
      y: event.clientY - lastPosition.y,
    };

    pointerRef.current = {
      pointerId: event.pointerId,
      lastPosition: { x: event.clientX, y: event.clientY },
    };

    applyPan(delta);
  }, [applyPan]);

  const endPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current && pointerRef.current.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      pointerRef.current = null;
      setIsPanning(false);
    }
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();

      applyZoom(event.deltaY, { x: event.clientX, y: event.clientY });
    },
    [applyZoom],
  );

  const classes = useMemo(() => {
    const base = "canvas-container";
    return isPanning ? `${base} is-panning` : base;
  }, [isPanning]);

  const contentStyle = useMemo(() => {
    const { translation, scale } = state;
    return {
      transform: `translate(${translation.x}px, ${translation.y}px) scale(${scale})`,
    };
  }, [state]);

  const gridStyle = useMemo(() => {
    const { translation, scale } = state;
    const size = GRID_BASE_SIZE * scale;
    const offsetX = translation.x % size;
    const offsetY = translation.y % size;
    return {
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${offsetX}px ${offsetY}px`,
    };
  }, [state]);

  const createChildItem = useCallback(
    async (parent: CanvasItem) => {
      const childId = nanoid();
      const child: CanvasItem = {
        id: childId,
        label: "Item",
        position: parent.position,
        parentId: parent.id,
        isLoading: true,
      };

      // Create the item with loading state immediately
      setItems((prev) => {
        const siblings = prev.filter((item) => item.parentId === parent.id);
        const updatedSiblings = [...siblings, child];

        const startY =
          parent.position.y - ((updatedSiblings.length - 1) * CHILD_VERTICAL_GAP) / 2;

        const positionedChildren = updatedSiblings.map((sibling, index) => ({
          id: sibling.id,
          position: {
            x: parent.position.x + CHILD_OFFSET_X,
            y: startY + index * CHILD_VERTICAL_GAP,
          },
        }));

        const positionMap = new Map<string, Point>();
        positionedChildren.forEach(({ id, position }) => {
          positionMap.set(id, position);
        });

        const nextItems = prev.map((item) => {
          if (item.parentId !== parent.id) {
            return item;
          }

          const nextPosition = positionMap.get(item.id);

          if (!nextPosition) {
            return item;
          }

          return {
            ...item,
            position: nextPosition,
          };
        });

        const newChildPosition = positionMap.get(child.id);

        if (newChildPosition) {
          nextItems.push({
            ...child,
            position: newChildPosition,
          });
        }

        return nextItems;
      });

      setConnections((prev) => [
        ...prev,
        { id: nanoid(), from: parent.id, to: childId },
      ]);

      // If forking is disabled, just clone parent's image/metadata
      if (!forkOnAdd) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  imageUrl: parent.imageUrl,
                  isLoading: false,
                  bucketName: parent.bucketName,
                  fileName: parent.fileName,
                }
              : item,
          ),
        );
        return;
      }

      // Fork the parent's bucket and load image from the fork
      try {
        const params = new URLSearchParams();
        if (parent.bucketName) params.set('bucketName', parent.bucketName);
        if (parent.fileName) params.set('fileName', parent.fileName);
        const response = await fetch(`/api/fork?${params.toString()}`);

        if (!response.ok) {
          console.error("Failed to fetch image from agent API");
          return;
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const bucketName = response.headers.get('x-bucket-name') || undefined;
        const fileName = response.headers.get('x-file-name') || undefined;

        // Update the item with the loaded image
        setItems((prev) =>
          prev.map((item) =>
            item.id === childId
              ? { ...item, imageUrl: objectUrl, isLoading: false, bucketName, fileName }
              : item
          )
        );
      } catch (error) {
        console.error("Error loading image:", error);
      }
    },
    [forkOnAdd],
  );

  useEffect(() => {
    if (!containerRef.current || isInitialisedRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const centerTranslation = {
      x: rect.width / 2 - HALF_ITEM_SIZE,
      y: rect.height / 2 - HALF_ITEM_SIZE,
    };

    setState((prev) => ({
      ...prev,
      translation: centerTranslation,
    }));

    isInitialisedRef.current = true;
  }, []);

  // Load the origin image from the API
  useEffect(() => {
    const originId = nanoid();
    
    // Create the origin item with loading state immediately
    setItems([
      {
        id: originId,
        label: "Origin",
        position: { x: 0, y: 0 },
        isLoading: true,
      },
    ]);

    async function loadOriginImage() {
      try {
        const response = await fetch("/api/get-image");
        
        if (!response.ok) {
          console.error("Failed to fetch origin image from Tigris storage");
          return;
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        // Seed origin item metadata so children know where to fork from
        const originBucket = 'bucket-with-snapshots';
        const originFile = 'original_image.png';

        // Update the origin item with the loaded image
        setItems((prev) =>
          prev.map((item) =>
            item.id === originId
              ? { ...item, imageUrl: objectUrl, isLoading: false, bucketName: originBucket, fileName: originFile }
              : item
          )
        );
      } catch (error) {
        console.error("Error loading origin image:", error);
      }
    }

    loadOriginImage();
  }, []);

  const handleItemClick = useCallback(
    (id: string) => {
      const parent = items.find((item) => item.id === id);

      if (!parent) {
        return;
      }

      createChildItem(parent);
    },
    [createChildItem, items],
  );

  const handleRefresh = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item?.bucketName || !item?.fileName) return;

    // Trigger generation to replace the main file in this forked bucket
    try {
      // mark generating
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, isGenerating: true } : it));
      // Always save as canonical original file name then refetch it
      const canonicalFile = 'original_image.png';
      const params = new URLSearchParams({ bucketName: item.bucketName, fileName: item.fileName, targetFileName: canonicalFile });
      const response = await fetch(`/api/generate?${params.toString()}`, { method: 'POST' });
      if (!response.ok) {
        console.error('Failed to generate image for bucket', item.bucketName);
        return;
      }
      const refetchParams = new URLSearchParams({ bucketName: item.bucketName, fileName: canonicalFile });
      const refetch = await fetch(`/api/get-file?${refetchParams.toString()}`);
      if (!refetch.ok) {
        console.error('Failed to refetch saved image for', item.bucketName, item.fileName);
        return;
      }
      const blob = await refetch.blob();
      const objectUrl = URL.createObjectURL(blob);
      const newBucket = refetch.headers.get('x-bucket-name') || item.bucketName;
      const newFile = refetch.headers.get('x-file-name') || canonicalFile;
      setItems((prev) => {
        // If forking is disabled, unify ALL items to the same original file
        if (!forkOnAdd) {
          return prev.map((it) => ({ ...it, imageUrl: objectUrl, bucketName: newBucket, fileName: newFile }));
        }
        // Otherwise only update items that reference this file
        return prev.map((it) => (it.bucketName === item.bucketName && it.fileName === item.fileName)
          ? { ...it, imageUrl: objectUrl, bucketName: newBucket, fileName: newFile }
          : it);
      });
      setListVersion((v) => v + 1);
    } catch (e) {
      console.error('Error generating image:', e);
    }
    finally {
      // clear generating
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, isGenerating: false } : it));
    }
  }, [items, forkOnAdd]);

  const handleRefreshAll = useCallback(async () => {
    // Trigger one generation per unique bucket/file pair, in parallel
    const seen = new Set<string>();
    const idsToRefresh: string[] = [];
    for (const it of items) {
      if (!it.bucketName || !it.fileName) continue;
      const key = `${it.bucketName}::${it.fileName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      idsToRefresh.push(it.id);
    }
    await Promise.all(idsToRefresh.map((id) => handleRefresh(id)));
  }, [items, handleRefresh]);

  const renderedConnections = useMemo(() => {
    const idToItem = new Map(items.map((item) => [item.id, item]));

    return connections
      .map((connection) => {
        const from = idToItem.get(connection.from);
        const to = idToItem.get(connection.to);

        if (!from || !to) {
          return null;
        }

        const start = from.position;
        const end = to.position;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        return (
          <div
            key={connection.id}
            className="canvas-connection"
            style={{
              width: `${length}px`,
              transform: `translate(${start.x + HALF_ITEM_SIZE}px, ${start.y + HALF_ITEM_SIZE}px) rotate(${angle}deg)`,
            }}
          />
        );
      })
      .filter(Boolean);
  }, [connections, items]);

  return (
    <div
      ref={containerRef}
      className={classes}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={handleWheel}
    >
      <div className="absolute top-4 right-4 z-50 flex items-center gap-3 bg-white/80 dark:bg-black/50 backdrop-blur px-3 py-2 rounded-md border border-black/10 shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
        <span className="text-xs font-medium">Fork on add</span>
        <button
          type="button"
          role="switch"
          aria-checked={forkOnAdd}
          aria-label="Toggle fork on add"
          onClick={() => setForkOnAdd((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${forkOnAdd ? 'bg-blue-600' : 'bg-gray-300'}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${forkOnAdd ? 'translate-x-5' : 'translate-x-1'}`}
          />
        </button>
        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={anyGenerating}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-blue-600/20 bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label="Generate all items"
          title="Generate all items"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          Generate all
        </button>
      </div>
      <div className="canvas-layer">
        <div className="canvas-surface canvas-grid" style={gridStyle} />
        <div className="canvas-surface canvas-content" style={contentStyle}>
          {renderedConnections}
          {items.map((item) => (
            <Item
              key={item.id}
              id={item.id}
              label={item.label}
              imageUrl={item.imageUrl}
              position={item.position}
              onClick={handleItemClick}
              isLoading={item.isLoading}
              onRefresh={handleRefresh}
              bucketName={item.bucketName}
              isGenerating={item.isGenerating}
              // bump prop reference when version changes to force re-render
              version={listVersion}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
