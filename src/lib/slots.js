/**
 * Image slots (CONTENT_CMS_SPEC.md §6). A slot fixes the shape of an image so the
 * website and the CMS show it whole, without cropping.
 *
 * ratio:    width / height the image must match (±1%), or null for a free shape.
 * range:    for free shapes, the allowed [min, max] width / height.
 * min:      minimum width and height in px (fixed shapes).
 * minLong:  minimum long side in px (award).
 * minWidth: minimum width in px (blogInline).
 * widths:   stored widths, largest first. The largest becomes the main url.
 *
 * Minimums follow the photos Little Elly has today (about 1024 px wide). Larger
 * photos are welcome and are stored up to the first width.
 */
export const SLOTS = {
  teamPerson: { label: "3:4 portrait", ratio: 3 / 4, ratioText: "3:4", min: [768, 1024], widths: [900, 450] },
  teamGroup: { label: "16:10 landscape", ratio: 16 / 10, ratioText: "16:10", min: [1024, 640], widths: [1600, 800] },
  award: { label: "any shape up to 1.6:1", ratio: null, range: [1 / 1.6, 1.6], minLong: 600, widths: [1200, 400] },
  programCard: { label: "1:1 square", ratio: 1, ratioText: "1:1", min: [1000, 1000], widths: [1000, 500] },
  programDetail: { label: "4:3 landscape", ratio: 4 / 3, ratioText: "4:3", min: [1024, 768], widths: [1600, 800] },
  voice: { label: "16:10 landscape", ratio: 16 / 10, ratioText: "16:10", min: [1024, 640], widths: [1280, 640] },
  news: { label: "16:9 landscape", ratio: 16 / 9, ratioText: "16:9", min: [1024, 576], widths: [1280, 640] },
  blogCover: { label: "16:9 landscape", ratio: 16 / 9, ratioText: "16:9", min: [1024, 576], widths: [1600, 800] },
  blogInline: { label: "any shape from 1:2 to 3:1", ratio: null, range: [1 / 2, 3], minWidth: 1000, widths: [1600, 800] },
  share: { label: "1.91:1 share image", ratio: 1200 / 630, ratioText: "1.91:1", min: [1200, 630], widths: [1200] },
  // Organisation logo for search results (site settings). Google needs at least 112 px.
  logo: { label: "any shape up to 4:1", ratio: null, range: [1 / 4, 4], minLong: 112, widths: [512] },
};

export const SLOT_NAMES = Object.keys(SLOTS);
export const MAX_SLOT_BYTES = 8 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
const TOLERANCE = 0.01;

function sizeText(width, height) {
  return `${width} × ${height} px`;
}

/** Returns an error message when the size breaks the slot rule, otherwise "". */
export function slotError(slotName, width, height) {
  const slot = SLOTS[slotName];
  if (!slot) return "Choose where this image is used.";
  if (!width || !height) return "That image could not be read.";
  const actual = width / height;
  const found = `This one is ${sizeText(width, height)}.`;

  if (slot.ratio) {
    const [minW, minH] = slot.min;
    const wrongShape = Math.abs(actual / slot.ratio - 1) > TOLERANCE;
    if (wrongShape || width < minW || height < minH) {
      return `Use a ${slot.ratioText} photo at least ${sizeText(minW, minH)}. ${found}`;
    }
    return "";
  }

  const [low, high] = slot.range;
  if (actual < low - low * TOLERANCE || actual > high + high * TOLERANCE) {
    return `Use an image shaped ${slot.label}. ${found}`;
  }
  if (slot.minLong && Math.max(width, height) < slot.minLong) {
    return `Use an image with a long side of at least ${slot.minLong} px. ${found}`;
  }
  if (slot.minWidth && width < slot.minWidth) {
    return `Use an image at least ${slot.minWidth} px wide. ${found}`;
  }
  return "";
}

/** Widths to store for an image of this width: the slot widths, never upscaled, no duplicates. */
export function storedWidths(slotName, width) {
  const slot = SLOTS[slotName];
  const widths = slot.widths.map((w) => Math.min(w, width));
  return [...new Set(widths)].sort((a, b) => b - a);
}

/** Help line shown under an upload field (IMG-7). */
export function slotHelp(slotName) {
  const slot = SLOTS[slotName];
  if (!slot) return "";
  let size = "";
  if (slot.min) size = `min ${sizeText(...slot.min)}`;
  else if (slot.minLong) size = `long side min ${slot.minLong} px`;
  else if (slot.minWidth) size = `min ${slot.minWidth} px wide`;
  return `${slot.label} · ${size} · JPG, PNG or WebP · max 8 MB`;
}
