/**
 * Framer-motion swipe constants for the match-card deck.
 *
 * Commit thresholds match Tinder's: a card commits if dragged farther than
 * `OFFSET_PX` *or* released with velocity faster than `VELOCITY` (handles
 * quick flicks). Vertical drag opens the modal at half the horizontal
 * threshold so a nudge upward feels intentional.
 */
export const SWIPE_OFFSET_PX = 100;
export const SWIPE_VELOCITY = 500;
export const SWIPE_UP_OFFSET_PX = 60;

export type SwipeDirection = "left" | "right" | "up";

/**
 * Decide whether a drag release should commit, and in which direction.
 * Returns `null` when the gesture should snap back.
 */
export function decideSwipe(args: {
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
}): SwipeDirection | null {
  const { offsetX, offsetY, velocityX, velocityY } = args;
  const horizMag = Math.abs(offsetX);
  const vertMag = Math.abs(offsetY);
  const horizCommit = horizMag > SWIPE_OFFSET_PX || Math.abs(velocityX) > SWIPE_VELOCITY;
  const vertCommit = vertMag > SWIPE_UP_OFFSET_PX || Math.abs(velocityY) > SWIPE_VELOCITY;
  if (horizCommit && horizMag >= vertMag) return offsetX > 0 ? "right" : "left";
  if (vertCommit && offsetY < 0) return "up";
  return null;
}

/** Pixel offset used for the programmatic exit animation when a button is tapped. */
export const EXIT_OFFSET_PX = 600;
