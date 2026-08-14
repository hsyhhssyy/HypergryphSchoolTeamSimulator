/**
 * Coordinate transform + hit detection utilities (single canonical pipeline).
 *
 * Every conversion between client/display space and image-NATIVE pixel space
 * goes through {@link computeContainTransform} — there is NO implicit
 * letterboxing anywhere else. All functions are pure: they never touch the
 * DOM (rectangles are passed in as arguments) and never mutate their inputs.
 */
import type { Difference } from '@shared/types';

/** A 2D point. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The linear mapping between image-native pixels and the element box that
 * displays the image with `object-fit: contain`.
 * `scale` multiplies native coords; `offsetX`/`offsetY` are the letterbox
 * margins added afterwards (element-relative display space).
 */
export interface ContainTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Minimal rectangle — anything with `left`/`top` (e.g. getBoundingClientRect). */
export interface ElementRect {
  left: number;
  top: number;
}

/**
 * Compute the object-fit: contain mapping from a natural image size to a
 * display element size. `scale = min(elementW/naturalW, elementH/naturalH)`
 * and the letterbox margin goes into offsetX/offsetY (centered).
 */
export function computeContainTransform(
  naturalW: number,
  naturalH: number,
  elementW: number,
  elementH: number,
): ContainTransform {
  const scale = Math.min(elementW / naturalW, elementH / naturalH);
  return {
    scale,
    offsetX: (elementW - naturalW * scale) / 2,
    offsetY: (elementH - naturalH * scale) / 2,
  };
}

/**
 * Convert client (viewport) coordinates into image-NATIVE pixels, given the
 * element's bounding rect and the contain transform. The letterbox margins
 * mean the result can fall outside [0, naturalW]×[0, naturalH].
 */
export function toNativeCoords(
  clientX: number,
  clientY: number,
  rect: ElementRect,
  transform: ContainTransform,
): Point {
  return {
    x: (clientX - rect.left - transform.offsetX) / transform.scale,
    y: (clientY - rect.top - transform.offsetY) / transform.scale,
  };
}

/**
 * Convert image-NATIVE pixels into element-relative display coords
 * (position relative to the top-left of the element, letterbox included).
 * Inverse of {@link toNativeCoords}.
 */
export function toDisplayCoords(
  nativeX: number,
  nativeY: number,
  transform: ContainTransform,
): Point {
  return {
    x: nativeX * transform.scale + transform.offsetX,
    y: nativeY * transform.scale + transform.offsetY,
  };
}

/** AABB hit test via squared distance — no `Math.sqrt`. Boundary inclusive. */
export function isPointInCircle(
  x: number,
  y: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Axis-aligned rectangle hit test. Boundary inclusive. */
export function isPointInRect(
  x: number,
  y: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function isPointInDifference(point: Point, difference: Difference): boolean {
  switch (difference.type) {
    case 'circle':
      return isPointInCircle(
        point.x,
        point.y,
        difference.x,
        difference.y,
        difference.radius,
      );
    case 'rect':
      return isPointInRect(
        point.x,
        point.y,
        difference.x,
        difference.y,
        difference.width,
        difference.height,
      );
    default:
      // Malformed runtime data (differences arrive from the network / D1 as
      // parsed JSON, so the compile-time type is not a runtime guarantee).
      // Treat unknown shapes as no-hit rather than throwing.
      return false;
  }
}

/**
 * Return the index of the FIRST not-yet-found difference hit by the given
 * native-space point, or -1 if none. `foundIndices` (indices into
 * `differences`) are skipped; neither input is mutated.
 */
export function findHitDifference(
  nativeCoords: Point,
  differences: readonly Difference[],
  foundIndices: readonly number[],
): number {
  for (let i = 0; i < differences.length; i++) {
    const difference = differences[i];
    if (difference === undefined || foundIndices.includes(i)) continue;
    if (isPointInDifference(nativeCoords, difference)) return i;
  }
  return -1;
}
