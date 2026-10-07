import React, { useState } from 'react';
import { playAudio } from '../utils/audio';
import { parseAndValidateGeminiKey } from '../utils/keyUtils';
import { AVAILABLE_MODELS } from '../services/geminiService';

interface AuthKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (key: string, remember: boolean) => void;
  currentKey?: string | null;
  onPurge?: () => void;
  selectedModelId?: string;
  onSelectModel?: (modelId: string) => void;
  quotaNotice?: string | null;
}

export const AuthKeyModal: React.FC<AuthKeyModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  currentKey,
  onPurge,
  selectedModelId = 'gemini-2.5-flash-image',
  onSelectModel,
  quotaNotice
}) => {
  const [remember, setRemember] = useState(true);
  const [inputKey, setInputKey] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>(selectedModelId);

  if (!isOpen) return null;

  const processKey = (rawText: string) => {
    setErrorMsg(null);
    const result = parseAndValidateGeminiKey(rawText);
    if (!result.isValidFormat || !result.key) {
      throw new Error(result.error || "Invalid key. Ensure your Gemini key starts with AIzaSy.");
    }

    playAudio('success');
    setSuccessMsg("✓ Key verified & attached");

    if (onSelectModel) {
      onSelectModel(activeModel);
    }

    setTimeout(() => {
      onSuccess(result.key!, remember);
    }, 250);
  };

  const handleClipboardPaste = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    playAudio('click');

    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        throw new Error("Clipboard access blocked by browser. Paste directly into the box below.");
      }

      const text = await navigator.clipboard.readText();
      setInputKey(text.trim());
      processKey(text);
    } catch (err: any) {
      playAudio('error');
      setErrorMsg(err?.message || "Could not read clipboard. Please paste manually into the input below.");
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) {
      setErrorMsg("Please enter an API key.");
      return;
    }
    try {
      processKey(inputKey);
    } catch (err: any) {
      playAudio('error');
      setErrorMsg(err?.message || "Invalid key.");
    }
  };

  const handleModelSelect = (id: string) => {
    playAudio('click');
    setActiveModel(id);
    if (onSelectModel) {
      onSelectModel(id);
    }
  };

  const model25 = AVAILABLE_MODELS['gemini-2.5-flash-image'];
  const model31 = AVAILABLE_MODELS['gemini-3.1-flash-image'];

  return (
    <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="max-w-md w-full border border-[#00ffd5] bg-black p-5 shadow-[0_0_30px_rgba(0,255,213,0.2)] font-mono text-xs">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#00ffd5]/20 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#00ffd5] animate-pulse"></span>
            <span className="text-sm font-bold text-[#00ffd5] tracking-[0.2em] uppercase">API Key & Model Setup</span>
          </div>
          <button 
            onClick={() => { playAudio('click'); onClose(); }}
            className="text-[#e5e5e5]/60 hover:text-white uppercase transition-colors cursor-pointer text-[11px]"
          >
            [CLOSE]
          </button>
        </div>

        {/* Quota Notice Banner if triggered by rate/quota limit */}
        {quotaNotice && (
          <div className="p-2.5 border border-[#ff007f] bg-[#ff007f]/10 text-[#ff007f] text-[11px] mb-3 leading-tight">
            ⚠️ {quotaNotice}
          </div>
        )}

        <div className="space-y-4">
          
          {/* Section 1: Model Selection */}
          <div>
            <div className="text-[10px] font-bold text-[#00ffd5] uppercase tracking-wider mb-2">
              1. Choose Engine
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Free Tier Card */}
              <button
                type="button"
                onClick={() => handleModelSelect(model25.id)}
                className={`p-2.5 text-left border transition-all cursor-pointer ${
                  activeModel === model25.id
                    ? 'border-[#00ffd5] bg-[#00ffd5]/10 text-white shadow-[0_0_12px_rgba(0,255,213,0.15)]'
                    : 'border-[#00ffd5]/20 bg-black/50 text-[#e5e5e5]/60 hover:border-[#00ffd5]/50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-bold text-[11px] text-[#00ffd5]">2.5 Flash</span>
                  <span className="text-[9px] bg-[#00ffd5]/20 text-[#00ffd5] px-1 py-0.5 rounded font-bold">FREE</span>
                </div>
                <p className="text-[10px] text-[#e5e5e5]/80 leading-tight">~500 requests/day</p>
                <p className="text-[9px] text-[#00ffd5]/60 mt-1 font-semibold">No credit card needed</p>
              </button>

              {/* Paid Tier Card */}
              <button
                type="button"
                onClick={() => handleModelSelect(model31.id)}
                className={`p-2.5 text-left border transition-all cursor-pointer ${
                  activeModel === model31.id
                    ? 'border-[#00ffd5] bg-[#00ffd5]/10 text-white shadow-[0_0_12px_rgba(0,255,213,0.15)]'
                    : 'border-[#00ffd5]/20 bg-black/50 text-[#e5e5e5]/60 hover:border-[#00ffd5]/50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-bold text-[11px] text-white">3.1 Flash</span>
                  <span className="text-[9px] border border-[#e5e5e5]/30 text-[#e5e5e5]/70 px-1 py-0.5 rounded">PAID</span>
                </div>
                <p className="text-[10px] text-[#e5e5e5]/80 leading-tight">High resolution</p>
                <p className="text-[9px] text-[#e5e5e5]/50 mt-1">Requires Google Cloud billing</p>
              </button>
            </div>
          </div>

          {/* Section 2: Key Input */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[10px] font-bold text-[#00ffd5] uppercase tracking-wider">
                2. Enter Gemini API Key
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => playAudio('click')}
                className="text-[10px] text-[#00ffd5] hover:underline"
              >
                Get free key ↗
              </a>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-grow bg-black border border-[#00ffd5]/40 text-white px-3 py-2 text-xs focus:outline-none focus:border-[#00ffd5] font-mono tracking-wider"
                />
                <button
                  type="submit"
                  disabled={!inputKey.trim()}
                  className="px-3 py-2 border border-[#00ffd5] bg-[#00ffd5] text-black font-bold uppercase tracking-wider text-xs hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Save
                </button>
              </div>

              <button
                type="button"
                onClick={handleClipboardPaste}
                className="w-full py-2 border border-[#00ffd5]/40 hover:border-[#00ffd5] hover:bg-[#00ffd5]/5 text-[#00ffd5] font-bold uppercase tracking-wider transition-colors cursor-pointer text-[11px]"
              >
                📋 Paste from Clipboard
              </button>
            </form>
          </div>

          {/* Feedback Messages */}
          {successMsg && (
            <div className="p-2 border border-[#00ffd5] bg-[#00ffd5]/10 text-[#00ffd5] text-[11px] font-bold">
              {successMsg}
            </div>
          )}

          {errorMsg && (
            <div className="p-2 border border-[#ff007f] bg-[#ff007f]/10 text-[#ff007f] text-[11px]">
              {errorMsg}
            </div>
          )}

          {/* Active Key Status & Remember Option */}
          <div className="pt-2 border-t border-[#00ffd5]/10 flex items-center justify-between text-[11px] text-[#e5e5e5]/70">
            <label className="flex items-center gap-2 cursor-pointer select-none hover:text-white">
              <input 
                type="checkbox" 
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-[#00ffd5] cursor-pointer"
              />
              <span>Remember on this device</span>
            </label>

            {currentKey && onPurge && (
              <button
                type="button"
                onClick={() => { playAudio('click'); onPurge(); }}
                className="text-[#ff007f] hover:underline uppercase text-[10px] font-bold cursor-pointer"
              >
                Disconnect Key
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
