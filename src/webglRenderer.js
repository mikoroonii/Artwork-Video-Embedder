/**
 * webglRenderer.js
 * Optimized for high-performance video warping and chroma keying.
 */

let gl;
let program;
let positionBuffer;
let texCoordBuffer;
const textureCache = new Map();

const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = vec4(a_position, 0, 1);
        v_texCoord = a_texCoord;
    }
`;

const fsSource = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform bool u_useChroma;
    uniform vec3 u_keyColor;
    uniform float u_threshold;
    uniform float u_smoothing;

    void main() {
        vec4 texColor = texture2D(u_image, v_texCoord);
        if (u_useChroma) {
            float diff = distance(texColor.rgb, u_keyColor);
            float alpha = smoothstep(u_threshold, u_threshold + u_smoothing, diff);
            gl_FragColor = vec4(texColor.rgb, texColor.a * alpha);
        } else {
            gl_FragColor = texColor;
        }
    }
`;

function initGL(canvas) {
    if (gl) return gl;
    gl = canvas.getContext('webgl', { 
        premultipliedAlpha: false, 
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
    });
    
    if (!gl) return null;

    const vShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    const fShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    
    program = gl.createProgram();
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);

    positionBuffer = gl.createBuffer();
    texCoordBuffer = gl.createBuffer();
    
    return gl;
}

function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function getTexture(gl, source) {
    // We cache based on the type of layer to ensure we reuse the same GPU memory buckets
    const isVideo = source instanceof HTMLVideoElement;
    const cacheKey = isVideo ? 'video_layer' : 'artwork_layer';
    
    if (!textureCache.has(cacheKey)) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        // Custom properties to track initialization and dimensions
        tex.isInitialized = false;
        tex.width = 0;
        tex.height = 0;
        
        textureCache.set(cacheKey, tex);
    }
    return textureCache.get(cacheKey);
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}

export function drawWarpedImage(canvas, source, corners, chromaKey) {
    const gl = initGL(canvas);
    if (!gl || !corners) return;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);

    // 1. Perspective Math (0-100% to -1 to 1)
    const getPoint = (p) => [(p.x / 50) - 1, 1 - (p.y / 50)];
    const p1 = getPoint(corners.topLeft);
    const p2 = getPoint(corners.topRight);
    const p3 = getPoint(corners.bottomLeft);
    const p4 = getPoint(corners.bottomRight);

    const positions = new Float32Array([...p1, ...p2, ...p3, ...p3, ...p2, ...p4]);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // 2. Optimized Texture Handling
    const tex = getTexture(gl, source);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    const currentWidth = source.videoWidth || source.width;
    const currentHeight = source.videoHeight || source.height;

    // Fast path check: Initialize if first time or if dimensions changed
    if (!tex.isInitialized || tex.width !== currentWidth || tex.height !== currentHeight) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        tex.isInitialized = true;
        tex.width = currentWidth;
        tex.height = currentHeight;
    } else {
        // Blazing fast pixel-only update
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    // 3. Chroma Key Uniforms
    const useChroma = !!chromaKey;
    gl.uniform1i(gl.getUniformLocation(program, "u_useChroma"), useChroma ? 1 : 0);
    if (useChroma) {
        const rgb = hexToRgb(chromaKey.color);
        gl.uniform3fv(gl.getUniformLocation(program, "u_keyColor"), rgb);
        gl.uniform1f(gl.getUniformLocation(program, "u_threshold"), chromaKey.threshold);
        gl.uniform1f(gl.getUniformLocation(program, "u_smoothing"), chromaKey.smoothing);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}