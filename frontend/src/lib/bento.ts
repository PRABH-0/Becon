import { BriefingCard } from "@/types/card";

export function computeBentoSpans(total: number): number[] {
  const spans: number[] = [];
  let remaining = total;
  let flip = true;

  while (remaining > 0) {
    if (remaining === 1) {
      spans.push(3);
      remaining -= 1;
    } else if (remaining === 3) {
      spans.push(1, 1, 1);
      remaining -= 3;
    } else if (remaining === 4) {
      spans.push(1, 1, 1, 3);
      remaining -= 4;
    } else {
      if (flip) {
        spans.push(2, 1);
      } else {
        spans.push(1, 2);
      }
      flip = !flip;
      remaining -= 2;
    }
  }
  return spans;
}

/**
 * Resolves an image for a card ONLY if it genuinely came from the article's source blog/resource.
 * Never returns a random, stock, or fallback image. If no genuine image exists, returns null so a clean text card is rendered.
 */
export function resolveUniqueCardImage(card: BriefingCard | null | undefined): string | null {
  if (!card) return null;
  if (card.is_real_image && card.image_url && card.image_url.trim().length > 0) {
    const url = card.image_url.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
  }
  return null;
}
