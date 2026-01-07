import { drawWarpedImage } from './webglRenderer';

export function renderFrame({ ctx, width, height, video, artwork, corners, chromaKey, tempCanvas }) {
  // 1. ADD THIS GUARD: If corners or essential nested properties are missing, abort.
  if (!corners || !corners.topLeft || !corners.bottomRight || !ctx || !tempCanvas) {
    return; 
  }

  if (tempCanvas.width !== width || tempCanvas.height !== height) {
    tempCanvas.width = width;
    tempCanvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);
  // --- LAYER 1: The Artwork (Background) ---
  // We draw this FIRST so it sits at the bottom of the stack
  if (artwork && artwork.complete) {
    // We pass null for chromaKey because we DON'T want to key the artwork
    drawWarpedImage(tempCanvas, artwork, corners, null);
    ctx.drawImage(tempCanvas, 0, 0, width, height);
  }

  // --- LAYER 2: The Video (Foreground) ---
  // We draw this SECOND so it sits on top of the artwork
  if (video && video.readyState >= 2) {
    const fullScreen = {
      topLeft: { x: 0, y: 0 }, topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 100 }, bottomLeft: { x: 0, y: 100 }
    };
    
    // We pass the chromaKey here to remove the green from the foreground video
    drawWarpedImage(tempCanvas, video, fullScreen, chromaKey);
    ctx.drawImage(tempCanvas, 0, 0, width, height);
  }
}