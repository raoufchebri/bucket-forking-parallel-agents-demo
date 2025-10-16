"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";

import { Bucket } from "./components/Bucket";
import { Agent } from "./components/Agent";

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
  kind: 'bucket' | 'agent';
  label: string;
  imageUrl?: string;
  position: Point;
  parentId?: string; // agent -> bucket
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

  const addAgent = useCallback(
    async (bucket: CanvasItem) => {
      // Fork off disabled: create an agent attached to this bucket
      if (!forkOnAdd) {
        const agentId = nanoid();
        const draftAgent: CanvasItem = {
          id: agentId,
          kind: 'agent',
          label: "Agent",
          position: bucket.position,
          parentId: bucket.id,
          isLoading: true,
        };

        setItems((prev) => {
          const siblingAgents = prev.filter((item) => item.parentId === bucket.id && item.kind === 'agent');
          const updatedSiblings = [...siblingAgents, draftAgent];

          const startY = bucket.position.y - ((updatedSiblings.length - 1) * CHILD_VERTICAL_GAP) / 2;

          const positionedChildren = updatedSiblings.map((sibling, index) => ({
            id: sibling.id,
            position: {
              x: bucket.position.x + CHILD_OFFSET_X,
              y: startY + index * CHILD_VERTICAL_GAP,
            },
          }));

          const positionMap = new Map<string, Point>();
          positionedChildren.forEach(({ id, position }) => {
            positionMap.set(id, position);
          });

          const nextItems = prev.map((item) => {
            if (item.parentId !== bucket.id || item.kind !== 'agent') {
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

          const newChildPosition = positionMap.get(agentId);

          if (newChildPosition) {
            nextItems.push({
              ...draftAgent,
              position: newChildPosition,
            });
          }

          return nextItems;
        });

        setConnections((prev) => [
          ...prev,
          { id: nanoid(), from: bucket.id, to: agentId },
        ]);

        setItems((prev) =>
          prev.map((item) =>
            item.id === agentId
              ? {
                  ...item,
                  imageUrl: undefined,
                  isLoading: false,
                  bucketName: bucket.bucketName,
                  fileName: bucket.fileName,
                }
              : item,
          ),
        );
        return;
      }

      // Fork-on-add: create a visual forked bucket and an agent connected to it
      try {
        // Show spinner on the clicked bucket only (avoid flashing siblings)
        setItems((prev) => prev.map((it) => it.id === bucket.id ? { ...it, isLoading: true } : it));

        const params = new URLSearchParams();
        if (bucket.bucketName) params.set('bucketName', bucket.bucketName);
        if (bucket.fileName) params.set('fileName', bucket.fileName);
        const response = await fetch(`/api/fork?${params.toString()}`);

        if (!response.ok) {
          console.error("Failed to fetch image from fork API");
          // clear spinner
          setItems((prev) => prev.map((it) => it.id === bucket.id ? { ...it, isLoading: false } : it));
          return;
        }

        const blob = await response.blob();
        const forkObjectUrl = URL.createObjectURL(blob);
        const forkBucketName = response.headers.get('x-bucket-name') || undefined;
        const forkFileName = response.headers.get('x-file-name') || undefined;

        const forkBucketId = nanoid();
        const childAgentId = nanoid();

        // Compute layout: keep forks evenly spaced; place child fork to the right of bucket.
        setItems((prev) => {
          const siblingForks = prev.filter((it) => it.parentId === bucket.id && it.kind === 'bucket');
          // Determine X column for forks: for top-level use +1, for deeper levels use +2 to avoid overlapping existing agents
          const forkColumnX = bucket.parentId ? bucket.position.x + 2 * CHILD_OFFSET_X : bucket.position.x + CHILD_OFFSET_X;
          const allForks = [...siblingForks, { id: forkBucketId } as any];
          const startY = bucket.position.y - ((allForks.length - 1) * CHILD_VERTICAL_GAP) / 2;
          const positionedForks = allForks.map((s, i) => ({ id: (s as any).id, position: { x: forkColumnX, y: startY + i * CHILD_VERTICAL_GAP } }));
          const forkPosMap = new Map<string, Point>();
          positionedForks.forEach(({ id, position }) => forkPosMap.set(id, position));

          const next = prev.map((it) => {
            // reposition existing forks under this bucket
            if (it.parentId === bucket.id && it.kind === 'bucket') {
              const np = forkPosMap.get(it.id);
              return np ? { ...it, position: np } : it;
            }
            // keep their agents aligned horizontally
            if (it.kind === 'agent' && it.parentId && forkPosMap.has(it.parentId)) {
              const fpos = forkPosMap.get(it.parentId)!;
              return { ...it, position: { x: fpos.x + CHILD_OFFSET_X, y: fpos.y } };
            }
            return it;
          });

          const newForkPos = forkPosMap.get(forkBucketId)!;
          // Add new fork bucket (ready state) and its agent
          next.push({
            id: forkBucketId,
            kind: 'bucket',
            label: 'Bucket',
            position: newForkPos,
            parentId: bucket.id,
            isLoading: false,
            imageUrl: forkObjectUrl,
            bucketName: forkBucketName,
            fileName: forkFileName,
          });

          next.push({
            id: childAgentId,
            kind: 'agent',
            label: 'Agent',
            position: { x: newForkPos.x + CHILD_OFFSET_X, y: newForkPos.y },
            parentId: forkBucketId,
            isLoading: false,
            bucketName: forkBucketName,
            fileName: forkFileName,
          });

          return next.map((it) => (it.id === bucket.id ? { ...it, isLoading: false } : it));
        });

        // Add connections
        setConnections((prev) => [...prev, { id: nanoid(), from: bucket.id, to: forkBucketId }, { id: nanoid(), from: forkBucketId, to: childAgentId }]);
      } catch (error) {
        console.error("Error loading image:", error);
        // clear spinner
        setItems((prev) => prev.map((it) => it.id === bucket.id ? { ...it, isLoading: false } : it));
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

  // Load the origin bucket image from the API
  useEffect(() => {
    const originId = nanoid();
    
    // Create the origin bucket with loading state immediately
    setItems([
      {
        id: originId,
        kind: 'bucket',
        label: "Bucket",
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
        // Seed origin bucket metadata so agents know where to generate into
        const originBucket = 'bucket-with-snapshots';
        const originFile = 'original_image.png';

        // Update the origin bucket with the loaded image
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

  const handleAddAgent = useCallback(() => {
    const bucket = items.find((i) => i.kind === 'bucket');
    if (!bucket) return;
    addAgent(bucket);
  }, [items, addAgent]);

  const handleAgentGenerate = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id && i.kind === 'agent');
    if (!item?.bucketName || !item?.fileName) return;

    // Trigger generation to replace the main file in this forked bucket
    try {
      // mark generating
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, isGenerating: true } : it));
      // Save agent output to a unique per-agent path and also update canonical for the bucket
      const canonicalFile = 'original_image.png';
      const agentTarget = `agents/${id}.png`;
      const params = new URLSearchParams({ bucketName: item.bucketName, fileName: item.fileName, targetFileName: agentTarget });
      const response = await fetch(`/api/generate?${params.toString()}`, { method: 'POST' });
      if (!response.ok) {
        console.error('Failed to generate image for bucket', item.bucketName);
        return;
      }
      // Refetch agent-specific file (what the agent displays)
      const agentRefetchParams = new URLSearchParams({ bucketName: item.bucketName, fileName: agentTarget });
      const agentRefetch = await fetch(`/api/get-file?${agentRefetchParams.toString()}`);
      if (!agentRefetch.ok) {
        console.error('Failed to refetch agent image for', item.bucketName, agentTarget);
        return;
      }
      const agentBlob = await agentRefetch.blob();
      const agentObjectUrl = URL.createObjectURL(agentBlob);
      // Refetch canonical bucket image to update bucket view
      const bucketRefetchParams = new URLSearchParams({ bucketName: item.bucketName, fileName: canonicalFile });
      const bucketRefetch = await fetch(`/api/get-file?${bucketRefetchParams.toString()}`);
      if (!bucketRefetch.ok) {
        console.error('Failed to refetch saved image for bucket', item.bucketName, canonicalFile);
        return;
      }
      const bucketBlob = await bucketRefetch.blob();
      const bucketObjectUrl = URL.createObjectURL(bucketBlob);
      const bucketName = bucketRefetch.headers.get('x-bucket-name') || item.bucketName;
      const bucketFile = bucketRefetch.headers.get('x-file-name') || canonicalFile;
      setItems((prev) => {
        if (!forkOnAdd) {
          // Update only the generating agent (with its own file) and the single bucket (with canonical)
          return prev.map((it) => {
            if (it.id === id) {
              return { ...it, imageUrl: agentObjectUrl, bucketName: item.bucketName, fileName: agentTarget };
            }
            if (it.kind === 'bucket') {
              return { ...it, imageUrl: bucketObjectUrl, bucketName, fileName: bucketFile };
            }
            return it;
          });
        }
        // Fork-on-add: update this agent's image and its connected bucket's canonical image
        return prev.map((it) => {
          if (it.id === id) {
            return { ...it, imageUrl: agentObjectUrl, bucketName: item.bucketName, fileName: agentTarget };
          }
          if (it.id === item.parentId && it.kind === 'bucket') {
            return { ...it, imageUrl: bucketObjectUrl, bucketName, fileName: bucketFile };
          }
          return it;
        });
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

  const handleGenerateAll = useCallback(async () => {
    const agentIds = items.filter((i) => i.kind === 'agent' && i.bucketName && i.fileName).map((i) => i.id);
    await Promise.all(agentIds.map((id) => handleAgentGenerate(id)));
  }, [items, handleAgentGenerate]);

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
          onClick={handleAddAgent}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-600/20 bg-gray-800 text-white hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Add agent"
          title="Add agent"
        >
          + Add Agent
        </button>
        <button
          type="button"
          onClick={handleGenerateAll}
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
            item.kind === 'bucket' ? (
              <Bucket
                key={item.id}
                id={item.id}
                label={item.label}
                imageUrl={item.imageUrl}
                position={item.position}
                isLoading={item.isLoading}
                bucketName={item.bucketName}
                fileName={item.fileName}
                version={listVersion}
                onClick={() => addAgent(item)}
              />
            ) : (
              <Agent
                key={item.id}
                id={item.id}
                label={item.label}
                imageUrl={item.imageUrl}
                position={item.position}
                isLoading={item.isLoading}
                isGenerating={item.isGenerating}
                onGenerate={handleAgentGenerate}
                version={listVersion}
              />
            )
          ))}
        </div>
      </div>
    </div>
  );
}
