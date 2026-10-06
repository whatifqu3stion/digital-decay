import React, { useState } from 'react';
import { playAudio } from '../utils/audio';
import { parseAndValidateGeminiKey } from '../utils/keyUtils';

interface AuthKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (key: string, remember: boolean) => void;
  currentKey?: string | null;
  onPurge?: () => void;
}

export const AuthKeyModal: React.FC<AuthKeyModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  currentKey,
  onPurge
}) => {
  const [remember, setRemember] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);

  if (!isOpen) return null;

  const processKey = (rawText: string) => {
    const result = parseAndValidateGeminiKey(rawText);
    if (!result.isValidFormat || !result.key) {
      throw new Error(result.error || "Invalid key format. Please check your copied key.");
    }

    playAudio('success');
    const msg = result.isStandardGeminiFormat 
      ? "✓ Verified standard Gemini key format (AIzaSy...)" 
      : "✓ Key format accepted";
    setSuccessMsg(msg);

    setTimeout(() => {
      onSuccess(result.key!, remember);
    }, 350);
  };

  const handleClipboardPaste = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsReading(true);
    playAudio('click');

    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setShowManualFallback(true);
        throw new Error("Clipboard API blocked by browser. Use the manual paste button below.");
      }

      const text = await navigator.clipboard.readText();
      processKey(text);
    } catch (err: any) {
      console.warn("Clipboard read failed:", err);
      playAudio('error');
      setShowManualFallback(true);
      setErrorMsg(err?.message || "Could not read clipboard. Please ensure clipboard permission is allowed.");
    } finally {
      setIsReading(false);
    }
  };

  const handleManualPrompt = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    playAudio('click');

    try {
      const input = window.prompt("Paste your Gemini API key (starts with AIzaSy):");
      if (input === null) return; // User cancelled
      if (!input.trim()) {
        throw new Error("No key was entered.");
      }
      processKey(input);
    } catch (err: any) {
      playAudio('error');
      setErrorMsg(err?.message || "Invalid key.");
    }
  };

  return (
    <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="max-w-md w-full border-2 border-[#00ffd5] bg-black p-6 shadow-[0_0_40px_rgba(0,255,213,0.25)] relative font-mono">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#00ffd5]/30 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#00ffd5] animate-pulse"></span>
            <span className="text-base font-bold text-[#00ffd5] tracking-[0.2em] uppercase">CONNECT API KEY</span>
          </div>
          <button 
            onClick={() => { playAudio('click'); onClose(); }}
            className="text-xs text-[#e5e5e5] hover:text-[#ff007f] tracking-widest uppercase transition-colors cursor-pointer"
          >
            [CLOSE]
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 text-xs">
          {/* Active Key Status if already connected */}
          {currentKey && (
            <div className="p-2.5 border border-[#00ffd5]/40 bg-[#00ffd5]/10 flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00ffd5]"></span>
                <span className="text-[#00ffd5] text-[11px] font-bold">
                  ACTIVE: {currentKey.slice(0, 6)}...{currentKey.slice(-4)}
                </span>
              </div>
              {onPurge && (
                <button
                  onClick={() => {
                    playAudio('click');
                    onPurge();
                  }}
                  className="text-[10px] text-[#ff007f] hover:underline uppercase tracking-wider cursor-pointer"
                  title="Remove saved key from this device"
                >
                  [DISCONNECT]
                </button>
              )}
            </div>
          )}

          <p className="text-[#e5e5e5] leading-relaxed">
            A free Gemini API key is required to execute recursive decay generations on your quota.
          </p>

          {/* Action 1: Link to Get Free Key */}
          <div className="p-3 border border-[#00ffd5]/20 bg-[#00ffd5]/5 flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-[#00ffd5] tracking-wider uppercase">1. GET YOUR FREE KEY</div>
              <div className="text-[11px] opacity-70 mt-0.5">Instant creation via Google AI Studio</div>
            </div>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={() => playAudio('click')}
              className="px-3 py-1.5 border border-[#00ffd5] text-[#00ffd5] hover:bg-[#00ffd5] hover:text-black font-bold tracking-widest text-[11px] uppercase transition-all whitespace-nowrap shadow-[0_0_10px_rgba(0,255,213,0.15)]"
            >
              GET KEY ↗
            </a>
          </div>

          {/* Action 2: One-Click Paste & Fallback */}
          <div className="space-y-2">
            <div className="font-bold text-[#00ffd5] tracking-wider uppercase">2. ATTACH COPIED KEY</div>
            <button
              onClick={handleClipboardPaste}
              disabled={isReading}
              className="w-full py-3 px-4 border-2 border-[#00ffd5] text-black bg-[#00ffd5] hover:bg-white hover:border-white font-bold tracking-widest text-sm uppercase transition-all shadow-[0_0_20px_rgba(0,255,213,0.3)] disabled:opacity-50 cursor-pointer"
            >
              {isReading ? "[ READING CLIPBOARD... ]" : "[ 📋 PASTE FROM CLIPBOARD ]"}
            </button>

            {/* Manual fallback prompt if clipboard blocked or preferred */}
            <div className="flex justify-between items-center text-[10px] text-[#e5e5e5]/60 pt-0.5">
              <span>Auto-extracts raw key even if copied with URL</span>
              <button 
                onClick={handleManualPrompt}
                className="text-[#00ffd5] hover:underline cursor-pointer uppercase font-bold"
              >
                [ ⌨️ Paste Manually ]
              </button>
            </div>
          </div>

          {/* Remember on this device toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-[#e5e5e5]/80 hover:text-white pt-1">
            <input 
              type="checkbox" 
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-[#00ffd5] cursor-pointer"
            />
            <span>Remember key on this device (Local Storage)</span>
          </label>

          {/* Instant Validation Success Feedback */}
          {successMsg && (
            <div className="p-2.5 border border-[#00ffd5] bg-[#00ffd5]/20 text-[#00ffd5] text-[11px] font-bold leading-tight animate-in fade-in duration-150">
              {successMsg}
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 border border-[#ff007f] bg-[#ff007f]/10 text-[#ff007f] text-[11px] leading-tight animate-in fade-in duration-150">
              {errorMsg}
            </div>
          )}

          {/* Manual URL Hint */}
          <div className="pt-3 border-t border-[#00ffd5]/20 text-xs text-[#e5e5e5] leading-relaxed bg-[#00ffd5]/5 p-2.5 border border-[#00ffd5]/20">
            <span className="font-bold text-[#00ffd5] uppercase tracking-wider">Alternative:</span>{' '}
            Append <code className="text-[#00ffd5] bg-black px-1.5 py-0.5 border border-[#00ffd5]/40 font-mono font-bold select-all">?gemini_api_key=YOUR_KEY</code> to the page URL and reload.
          </div>
        </div>

      </div>
    </div>
  );
};
