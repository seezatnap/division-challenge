import type { GeminiGeneratedImage } from "./gemini-image-service";

const FALLBACK_REWARD_IMAGE_MODEL = "local-fallback-svg";
const FALLBACK_REWARD_IMAGE_MIME_TYPE = "image/svg+xml";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toFallbackRewardSvgMarkup(dinosaurName: string): string {
  const escapedDinosaurName = escapeXml(dinosaurName);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-label="Dinosaur reward image">',
    "  <defs>",
    '    <linearGradient id="amberGradient" x1="0%" y1="0%" x2="100%" y2="100%">',
    '      <stop offset="0%" stop-color="#f4e2b0"/>',
    '      <stop offset="55%" stop-color="#d2b574"/>',
    '      <stop offset="100%" stop-color="#8f6a2f"/>',
    "    </linearGradient>",
    '    <radialGradient id="glowGradient" cx="50%" cy="42%" r="68%">',
    '      <stop offset="0%" stop-color="rgba(255, 241, 204, 0.95)"/>',
    '      <stop offset="100%" stop-color="rgba(255, 241, 204, 0)"/>',
    "    </radialGradient>",
    "  </defs>",
    '  <rect width="960" height="540" fill="url(#amberGradient)"/>',
    '  <rect x="28" y="28" width="904" height="484" rx="28" fill="rgba(39, 31, 21, 0.22)" stroke="rgba(255, 236, 188, 0.55)" stroke-width="2"/>',
    '  <circle cx="480" cy="240" r="230" fill="url(#glowGradient)"/>',
    '  <text x="480" y="208" fill="#2f2215" font-size="40" font-family="Georgia, serif" font-weight="700" text-anchor="middle" letter-spacing="3">DINOSAUR UNLOCKED</text>',
    `  <text x="480" y="282" fill="#2f2215" font-size="62" font-family="Georgia, serif" font-weight="700" text-anchor="middle">${escapedDinosaurName}</text>`,
    '  <text x="480" y="340" fill="#2f2215" font-size="24" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="2">GENERATION FALLBACK ACTIVE</text>',
    "</svg>",
  ].join("\n");
}

export function createFallbackRewardImage(dinosaurName: string): GeminiGeneratedImage {
  const normalizedDinosaurName = dinosaurName.trim();
  if (normalizedDinosaurName.length === 0) {
    throw new Error("dinosaurName must be a non-empty string.");
  }

  const svgMarkup = toFallbackRewardSvgMarkup(normalizedDinosaurName);

  return {
    dinosaurName: normalizedDinosaurName,
    prompt: `Fallback reward image for ${normalizedDinosaurName}.`,
    model: FALLBACK_REWARD_IMAGE_MODEL,
    mimeType: FALLBACK_REWARD_IMAGE_MIME_TYPE,
    imageBase64: Buffer.from(svgMarkup, "utf8").toString("base64"),
  };
}
