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
        // Prevents shoulder-surfing, URL copy-paste leaks, and bookmark exposure
        params.delete('gemini_api_key');
        const newQuery = params.toString();
        const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      } else {
        const sessionKey = sessionStorage.getItem('decay_visitor_key');
        const localKey = localStorage.getItem('decay_visitor_key');
        const storedKey = sessionKey || localKey;
        if (storedKey) {
          this.visitorApiKey = storedKey;
        }
      }
    } catch (_) {}
  }

  setVisitorApiKey(key: string | null, remember: boolean = true) {
    this.visitorApiKey = key;
    if (typeof window !== 'undefined') {
      try {
        if (key) {
          sessionStorage.setItem('decay_visitor_key', key);
          if (remember) {
            localStorage.setItem('decay_visitor_key', key);
          }
        } else {
          sessionStorage.removeItem('decay_visitor_key');
          localStorage.removeItem('decay_visitor_key');
        }
      } catch (_) {}
    }
  }

  getVisitorApiKey(): string | null {
    if (this.visitorApiKey) return this.visitorApiKey;
    if (typeof window !== 'undefined') {
      try {
        const session = sessionStorage.getItem('decay_visitor_key');
        if (session) {
          this.visitorApiKey = session;
          return session;
        }
        const local = localStorage.getItem('decay_visitor_key');
        if (local) {
          this.visitorApiKey = local;
          return local;
        }
      } catch (_) {}
      const params = new URLSearchParams(window.location.search);
      return params.get('gemini_api_key');
    }
    return null;
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

    let attempt = 0;
    const maxRetries = 5;

    while (attempt <= maxRetries) {
      try {
        const response = await fetch('/api/decay', {
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

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: response.statusText }));
          const errorMessage = errData.error || `HTTP ${response.status}: Decay request failed`;
          
          if (response.status === 429 || errorMessage.includes('429') || errorMessage.includes('quota')) {
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

        const data = await response.json();
        if (data.image) {
          return this.base64ToBlob(data.image, data.mimeType || 'image/png');
        }

        throw new Error("MODEL_ERROR: Fragment manifestation failed.");

      } catch (error: any) {
        if (attempt >= maxRetries) {
          console.error("API_FAILURE:", error);
          throw error;
        }

        // If not already handled by status check
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
