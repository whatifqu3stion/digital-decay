import { GoogleGenAI } from '@google/genai';

export const BASE_ROT_PROMPT = "Preserve the shapes and basic colors of the previous iteration.";

export interface DecayFrameOptions {
  injections: string[];
  customPrompt?: string;
  overrideCoreDirective?: boolean;
  decayRate: number; // Entropy Coefficient
  visitorApiKey?: string;
}

export class GeminiDecayService {
  private visitorApiKey: string | null = null;

  constructor() {
    this.initVisitorKey();
  }

  private initVisitorKey() {
    if (typeof window === 'undefined') return;

    try {
      const params = new URLSearchParams(window.location.search);
      const urlKey = params.get('gemini_api_key');

      if (urlKey) {
        this.visitorApiKey = urlKey;
        try {
          sessionStorage.setItem('decay_visitor_key', urlKey);
          localStorage.setItem('decay_visitor_key', urlKey);
        } catch (_) {}

        // Security: Scrub key from the address bar immediately
        params.delete('gemini_api_key');
        const newQuery = params.toString();
        const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      } else {
        const sessionKey = sessionStorage.getItem('decay_visitor_key');
        const localKey = localStorage.getItem('decay_visitor_key');
        if (sessionKey) {
          this.visitorApiKey = sessionKey;
        } else if (localKey) {
          this.visitorApiKey = localKey;
          try {
            sessionStorage.setItem('decay_visitor_key', localKey);
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  getVisitorApiKey(): string | null {
    if (this.visitorApiKey) return this.visitorApiKey;
    if (typeof window !== 'undefined') {
      try {
        const sessionKey = sessionStorage.getItem('decay_visitor_key');
        if (sessionKey) {
          this.visitorApiKey = sessionKey;
          return sessionKey;
        }
        const localKey = localStorage.getItem('decay_visitor_key');
        if (localKey) {
          this.visitorApiKey = localKey;
          return localKey;
        }
      } catch (_) {}
      const params = new URLSearchParams(window.location.search);
      return params.get('gemini_api_key');
    }
    return null;
  }

  setVisitorApiKey(key: string | null, remember: boolean = true) {
    this.visitorApiKey = key;
    if (typeof window !== 'undefined') {
      try {
        if (key) {
          sessionStorage.setItem('decay_visitor_key', key);
          if (remember) {
            localStorage.setItem('decay_visitor_key', key);
          } else {
            localStorage.removeItem('decay_visitor_key');
          }
        } else {
          sessionStorage.removeItem('decay_visitor_key');
          localStorage.removeItem('decay_visitor_key');
        }
      } catch (_) {}
    }
  }

  async processFrame(
    blobOrBase64: Blob | string,
    isHeroFrame: boolean,
    options: DecayFrameOptions
  ): Promise<Blob | null> {
    let cleanBase64 = "";
    let mimeType = "image/png";

    if (blobOrBase64 instanceof Blob) {
      mimeType = blobOrBase64.type || "image/png";
      cleanBase64 = await this.blobToBase64(blobOrBase64);
    } else {
      const mimeMatch = blobOrBase64.match(/^data:(image\/[a-zA-Z]+);base64,/);
      mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      cleanBase64 = blobOrBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    }

    const effectiveVisitorKey = options.visitorApiKey || this.getVisitorApiKey();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (effectiveVisitorKey) {
      headers['x-gemini-api-key'] = effectiveVisitorKey;
    }

    const isStaticDeployment = typeof window !== 'undefined' && (
      window.location.hostname.endsWith('github.io') ||
      window.location.protocol === 'file:' ||
      (window.location.hostname === 'localhost' && window.location.port === '5173')
    );

    let attempt = 0;
    const maxRetries = 5;

    while (attempt <= maxRetries) {
      try {
        let response: Response | null = null;
        let useDirect = isStaticDeployment;

        if (!useDirect) {
          try {
            response = await fetch('/api/decay', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                image: cleanBase64,
                mimeType,
                options: {
                  injections: options.injections,
                  customPrompt: options.customPrompt,
                  overrideCoreDirective: options.overrideCoreDirective,
                  decayRate: options.decayRate
                }
              })
            });

            // 404 or 405 (Method Not Allowed on static servers) triggers client direct API fallback
            if (response.status === 404 || response.status === 405) {
              useDirect = true;
            }
          } catch (_) {
            useDirect = true;
          }
        }

        // On static hosting like GitHub Pages, call Gemini directly with visitor's key
        if (useDirect) {
          if (!effectiveVisitorKey) {
            throw new Error("AUTH_REQUIRED: Connect your Gemini API key to begin generation.");
          }
          return await this.processFrameDirect(cleanBase64, mimeType, options, effectiveVisitorKey);
        }

        if (!response!.ok) {
          const errData = await response!.json().catch(() => ({ error: response!.statusText }));
          const errorMessage = errData.error || `HTTP ${response!.status}: Decay request failed`;
          
          if (response!.status === 429 || errorMessage.includes('429') || errorMessage.includes('quota')) {
            attempt++;
            if (attempt > maxRetries) {
              throw new Error(`MAX_RETRIES_EXCEEDED: ${errorMessage}`);
            }
            const backoffTime = Math.pow(2, attempt) * 2000 + Math.random() * 500;
            console.warn(`RATE_LIMIT_HIT: Retrying frame in ${Math.round(backoffTime)}ms (Attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            continue;
          }

          throw new Error(errorMessage);
        }

        const data = await response!.json();
        if (data.image) {
          return this.base64ToBlob(data.image, data.mimeType || 'image/png');
        }

        throw new Error("MODEL_ERROR: Fragment manifestation failed.");

      } catch (error: any) {
        if (attempt >= maxRetries) {
          console.error("API_FAILURE:", error);
          throw error;
        }

        if (error.message?.includes('429') || error.message?.includes('quota')) {
          attempt++;
          const backoffTime = Math.pow(2, attempt) * 2000 + Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          continue;
        }

        console.error("API_FAILURE:", error);
        throw error;
      }
    }

    return null;
  }

  private async processFrameDirect(
    cleanBase64: string,
    mimeType: string,
    options: DecayFrameOptions,
    apiKey: string
  ): Promise<Blob | null> {
    const INJECTION_MAP: Record<string, string> = {
      CHROMATIC_ABERRATION: ' Introduce extremely subtle, barely perceptible chromatic aberration.',
      JPEG_ARTIFACTS: ' Introduce very slight, subtle jpeg compression artifacts.',
      SCANLINE_GHOSTING: ' Add very faint, subtle scanline ghosting.',
      DATAMOSH_GLITCHING: ' Introduce very subtle, minor data moshing glitches.',
      VHS_DISTORTION: ' Introduce very slight VHS-style distortion, faint noise, and subtle color bleed.'
    };

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
        if (INJECTION_MAP[key]) prompt += INJECTION_MAP[key];
      });
    }

    if (!options?.overrideCoreDirective && options?.customPrompt && options.customPrompt.trim().length > 0) {
      prompt += ` ${options.customPrompt}`;
    }

    const ai = new GoogleGenAI({
      apiKey
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: {
        temperature,
        imageConfig: {
          aspectRatio: '1:1'
        }
      }
    });

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return this.base64ToBlob(part.inlineData.data, part.inlineData.mimeType || 'image/png');
        }
      }
    }

    throw new Error("MODEL_ERROR: Fragment manifestation failed from direct API.");
  }

  private base64ToBlob(base64: string, mimeType: string = 'image/png'): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.replace(/^data:.+;base64,/, '');
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
