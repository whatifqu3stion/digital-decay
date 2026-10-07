/**
 * Procedural DSP Glitch & Entropy Engine
 * Fallback synthesizer that performs real pixel-level recursive decay on HTML5 Canvas
 * Recreates chromatic aberration, datamosh slice displacement, scanlines, and compression drift.
 */

export interface ProceduralOptions {
  injections: string[];
  decayRate: number;
  frameIndex: number;
}

export async function processProceduralFrame(
  sourceBlob: Blob,
  options: ProceduralOptions
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(sourceBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const size = 512;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        resolve(sourceBlob);
        return;
      }

      // Draw previous frame
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;
      const decay = options.decayRate || 1.0;
      const frame = options.frameIndex;

      // 1. Color drift & analog saturation based on decay constant
      const noiseAmp = (decay - 0.5) * 6;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.05 * decay) {
          const noise = (Math.random() - 0.5) * noiseAmp * 4;
          data[i] = Math.min(255, Math.max(0, data[i] + noise)); // R
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise * 0.8)); // G
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise * 1.2)); // B
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // 2. Chromatic Aberration (R/B channel split)
      if (options.injections.includes('CHROMATIC_ABERRATION') || decay > 1.1) {
        const shift = Math.max(1, Math.round(2 * decay));
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(canvas, -shift, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';
      }

      // 3. Datamosh Slice Displacement (Horizontal block tears)
      if (options.injections.includes('DATAMOSH_GLITCHING') || decay > 1.25) {
        const tearCount = Math.floor(Math.random() * 3) + 1;
        for (let t = 0; t < tearCount; t++) {
          const y = Math.floor(Math.random() * (size - 30));
          const h = Math.floor(Math.random() * 25) + 5;
          const offset = (Math.random() - 0.5) * 16 * decay;
          ctx.drawImage(canvas, 0, y, size, h, offset, y, size, h);
        }
      }

      // 4. Scanline phosphor bleeding
      if (options.injections.includes('SCANLINE_GHOSTING')) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        for (let y = 0; y < size; y += 4) {
          ctx.fillRect(0, y, size, 1.5);
        }
      }

      // 5. VHS distortion & tracking flutter
      if (options.injections.includes('VHS_DISTORTION')) {
        const vhsY = (frame * 17) % size;
        ctx.fillStyle = 'rgba(0, 255, 213, 0.08)';
        ctx.fillRect(0, vhsY, size, 4);
        ctx.fillStyle = 'rgba(255, 0, 127, 0.08)';
        ctx.fillRect(0, (vhsY + 8) % size, size, 3);
      }

      // 6. JPEG block quantization
      if (options.injections.includes('JPEG_ARTIFACTS')) {
        const mini = document.createElement('canvas');
        mini.width = 256;
        mini.height = 256;
        const mctx = mini.getContext('2d');
        if (mctx) {
          mctx.drawImage(canvas, 0, 0, 256, 256);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(mini, 0, 0, size, size);
        }
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          resolve(sourceBlob);
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("FAILED_TO_LOAD_CANVAS_SOURCE"));
    };

    img.src = objectUrl;
  });
}
