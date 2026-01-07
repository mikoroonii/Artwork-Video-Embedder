import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { renderFrame } from './renderFrame';

export default function App() {

  const previewCanvasRef = useRef(null);
  const exportCanvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const videoRef = useRef(null);
  const ffmpegRef = useRef(null);

  const [artwork, setArtwork] = useState(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fps] = useState(30);
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [draggingCorner, setDraggingCorner] = useState(null);
  const [activeKeyframes, setActiveKeyframes] = useState([]);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [dimensions, setDimensions] = useState({ width: 960, height: 540, ratio: 1.77 });

  const onVideoMeta = () => {
    if (videoRef.current) {
      const v = videoRef.current;
      const w = v.videoWidth;
      const h = v.videoHeight;
      const ratio = w / h;

      if (previewCanvasRef.current) {
        previewCanvasRef.current.width = w;
        previewCanvasRef.current.height = h;
      }

      setDimensions({ width: w, height: h, ratio: ratio });
      setDuration(v.duration);
      setVideoLoaded(true);

      v.currentTime = 0.001;
    }
  };

  const [chromaKey, setChromaKey] = useState({
    color: '#00ff00',
    threshold: 0.15,
    smoothing: 0.1
  });

  const [corners, setCorners] = useState({
    topLeft: { x: 10, y: 10 },
    topRight: { x: 90, y: 10 },
    bottomRight: { x: 90, y: 90 },
    bottomLeft: { x: 10, y: 90 },
  });

  useEffect(() => {
    if (!tempCanvasRef.current) {
      tempCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
        await ffmpeg.load({ coreURL, wasmURL });
        setFfmpegLoaded(true);
      } catch (error) {
        console.error("FFmpeg Load Failed:", error);
      }
    };
    load();
  }, []);

  useEffect(() => {
  window.frame = () => {
    if (!videoRef.current) return "No video loaded.";

    const currentFrame = Math.floor(videoRef.current.currentTime * fps);

    console.log(`%c Current Frame: ${currentFrame} `, 'background: #3b82f6; color: white; font-weight: bold; padding: 2px 4px; border-radius: 3px;');
    console.log(`Timestamp: ${videoRef.current.currentTime.toFixed(3)}s`);

    return currentFrame;
  };

  return () => { delete window.frame; };
}, [fps]);

const drawPreview = useCallback((overrideCorners) => {
  const canvas = previewCanvasRef.current;

  if (!canvas || !tempCanvasRef.current || !videoRef.current || videoRef.current.readyState < 2) return;

  const ctx = canvas.getContext('2d');
  const currentCorners = overrideCorners || corners;

  renderFrame({
    ctx,
    width: canvas.width,
    height: canvas.height,
    video: videoRef.current,
    artwork,
    corners: currentCorners,
    chromaKey,
    tempCanvas: tempCanvasRef.current
  });
}, [artwork, corners, chromaKey]); 

  const handleVideoReady = () => {
    if (videoRef.current) {

      videoRef.current.currentTime = 0.001; 
      setDuration(videoRef.current.duration);
      setVideoLoaded(true);

    }
  };
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => setArtwork(img);
    img.src = URL.createObjectURL(file);
  };

  const handleVideoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

  const url = URL.createObjectURL(file);
  const video = videoRef.current;

  if (video) {

    video.src = url;
    video.dataset.filename = file.name;

    video.onloadeddata = () => {

      video.currentTime = 0.001;

      drawPreview();

      setVideoLoaded(true);
      setDuration(video.duration);
    };

    video.load();
  }
};

const onMouseMoveCanvas = (e) => {
  if (!draggingCorner || !previewCanvasRef.current) return;

  const rect = previewCanvasRef.current.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;

  setCorners(prev => {
    const next = {
      ...prev,
      [draggingCorner]: { 
        x: Math.max(-200, Math.min(300, x)), 
        y: Math.max(-200, Math.min(300, y)) 
      }
    };

    drawPreview(next); 

    return next;
  });
};

  const onMouseUpCanvas = () => setDraggingCorner(null);

  const exportVideo = async () => {
    const video = videoRef.current;
    const canvas = exportCanvasRef.current;
    const ffmpeg = ffmpegRef.current;
    if (!video || !canvas || !ffmpeg || !tempCanvasRef.current) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    setIsExporting(true);
    setProgress(0);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const totalFrames = Math.ceil(video.duration * fps);

    for (let i = 0; i < totalFrames; i++) {
      video.currentTime = i / fps;
      await new Promise(r => video.onseeked = r);

      const exportCorners = getAnimatedCorners(i / fps, fps, activeKeyframes);

      renderFrame({
        ctx,
        width: canvas.width,
        height: canvas.height,
        video,
        artwork,
        corners: exportCorners || corners, 

        chromaKey,
        tempCanvas: tempCanvasRef.current
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const binaryData = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
      await ffmpeg.writeFile(`frame${String(i).padStart(6, '0')}.jpg`, binaryData);
      if (i % 5 === 0) setProgress(Math.round((i / totalFrames) * 90));
    }

    await ffmpeg.writeFile('input.mp4', await fetchFile(video.src));
    await ffmpeg.exec([
      '-framerate', String(fps), '-i', 'frame%06d.jpg', '-i', 'input.mp4',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-map', '0:v', '-map', '1:a?', '-shortest', 'output.mp4'
    ]);

    const out = await ffmpeg.readFile('output.mp4');
    const url = URL.createObjectURL(new Blob([out.buffer], { type: 'video/mp4' }));
    Object.assign(document.createElement('a'), { href: url, download: `vfx_export_${Date.now()}.mp4` }).click();

    setIsExporting(false);
    setProgress(0);
  };

const stateRef = useRef();

useEffect(() => {
  stateRef.current = { corners, chromaKey, videoRef: videoRef.current };
}, [corners, chromaKey]);

useEffect(() => {
  window.getPreset = () => {
    const { corners, chromaKey, videoRef } = stateRef.current;

    const filename = videoRef?.dataset.filename || "unknown.mp4";

    const preset = [
      {
        name: "New Preset",
        videoFile: filename,
        chromakeyColor: chromaKey.color,
        chromakeyThreshold: chromaKey.threshold,
        chromakeySmoothing: chromaKey.smoothing,
        topLeft_X: parseFloat(corners.topLeft.x.toFixed(2)),
        topLeft_Y: parseFloat(corners.topLeft.y.toFixed(2)),
        topRight_X: parseFloat(corners.topRight.x.toFixed(2)),
        topRight_Y: parseFloat(corners.topRight.y.toFixed(2)),
        bottomRight_X: parseFloat(corners.bottomRight.x.toFixed(2)),
        bottomRight_Y: parseFloat(corners.bottomRight.y.toFixed(2)),
        bottomLeft_X: parseFloat(corners.bottomLeft.x.toFixed(2)),
        bottomLeft_Y: parseFloat(corners.bottomLeft.y.toFixed(2))
      }
    ];

    console.log("--- EXPORTED PRESET ---");
    console.log(JSON.stringify(preset, null, 4));
    console.log("-----------------------");
    return "Preset printed to console above.";
  };

  return () => { delete window.getPreset; };
}, []);

const [presetList, setPresetList] = useState([]);

useEffect(() => {
  fetch('/presets.json')
    .then(res => {

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new TypeError("Oops, we didn't get JSON! Check your file path.");
      }

      return res.json();
    })
    .then(data => {
      if (Array.isArray(data)) {
        setPresetList(data);
      }
    })
    .catch(err => console.error("Error loading presets:", err));
}, []);

const applyPreset = (preset) => {
  if (!videoRef.current) return;

  setVideoLoaded(false);
  const videoPath = `/videos/${preset.videoFile}`;
  videoRef.current.src = videoPath;
  videoRef.current.dataset.filename = preset.videoFile;
  videoRef.current.load();

  setChromaKey({
    color: preset.chromakeyColor,
    threshold: preset.chromakeyThreshold,
    smoothing: preset.chromakeySmoothing
  });

  if (preset.frameChanges && preset.frameChanges.length > 0) {

    setActiveKeyframes(preset.frameChanges);

    const firstFrame = getAnimatedCorners(0, fps, preset.frameChanges);
    setCorners(firstFrame);

    console.log(`Loaded animated preset: ${preset.name} (${preset.frameChanges.length} keyframes)`);
  } else {

    setActiveKeyframes([]); 

    setCorners({
      topLeft: { x: preset.topLeft_X, y: preset.topLeft_Y },
      topRight: { x: preset.topRight_X, y: preset.topRight_Y },
      bottomRight: { x: preset.bottomRight_X, y: preset.bottomRight_Y },
      bottomLeft: { x: preset.bottomLeft_X, y: preset.bottomLeft_Y },
    });

    console.log(`Loaded static preset: ${preset.name}`);
  }
};

const getAnimatedCorners = (currentTime, fps, frameChanges) => {
  if (!frameChanges || frameChanges.length === 0) return null;

  const currentFrame = Math.round(currentTime * fps);
  const sorted = [...frameChanges].sort((a, b) => a.frame - b.frame);

  if (currentFrame < sorted[0].frame) {
    const s = sorted[0];
    return {
      topLeft: { x: s.topLeft_X, y: s.topLeft_Y },
      topRight: { x: s.topRight_X, y: s.topRight_Y },
      bottomRight: { x: s.bottomRight_X, y: s.bottomRight_Y },
      bottomLeft: { x: s.bottomLeft_X, y: s.bottomLeft_Y }
    };
  }

  if (currentFrame >= sorted[sorted.length - 1].frame) {
    const s = sorted[sorted.length - 1];
    return {
      topLeft: { x: s.topLeft_X, y: s.topLeft_Y },
      topRight: { x: s.topRight_X, y: s.topRight_Y },
      bottomRight: { x: s.bottomRight_X, y: s.bottomRight_Y },
      bottomLeft: { x: s.bottomLeft_X, y: s.bottomLeft_Y }
    };
  }

  let startNode = sorted[0];
  let endNode = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].frame <= currentFrame) {
      startNode = sorted[i];
    } else {
      endNode = sorted[i];
      break;
    }
  }

  if (startNode.interpolate === false) {
    return {
      topLeft: { x: startNode.topLeft_X, y: startNode.topLeft_Y },
      topRight: { x: startNode.topRight_X, y: startNode.topRight_Y },
      bottomRight: { x: startNode.bottomRight_X, y: startNode.bottomRight_Y },
      bottomLeft: { x: startNode.bottomLeft_X, y: startNode.bottomLeft_Y }
    };
  }

  const t = (currentFrame - startNode.frame) / (endNode.frame - startNode.frame);
  const lerp = (a, b, amt) => a + (b - a) * amt;

  return {
    topLeft: { x: lerp(startNode.topLeft_X, endNode.topLeft_X, t), y: lerp(startNode.topLeft_Y, endNode.topLeft_Y, t) },
    topRight: { x: lerp(startNode.topRight_X, endNode.topRight_X, t), y: lerp(startNode.topRight_Y, endNode.topRight_Y, t) },
    bottomRight: { x: lerp(startNode.bottomRight_X, endNode.bottomRight_X, t), y: lerp(startNode.bottomRight_Y, endNode.bottomRight_Y, t) },
    bottomLeft: { x: lerp(startNode.bottomLeft_X, endNode.bottomLeft_X, t), y: lerp(startNode.bottomLeft_Y, endNode.bottomLeft_Y, t) }
  };
};

const lastVideoTimeRef = useRef(-1);

useEffect(() => {
  let frameId;

  const loop = () => {
    const video = videoRef.current;
    if (!video) {
      frameId = requestAnimationFrame(loop);
      return;
    }
    const videoTime = video.currentTime;
    if (isPlaying && Math.abs(videoTime - currentTime) > 0.1) {
      setCurrentTime(videoTime);
    }

    const isVideoAdvancing = videoTime !== lastVideoTimeRef.current;

    const hasAnimation = activeKeyframes && activeKeyframes.length > 0;

    const isInteracting = draggingCorner !== null;

    if (isVideoAdvancing || hasAnimation || isInteracting) {
      lastVideoTimeRef.current = videoTime;

      if (isPlaying && Math.floor(videoTime * 2) !== Math.floor(currentTime * 2)) {
        setCurrentTime(videoTime);
      }

      if (hasAnimation) {
        const animated = getAnimatedCorners(videoTime, fps, activeKeyframes);
        drawPreview(animated);
      } else {
        drawPreview(corners);
      }
    }

    frameId = requestAnimationFrame(loop);
  };

  loop();
  return () => cancelAnimationFrame(frameId);
}, [isPlaying, activeKeyframes, corners, draggingCorner, drawPreview, fps]);

  return (
<div className="editor-container" onMouseMove={onMouseMoveCanvas} onMouseUp={onMouseUpCanvas}>
    <aside className="sidebar">
      <div className="app-header">
        <h1>video image embedder</h1>
        <h3>aka put the thing in the thing without having to download a thing to do the thing</h3>
      </div>
        <section className="control-group">
          <h3>Presets Library</h3>
          <div className="preset-list">
            {presetList.length === 0 && <span style={{fontSize: '0.8rem', color: '#666'}}>No presets found...</span>}
            {presetList.map((p, index) => (
              <button 
                key={index}
                className="btn-primary"
                style={{ 
                  background: '#333', 
                  fontSize: '0.8rem', 
                  textAlign: 'left',
                  padding: '8px' 
                }}
                onClick={() => applyPreset(p)}
              >
                {p.name}
                <div style={{ fontSize: '0.65rem', color: '#666' }}>{p.videoFile}</div>
              </button>
            ))}
          </div>
        </section>
        <section className="control-group">
          <h3>Media</h3>
          <label className="btn-primary" style={{ textAlign: 'center', cursor: 'pointer' }}>
            Upload Image
            <input type="file" hidden accept="image/*" onChange={handleImageUpload} />
          </label>
          <label className="btn-primary" style={{ textAlign: 'center', background: '#333', cursor: 'pointer' }}>
            Upload Video
            <input type="file" hidden accept="video/*" onChange={handleVideoSelect} />
          </label>
        </section>

        <section className="control-group">
          <h3>Chroma Key</h3>
          <div className="input-row">
            <span>Key Color</span>
            <input type="color" value={chromaKey.color} onChange={e => setChromaKey(p => ({ ...p, color: e.target.value }))} />
          </div>
          <div className="input-row">
            <span>Threshold</span>
            <input type="range" min="0" max="1" step="0.01" value={chromaKey.threshold} onChange={e => setChromaKey(p => ({ ...p, threshold: parseFloat(e.target.value) }))} />
          </div>
          <div className="input-row">
            <span>Smoothing</span>
            <input type="range" min="0" max="1" step="0.01" value={chromaKey.smoothing} onChange={e => setChromaKey(p => ({ ...p, smoothing: parseFloat(e.target.value) }))} />
          </div>
        </section>

        <section className="control-group" style={{ marginTop: 'auto' }}>
          <button className="btn-primary" disabled={!ffmpegLoaded || isExporting || !artwork || !videoLoaded} onClick={exportVideo}>
            {isExporting ? 'Exporting...' : 'Export MP4'}
          </button>
          {isExporting && (
            <div className="progress-bar-container">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          )}
        </section>
      </aside>

    <main className="main-view">
      <div className="canvas-container">
        {}
        <div className="canvas-wrapper">
          <canvas 
            ref={previewCanvasRef} 
            style={{ 
              display: 'block',
              maxWidth: '100%', 
              maxHeight: '75vh', 

              width: 'auto', 
              height: 'auto' 
            }} 
          />

          {}
          {Object.entries(corners).map(([key, p]) => (
            <div
              key={key}
              onMouseDown={(e) => { e.preventDefault(); setDraggingCorner(key); }}
              style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: '16px',
                height: '16px',
                background: '#3b82f6',
                border: '2px solid #fff',
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                cursor: 'crosshair',
                zIndex: 10
              }}
            />
          ))}
        </div>
      </div>

      <div className="timeline-container" style={{ width: '100%', maxWidth: '960px', marginTop: '20px' }}>
        <input type="range" style={{ width: '100%' }} min={0} max={duration || 0} step={0.01} value={currentTime}
          onChange={e => {
            const t = parseFloat(e.target.value);
            videoRef.current.currentTime = t;
            setCurrentTime(t);
          }}
        />
        <div className="input-row" style={{ marginTop: '8px' }}>
          <button onClick={() => {
            isPlaying ? videoRef.current.pause() : videoRef.current.play();
            setIsPlaying(!isPlaying);
          }} className="btn-primary">
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <span>{currentTime.toFixed(2)}s / {duration.toFixed(2)}s</span>
        </div>
      </div>
    </main>

    <video 
      ref={videoRef} 
      style={{ display: 'none' }} 
      onLoadedMetadata={onVideoMeta} 

      onSeeked={drawPreview} 
    />
    <canvas ref={exportCanvasRef} style={{ display: 'none' }} />
  </div>
  );
}