import React, { useState, useEffect } from 'react';
import { playAudio, playBootWhir } from '../utils/audio';
import { parseAndValidateGeminiKey } from '../utils/keyUtils';

interface OnboardingModalProps {
  onComplete: () => void;
  getApiKey?: () => string | null;
  onSetApiKey?: (key: string, remember: boolean) => void;
}

const STEPS = [
  {
    title: "1. THE RECURSIVE EXPERIMENT",
    content: "Upload any image and feed it back into Gemini across 69 continuous cycles.\n\nEach frame becomes the direct input for the next, letting subtle AI re-interpretations compound into dramatic visual drift.",
    action: "NEXT: CONTROLS"
  },
  {
    title: "2. ENTROPY & MUTATORS",
    content: "The Entropy slider adjusts AI creativity (0.1 = faithful reproduction, 1.9 = wild hallucination).\n\nToggle aesthetic mutators like Datamosh, Bitcrush, or VHS Noise to steer how the image decays.",
    action: "NEXT: INPUT"
  },
  {
    title: "3. FEED AN IMAGE",
    content: "Upload any photo or capture live from your webcam to latch your source subject.\n\nChoose FIT (keep aspect ratio) or CROP (fill square) before initiating the sequence.",
    action: "NEXT: API ACCESS"
  },
  {
    title: "4. GEMINI KEY & BILLING",
    content: "Connect your Google Gemini API key to run generations directly on your account.\n\nNote: Google requires linked Google Cloud billing in AI Studio for image models (check current pricing and your project quota).",
    action: "ENTER_TERMINAL"
  }
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ 
  onComplete,
  getApiKey,
  onSetApiKey
}) => {
  const [step, setStep] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [isBooting, setIsBooting] = useState(true);
  const [bootStage, setBootStage] = useState(0);

  // Key state for Step 4 direct action
  const [attachedKey, setAttachedKey] = useState<string | null>(null);
  const [isReadingClipboard, setIsReadingClipboard] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (getApiKey) {
      setAttachedKey(getApiKey());
    }
  }, [getApiKey]);

  // Snappy retro POST sequence synced with quick whir & BIOS beep
  useEffect(() => {
    playBootWhir();

    const t1 = setTimeout(() => setBootStage(1), 140);
    const t2 = setTimeout(() => setBootStage(2), 280);
    const t3 = setTimeout(() => setBootStage(3), 440);
    const t4 = setTimeout(() => {
      setBootStage(4);
      setIsBooting(false);
    }, 680);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  // Clean, synchronized typing effect that runs once startup animation finishes or steps change
  useEffect(() => {
    if (isBooting) return;

    setDisplayedText("");
    setIsTyping(true);
    let currentIndex = 0;
    const fullText = STEPS[step].content;

    const interval = setInterval(() => {
      currentIndex++;
      setDisplayedText(fullText.slice(0, currentIndex));
      if (currentIndex % 3 === 0) playAudio('type');

      if (currentIndex >= fullText.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 16);

    return () => clearInterval(interval);
  }, [step, isBooting]);

  const handleNext = () => {
    playAudio('click');
    if (step < STEPS.length - 1) {
      setStep(prev => prev + 1);
    } else {
      setIsVisible(false);
      playAudio('start');
      setTimeout(onComplete, 400);
    }
  };

  const handleSkip = () => {
    playAudio('blip');
    setIsVisible(false);
    setTimeout(onComplete, 200);
  };

  const applyKey = (rawText: string) => {
    const result = parseAndValidateGeminiKey(rawText);
    if (!result.isValidFormat || !result.key) {
      throw new Error(result.error || "Invalid key format. Please check your copied key.");
    }

    playAudio('success');
    onSetApiKey?.(result.key, false);
    setAttachedKey(result.key);
    const msg = result.isStandardGeminiFormat
      ? "✓ Standard key format accepted — Saved for this tab session."
      : "✓ Key format accepted — Saved for this tab session.";
    setClipboardStatus({ message: msg, type: 'success' });
  };

  const handleDirectClipboardPaste = async () => {
    setClipboardStatus(null);
    setIsReadingClipboard(true);
    playAudio('click');

    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        throw new Error("Clipboard blocked. Use [Paste Manually] below.");
      }

      const text = await navigator.clipboard.readText();
      applyKey(text);
    } catch (err: any) {
      playAudio('error');
      setClipboardStatus({ message: err?.message || "Could not read clipboard.", type: 'error' });
    } finally {
      setIsReadingClipboard(false);
    }
  };

  const handleManualPrompt = () => {
    setClipboardStatus(null);
    playAudio('click');

    try {
      const input = window.prompt("Paste your Gemini API key (starts with AIzaSy):");
      if (input === null) return;
      if (!input.trim()) throw new Error("No key was entered.");
      applyKey(input);
    } catch (err: any) {
      playAudio('error');
      setClipboardStatus({ message: err?.message || "Invalid key.", type: 'error' });
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300 font-mono">
      <div className="max-w-2xl w-full border-2 border-[#00ffd5] bg-black p-1 shadow-[0_0_50px_rgba(0,255,213,0.2)] flex flex-col relative max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#00ffd5] text-black px-4 py-2 text-lg md:text-xl font-bold tracking-[0.2em] flex justify-between items-center select-none shrink-0">
          <span>SYSTEM BOOT</span>
          <button 
            onClick={handleSkip}
            className="hover:bg-black hover:text-[#00ffd5] px-2 py-0.5 text-xs font-mono transition-colors tracking-widest uppercase cursor-pointer"
            title="Exit Boot Sequence directly to image input screen"
          >
            [CLOSE]
          </button>
        </div>

        {/* CRT Scanline effect inside modal */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%]"></div>

        {/* Content */}
        {isBooting ? (
          <div 
            onClick={() => setIsBooting(false)} 
            className="p-6 md:p-10 flex flex-col justify-center items-center relative z-10 flex-grow min-h-[300px] cursor-pointer"
            title="Click to bypass startup sequence"
          >
            {/* CRT Horizontal Warmup Beam */}
            <div className={`transition-all duration-300 ease-out flex items-center justify-center w-full ${bootStage === 0 ? 'opacity-100 scale-100' : 'opacity-40'}`}>
              <div className="w-full max-w-sm h-[2px] bg-[#00ffd5] shadow-[0_0_25px_#00ffd5] animate-pulse"></div>
            </div>

            {/* Snappy diagnostic lines */}
            {bootStage >= 1 && (
              <div className="w-full max-w-md font-mono text-xs md:text-sm space-y-2.5 text-[#00ffd5]/90 border border-[#00ffd5]/40 bg-black/90 p-5 shadow-[0_0_30px_rgba(0,255,213,0.15)] relative mt-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center border-b border-[#00ffd5]/20 pb-2 text-[10px] tracking-widest text-[#e5e5e5]/60 uppercase">
                  <span>BIOS INITIALIZATION</span>
                  <span className="animate-pulse text-[#00ffd5]">SYS_OK</span>
                </div>
                
                <div className="space-y-2 pt-1 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-[#00ffd5] font-bold">[ OK ]</span>
                    <span>HARDWARE POST BUS ONLINE</span>
                  </div>
                  {bootStage >= 2 && (
                    <div className="flex items-center gap-2 animate-in fade-in duration-100">
                      <span className="text-[#00ffd5] font-bold">[ OK ]</span>
                      <span>QUANTUM ENTROPY ENGINE (v2.5) READY</span>
                    </div>
                  )}
                  {bootStage >= 3 && (
                    <div className="flex items-center gap-2 animate-in fade-in duration-100">
                      <span className="text-[#00ffd5] font-bold">[ OK ]</span>
                      <span>TENSOR MEMORY VRAM 512KB MOUNTED</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 text-[10px] text-right text-[#e5e5e5]/40 tracking-widest uppercase">
                  [ CLICK TO SKIP ]
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 md:p-8 flex flex-col justify-between relative z-10 overflow-y-auto flex-grow min-h-[250px] animate-in fade-in duration-200">
            <div className="space-y-4 md:space-y-6">
              <h2 className="text-[#ff007f] text-xl md:text-2xl font-bold tracking-widest border-b border-[#ff007f]/30 pb-2 sticky top-0 bg-black/50 backdrop-blur-sm z-20">
                {STEPS[step].title}
              </h2>
              
              <p className="text-[#00ffd5] text-base md:text-lg font-mono leading-relaxed whitespace-pre-wrap pb-2">
                {displayedText}
                {isTyping && <span className="inline-block w-2 md:w-3 h-4 md:h-5 bg-[#00ffd5] ml-1 animate-pulse"></span>}
              </p>

              {/* Direct Action Block for Step 4 (API Key Step) */}
              {step === 3 && (
                <div className="space-y-3 pt-2 font-mono animate-in fade-in duration-200">
                  {attachedKey ? (
                    <div className="p-3 border border-[#00ffd5] bg-[#00ffd5]/10 flex items-center justify-between gap-2 shadow-[0_0_15px_rgba(0,255,213,0.15)]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#00ffd5] animate-pulse"></span>
                        <span className="text-[#00ffd5] font-bold text-xs uppercase tracking-wider">
                          [ OK ] KEY ATTACHED: {attachedKey.slice(0, 6)}...{attachedKey.slice(-4)}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#00ffd5] font-bold border border-[#00ffd5]/40 px-2 py-0.5 uppercase bg-[#00ffd5]/20">
                        ARMED
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2.5 border border-[#00ffd5]/40 p-3.5 bg-black/80 shadow-[0_0_20px_rgba(0,255,213,0.1)]">
                      <div className="text-[11px] text-[#e5e5e5] opacity-80 pb-1">
                        Connect now with 1 click, or proceed and attach when generating:
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <a 
                          href="https://aistudio.google.com/app/apikey" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={() => playAudio('click')}
                          className="px-3 py-2 border border-[#00ffd5]/60 text-[#00ffd5] hover:bg-[#00ffd5] hover:text-black font-bold tracking-widest text-xs uppercase text-center transition-all whitespace-nowrap"
                        >
                          1. GET API KEY ↗
                        </a>
                        <button
                          onClick={handleDirectClipboardPaste}
                          disabled={isReadingClipboard}
                          className="flex-1 px-4 py-2 bg-[#00ffd5] text-black font-bold tracking-widest text-xs uppercase hover:bg-white transition-all shadow-[0_0_15px_rgba(0,255,213,0.3)] disabled:opacity-50 cursor-pointer text-center"
                        >
                          {isReadingClipboard ? "[ READING... ]" : "2. [ 📋 PASTE FROM CLIPBOARD ]"}
                        </button>
                      </div>
                      <div className="flex justify-end items-center text-[10px] text-[#e5e5e5]/60 pt-0.5">
                        <button 
                          onClick={handleManualPrompt}
                          className="text-[#00ffd5] hover:underline cursor-pointer uppercase font-bold"
                        >
                          [ ⌨️ Paste Manually ]
                        </button>
                      </div>
                      {clipboardStatus && (
                        <div className={`text-[11px] leading-tight pt-1 ${clipboardStatus.type === 'error' ? 'text-[#ff007f]' : 'text-[#00ffd5]'}`}>
                          {clipboardStatus.message}
                        </div>
                      )}
                      <div className="text-xs text-[#e5e5e5] pt-2 border-t border-[#00ffd5]/20 leading-relaxed">
                        Paste your key here, never in a URL. It is saved for this tab session; persistent storage is optional in API Key setup.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="pt-4 md:pt-8 flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4 border-t border-[#00ffd5]/20 mt-auto bg-black/80 sticky bottom-0 z-20">
               <div className="flex gap-1 pb-2 sm:pb-0">
                   {STEPS.map((_, i) => (
                       <div key={i} className={`w-3 h-3 border border-[#00ffd5] ${i === step ? 'bg-[#00ffd5]' : 'opacity-30'}`}></div>
                   ))}
               </div>

               <div className="flex gap-4 items-center w-full sm:w-auto justify-end">
                   <button 
                      onClick={handleSkip}
                      className="text-xs text-[#e5e5e5] hover:text-[#00ffd5] uppercase tracking-widest border border-[#00ffd5]/40 hover:border-[#00ffd5] bg-white/5 hover:bg-[#00ffd5]/10 px-3 py-1.5 transition-all whitespace-nowrap cursor-pointer"
                      title="Skip boot protocol"
                   >
                       Skip Boot
                   </button>
                   
                   <button 
                      onClick={handleNext}
                      disabled={isTyping}
                      className={`
                          border-2 px-4 md:px-6 py-2 text-sm md:text-lg font-bold tracking-widest uppercase transition-all whitespace-nowrap cursor-pointer
                          ${isTyping 
                              ? 'border-[#00ffd5]/30 text-[#00ffd5]/30 cursor-wait' 
                              : 'border-[#00ffd5] text-[#00ffd5] hover:bg-[#00ffd5] hover:text-black hover:shadow-[0_0_20px_#00ffd5]'
                          }
                      `}
                   >
                      [{STEPS[step].action}]
                   </button>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
