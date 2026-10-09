import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { redactApiError } from './utils/keyUtils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// High payload limit for image data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const BASE_ROT_PROMPT = 'Preserve the shapes and basic colors of the previous iteration.';

const INJECTION_MAP: Record<string, string> = {
  CHROMATIC_ABERRATION: ' Introduce extremely subtle, barely perceptible chromatic aberration.',
  JPEG_ARTIFACTS: ' Introduce very slight, subtle jpeg compression artifacts.',
  SCANLINE_GHOSTING: ' Add very faint, subtle scanline ghosting.',
  DATAMOSH_GLITCHING: ' Introduce very subtle, minor data moshing glitches.',
  VHS_DISTORTION: ' Introduce very slight VHS-style distortion, faint noise, and subtle color bleed.'
};

// POST /api/decay - Server-side image decay endpoint
app.post('/api/decay', async (req, res) => {
  try {
    const { image, mimeType = 'image/png', options } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    // Strict Per-Visitor BYOK: Enforce that each visitor provides their own key to protect host from charges
    const visitorKey = req.headers['x-gemini-api-key'] as string | undefined;

    if (!visitorKey) {
      return res.status(401).json({
        error: 'VISITOR_KEY_REQUIRED: Strict BYOK mode enabled. To protect the host from compute charges, every visitor must supply their own Gemini API key through the API Key setup dialog'
      });
    }

    const apiKey = visitorKey;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const modelName = req.body?.model || 'gemini-3.1-flash-image';

    const decayRate = options?.decayRate ?? 1.0;
    let temperature = (decayRate - 0.5) * 1.8 + 0.1;
    temperature = Math.max(0.0, Math.min(2.0, temperature));

    let promptPrefix = '';
    if (decayRate < 0.8) {
      promptPrefix = 'STRICT VISUAL COPY: Create an exact visual replica of the provided image. High fidelity reconstruction. Do not hallucinate new details. ';
    } else if (decayRate > 1.2) {
      promptPrefix = 'LOOSE INTERPRETATION: Allow for dream-like drift, creative reimagining, and visual hallucinations. ';
    } else {
      promptPrefix = 'Create a visual variation of this image. ';
    }

    let prompt = options?.overrideCoreDirective ? '' : (promptPrefix + BASE_ROT_PROMPT);

    if (options?.overrideCoreDirective && options?.customPrompt) {
      prompt = options.customPrompt;
    }

    if (Array.isArray(options?.injections)) {
      options.injections.forEach((key: string) => {
        if (INJECTION_MAP[key]) {
          prompt += INJECTION_MAP[key];
        }
      });
    }

    if (!options?.overrideCoreDirective && options?.customPrompt && options.customPrompt.trim().length > 0) {
      prompt += ` ${options.customPrompt}`;
    }

    const configObj: any = {
      temperature,
      imageConfig: {
        aspectRatio: '1:1'
      }
    };

    if (modelName === 'gemini-2.5-flash-image' || modelName === 'gemini-3.1-flash-image') {
      configObj.responseModalities = ['TEXT', 'IMAGE'];
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: image,
              mimeType
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: configObj
    });

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return res.json({
            image: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/png'
          });
        }
      }
    }

    return res.status(500).json({ error: 'MODEL_ERROR: Fragment manifestation failed.' });
  } catch (error: any) {
    const msg = redactApiError(error.message || 'Decay generation failed', req.headers['x-gemini-api-key'] as string | undefined);
    console.error('Decay endpoint error:', msg);

    if (
      msg.includes('limit: 0') ||
      msg.includes('RequestsPerDay') ||
      msg.includes('Please retry in') ||
      msg.includes('check your plan and billing')
    ) {
      return res.status(429).json({
        error: "IMAGE_QUOTA_EXHAUSTED: Google has allocated 0 image generations for this project (limit: 0). Please connect an API key with Google Cloud billing enabled."
      });
    }

    const status = error.status || error.code || 500;
    return res.status(typeof status === 'number' && status >= 400 && status < 600 ? status : 500).json({
      error: msg
    });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
