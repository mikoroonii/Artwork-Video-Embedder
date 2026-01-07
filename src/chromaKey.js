export function applyChromaKey(imageData, { color, threshold, smoothing }) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!m) return imageData;

  const targetR = parseInt(m[1], 16);
  const targetG = parseInt(m[2], 16);
  const targetB = parseInt(m[3], 16);

  const data = imageData.data;
  // Use squared thresholds to avoid Math.sqrt() in the loop
  const tSq = Math.pow(threshold * 255, 2);
  const sSq = Math.pow(smoothing * 255, 2);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const distSq = (r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2;

    if (distSq < tSq) {
      data[i + 3] = 0;
    } else if (distSq < tSq + sSq) {
      // Simple linear falloff for smoothing
      const fraction = (Math.sqrt(distSq) - Math.sqrt(tSq)) / (smoothing * 255);
      data[i + 3] = fraction * 255;
    }
  }
  return imageData;
}