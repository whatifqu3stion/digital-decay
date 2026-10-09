import { GoogleGenAI } from '@google/genai';
import { redactApiError } from '../utils/keyUtils';

export const BASE_ROT_PROMPT = "Preserve the shapes and basic colors of the previous iteration.";

// Pacing targets are local defaults, not guarantees of project quota.
// Check Google AI Studio for model availability, billing and limits.

export interface ModelTierConfig {
  id: string;
  name: string;
  shortLabel: string;
  badge: string;
  isFreeTier: boolean;
  dailyQuotaInfo: string;
  billingRequirement: string;
  maxRequestsPerWindow: number; // Max requests within windowMs
  windowMs: number;             // Sliding window length in ms
  minDelayMs: number;           // Minimum spacing between sequential requests
  responseModalities?: ('TEXT' | 'IMAGE')[];
}

export const AVAILABLE_MODELS: Record<string, ModelTierConfig> = {
  'gemini-2.5-flash-image': {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image (legacy)',
    shortLabel: '2.5 Flash',
    badge: 'STANDARD // BILLING LINKED',
    isFreeTier: false,
    dailyQuotaInfo: 'Standard resolution (~$0.039/image)',
    billingRequirement: 'Requires linked Google Cloud billing in AI Studio (Google assigns limit: 0 to unbilled projects).',
    maxRequestsPerWindow: 10,   // Standard pacing
    windowMs: 60000,
    minDelayMs: 3000,
    responseModalities: ['TEXT', 'IMAGE']
  },
  'gemini-3.1-flash-image': {
    id: 'gemini-3.1-flash-image',
    name: 'Gemini 3.1 Flash Image',
    shortLabel: '3.1 Flash',
    badge: 'NANO BANANA 2 // BILLING LINKED',
    isFreeTier: false,
    dailyQuotaInfo: 'Paid image generation; see current Google pricing',
    billingRequirement: 'Requires billing and available image quota in Google AI Studio.',
    maxRequestsPerWindow: 30,   // High-throughput allowance
    windowMs: 60000,
    minDelayMs: 1200,
    responseModalities: ['TEXT', 'IMAGE']
  }
};

export const DEFAULT_MODEL_ID = 'gemini-3.1-flash-image';

export interface DecayFrameOptions {
  injections: string[];
  customPrompt?: string;
  overrideCoreDirective?: boolean;
  decayRate: number; // Entropy Coefficient
  visitorApiKey?: string;
  modelId?: string;
}

// ============================================================================
// DYNAMIC SLIDING-WINDOW RATE PACER
// ============================================================================
export class SlidingWindowPacer {
  private timestamps: number[] = [];
  private lastRequestTime: number = 0;

  async waitForSlot(
    modelConfig: ModelTierConfig,
    onCooldown?: (secondsRemaining: number) => void
  ): Promise<void> {
    const now = Date.now();
    // 1. Purge timestamps older than the sliding window
    this.timestamps = this.timestamps.filter(t => now - t < modelConfig.windowMs);

    // 2. Enforce minimum delay between calls
    const elapsedSinceLast = now - this.lastRequestTime;
    if (elapsedSinceLast < modelConfig.minDelayMs) {
      const waitMs = modelConfig.minDelayMs - elapsedSinceLast;
      await new Promise(r => setTimeout(r, waitMs));
    }

    // 3. Check if rolling window limit is reached
    while (this.timestamps.length >= modelConfig.maxRequestsPerWindow) {
      const oldest = this.timestamps[0];
      const timeRemainingMs = modelConfig.windowMs - (Date.now() - oldest) + 400; // 400ms safety cushion
      if (timeRemainingMs > 0) {
        const secondsRemaining = Math.ceil(timeRemainingMs / 1000);
        if (onCooldown) {
          onCooldown(secondsRemaining);
        }
        await new Promise(r => setTimeout(r, Math.min(timeRemainingMs, 1000)));
      }
      this.timestamps = this.timestamps.filter(t => Date.now() - t < modelConfig.windowMs);
    }

    // Record request timestamp
    const mark = Date.now();
    this.timestamps.push(mark);
    this.lastRequestTime = mark;
  }

  recordCooldown(seconds: number = 18) {
    const now = Date.now();
    this.lastRequestTime = now + (seconds * 1000);
    this.timestamps.push(now + (seconds * 1000));
  }

  reset() {
    this.timestamps = [];
    this.lastRequestTime = 0;
  }
}

export class GeminiDecayService {
  private visitorApiKey: string | null = null;
  private selectedModelId: string = DEFAULT_MODEL_ID;
  private pacer = new SlidingWindowPacer();

  constructor() {
    this.initVisitorKey();
    this.initSelectedModel();
  }

  getPacer(): SlidingWindowPacer {
    return this.pacer;
  }

  private initVisitorKey() {
    if (typeof window === 'undefined') return;
    // Legacy key URLs are scrubbed but never accepted or stored. A URL may
    // already have reached the host, so scrubbing is not a security guarantee.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('gemini_api_key')) {
        params.delete('gemini_api_key');
        const query = params.toString();
        window.history.replaceState({}, document.title,
          window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
      }
    } catch (_) {}
    try {
      this.visitorApiKey = sessionStorage.getItem('decay_visitor_key') ||
        localStorage.getItem('decay_visitor_key');
    } catch (_) {}
  }

  private initSelectedModel() {
    if (typeof window === 'undefined') return;
    try {
      const savedModel = localStorage.getItem('decay_selected_model');
      if (savedModel && savedModel !== 'gemini-2.5-flash-image' && AVAILABLE_MODELS[savedModel]) {
        this.selectedModelId = savedModel;
      }
    } catch (_) {}
  }

  getSelectedModel(): ModelTierConfig {
    return AVAILABLE_MODELS[this.selectedModelId] || AVAILABLE_MODELS[DEFAULT_MODEL_ID];
  }

  setSelectedModel(modelId: string) {
    if (AVAILABLE_MODELS[modelId]) {
      this.selectedModelId = modelId;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('decay_selected_model', modelId);
        } catch (_) {}
      }
    }
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
    }
    return null;
  }

  setVisitorApiKey(key: string | null, remember: boolean = false) {
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
    const modelToUse = options.modelId || this.selectedModelId;

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
            model: modelToUse,
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
      return await this.processFrameDirect(cleanBase64, mimeType, options, effectiveVisitorKey, modelToUse);
    }

    if (!response!.ok) {
      const errData = await response!.json().catch(() => ({ error: response!.statusText }));
      const errorMessage = redactApiError(errData.error || `HTTP ${response!.status}: Decay request failed`, effectiveVisitorKey);
      
      if (
        errorMessage.includes('DAILY_QUOTA_EXHAUSTED') ||
        errorMessage.includes('IMAGE_QUOTA_EXHAUSTED') ||
        errorMessage.includes('limit: 0') ||
        errorMessage.includes('RequestsPerDay') ||
        errorMessage.includes('Please retry in') ||
        errorMessage.includes('check your plan and billing')
      ) {
        throw new Error("IMAGE_QUOTA_EXHAUSTED: Google has allocated 0 image generations for this project (limit: 0). Please connect an API key with Google Cloud billing enabled.");
      }

      if (response!.status === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("RATE_LIMIT_RPM: Short-term rolling minute limit reached. Entering brief cooldown...");
      }

      throw new Error(errorMessage);
    }

    const data = await response!.json();
    if (data.image) {
      return this.base64ToBlob(data.image, data.mimeType || 'image/png');
    }

    throw new Error("MODEL_ERROR: Fragment manifestation failed.");
  }

  private async processFrameDirect(
    cleanBase64: string,
    mimeType: string,
    options: DecayFrameOptions,
    apiKey: string,
    modelId: string
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

    const targetModelConfig = AVAILABLE_MODELS[modelId] || AVAILABLE_MODELS[DEFAULT_MODEL_ID];

    try {
      const configObj: any = {
        temperature,
        imageConfig: {
          aspectRatio: '1:1'
        }
      };

      // Crucial: gemini-2.5-flash-image requires responseModalities: ['TEXT', 'IMAGE']
      // to return synthesized image data instead of text descriptions
      if (targetModelConfig.responseModalities) {
        configObj.responseModalities = targetModelConfig.responseModalities;
      }

      const response = await ai.models.generateContent({
        model: targetModelConfig.id,
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
        config: configObj
      });

      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            return this.base64ToBlob(part.inlineData.data, part.inlineData.mimeType || 'image/png');
          }
        }
      }
    } catch (err: any) {
      const errMsg = redactApiError(err?.message || String(err), apiKey);

      if (
        errMsg.includes('DAILY_QUOTA_EXHAUSTED') ||
        errMsg.includes('IMAGE_QUOTA_EXHAUSTED') ||
        errMsg.includes('limit: 0') ||
        errMsg.includes('RequestsPerDay') ||
        errMsg.includes('Please retry in') ||
        errMsg.includes('check your plan and billing')
      ) {
        throw new Error("IMAGE_QUOTA_EXHAUSTED: Google has allocated 0 image generations for this project (limit: 0). Please connect an API key with Google Cloud billing enabled.");
      }

      if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("RATE_LIMIT_RPM: Short-term rolling minute limit reached. Entering brief cooldown...");
      }
      if (errMsg.includes('billing') || errMsg.includes('BILLING') || errMsg.includes('Billing')) {
        throw new Error(`BILLING_REQUIRED: Google requires linked Google Cloud billing in AI Studio for image models (see current Google pricing).`);
      }
      if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
        throw new Error("API_KEY_INVALID: The provided Gemini API key was rejected by Google.");
      }
      if (errMsg.includes('404') || errMsg.includes('not found')) {
        throw new Error(`MODEL_NOT_FOUND: Model ${targetModelConfig.id} could not be resolved by Google.`);
      }
      throw new Error(`MODEL_ERROR: ${errMsg}`);
    }

    throw new Error(`MODEL_ERROR: ${targetModelConfig.name} completed request without returning image parts.`);
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
