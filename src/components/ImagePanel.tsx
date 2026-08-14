/**
 * ImagePanel — todo 12. REUSABLE image + overlay + coordinate-aware hit
 * feedback, used by BOTH game modes (spot-diff dual panels and find-area
 * single panel, todos 13/14).
 *
 * Coordinate contract (single canonical pipeline from todo 7):
 * - Differences are authored in image-NATIVE pixels.
 * - The transform is computed from the ACTUAL laid-out element box after the
 *   image loads (`img.onload` + `getBoundingClientRect` + a ResizeObserver),
 *   so `object-fit: contain` letterboxing is always accounted for — never
 *   `offsetWidth/naturalWidth` shortcuts.
 * - Taps go native via `toNativeCoords` → `findHitDifference` → onHit/onMiss.
 *
 * NO Canvas. NO hardcoded image dimensions.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { CSSProperties } from 'preact';
import type { Difference } from '@shared/types';
import {
  computeContainTransform,
  findHitDifference,
  toDisplayCoords,
  toNativeCoords,
  type ContainTransform,
  type ElementRect,
} from '@/utils/hitDetection';

export interface ImagePanelProps {
  /** Image URL (http(s) external or R2-resolved by the caller). */
  src: string;
  /** All differences of the question, in image-NATIVE pixels. */
  differences: readonly Difference[];
  /** Indices into `differences` already found — markers shown, taps skipped. */
  foundIndices: readonly number[];
  /** Fired with the index of the first UNFOUND difference hit. */
  onHit: (index: number) => void;
  /** Fired when a tap lands on no unfound difference (incl. letterbox). */
  onMiss: () => void;
  /** Blocks ALL hit handling (cooldown / phase guard) — no onHit/onMiss. */
  disabled: boolean;
}

/** Fresh measurement: the element box (viewport-relative) + contain transform. */
interface Geometry {
  rect: ElementRect;
  transform: ContainTransform;
}

/** Element-relative marker box in display px (numbers; Preact appends px). */
export interface MarkerStyle extends CSSProperties {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: string;
}

/**
 * Compute the absolute-positioning style of a found-difference marker in
 * DISPLAY space (element-relative, letterbox offsets included), dispatching
 * on `difference.type`:
 * - circle → toDisplayCoords(x−radius, y−radius), size 2·radius·scale, 50%
 * - rect   → toDisplayCoords(x, y), size width·scale × height·scale, 8px
 *
 * Pure — exported for unit testing. Malformed runtime data returns null
 * (never throws), mirroring findHitDifference's defensive default.
 */
export function differenceMarkerStyle(
  difference: Difference,
  transform: ContainTransform,
): MarkerStyle | null {
  switch (difference.type) {
    case 'circle': {
      const pos = toDisplayCoords(
        difference.x - difference.radius,
        difference.y - difference.radius,
        transform,
      );
      const size = 2 * difference.radius * transform.scale;
      return { left: pos.x, top: pos.y, width: size, height: size, borderRadius: '50%' };
    }
    case 'rect': {
      const pos = toDisplayCoords(difference.x, difference.y, transform);
      return {
        left: pos.x,
        top: pos.y,
        width: difference.width * transform.scale,
        height: difference.height * transform.scale,
        // Plan-mandated 8px (small decorative badge, not an interactive/card
        // surface — the ≥12px design rule targets those).
        borderRadius: '8px',
      };
    }
    default:
      return null;
  }
}

export function ImagePanel({
  src,
  differences,
  foundIndices,
  onHit,
  onMiss,
  disabled,
}: ImagePanelProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  /** Re-measure the img element box and recompute the contain transform. */
  const syncGeometry = useCallback(() => {
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0) return;
    const rect = img.getBoundingClientRect();
    // Not laid out yet (display:none / 0 box) — wait for a later resize.
    if (rect.width === 0 || rect.height === 0) return;
    setGeometry({
      rect: { left: rect.left, top: rect.top },
      transform: computeContainTransform(
        img.naturalWidth,
        img.naturalHeight,
        rect.width,
        rect.height,
      ),
    });
  }, []);

  // Keep the transform fresh across layout shifts (viewport resize, URL bar,
  // orientation change) so pointer handlers always use current values.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncGeometry);
    observer.observe(img);
    return () => observer.disconnect();
  }, [syncGeometry]);

  const handlePointerDown = (event: PointerEvent) => {
    event.preventDefault();
    if (disabled || geometry === null) return;
    const native = toNativeCoords(
      event.clientX,
      event.clientY,
      geometry.rect,
      geometry.transform,
    );
    const index = findHitDifference(native, differences, foundIndices);
    if (index >= 0) onHit(index);
    else onMiss();
  };

  return (
    <div className="image-panel">
      {/* object-fit: contain — the actual box is measured on load, so any
          letterboxing (consumer-constrained height) is transform-aware. */}
      <img
        ref={imgRef}
        className="image-panel-img"
        src={src}
        alt=""
        draggable={false}
        onLoad={syncGeometry}
      />
      {/* Full-element overlay captures precision taps; touch-action: none is
          the reserved .game-surface token (design system section 8). */}
      <div
        className="game-surface image-panel-overlay"
        onPointerDown={handlePointerDown}
        aria-hidden="true"
      />
      {geometry !== null &&
        differences.map((difference, index) => {
          if (!foundIndices.includes(index)) return null;
          const style = differenceMarkerStyle(difference, geometry.transform);
          if (style === null) return null;
          return (
            <div key={index} className="image-panel-marker" style={style} aria-hidden="true" />
          );
        })}
    </div>
  );
}
