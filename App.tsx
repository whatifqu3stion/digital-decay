import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppState, LogEntry, DecayConfig } from './types';
import { GeminiDecayService, BASE_ROT_PROMPT, DEFAULT_MODEL_ID } from './services/geminiService';
import { DBService } from './services/db';
import GIF from 'gif.js.optimized';
import { playAudio, setGlobalMuted } from './utils/audio';
import { OnboardingModal } from './components/OnboardingModal';
import { StandbyGraphic } from './components/StandbyGraphic';
import { AuthKeyModal } from './components/AuthKeyModal';

const TOTAL_FRAMES = 69;
const CANVAS_SIZE = 512; // Standardize to 512px for cost savings & faster decay

const PROMPT_DESCRIPTIONS: Record<string, string> = {
  BITCRUSH: "Preprocessing: Downsamples input to 128px to force early hallucination and artifacts.",
  CHROMATIC_ABERRATION: "Prompt Token: \"...chromatic aberration\". Adds R/G/B channel drift.",
  JPEG_ARTIFACTS: "Prompt Token: \"...jpeg compression\". Simulates 8x8 DCT block artifacts.",
  SCANLINE_GHOSTING: "Prompt Token: \"...scanline ghosting\". Adds CRT phosphor decay patterns.",
  DATAMOSH_GLITCHING: "Prompt Token: \"...data moshing\". Simulates P-frame prediction errors.",
  VHS_DISTORTION: "Prompt Token: \"...VHS distortion\". Adds luma noise and color bleeding.",
  COEFFICIENT: "Directly maps to API Temperature. 0.1 (Strict) to 1.9 (Creative). Controls randomness in token selection.",
  SIGNAL_INJECTION: "Appends specific stylistic keywords to the System Prompt.",
  GIF_DELAY: "Adjusts playback speed of the resulting loop. Lower values produce a faster, more chaotic animation.",
  OVERRIDE: "WARNING: Disables the default 'Preserve visual fidelity' instruction. You are now fully steering the model."
};

const App: React.FC = () => {
  const decayService = useRef(new GeminiDecayService());
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);

  // UI State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [keyAttached, setKeyAttached] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Social Push
  const [showSocialPush, setShowSocialPush] = useState(false);

  // Frame Management
  const [currentFrame, setCurrentFrame] = useState(0); // The furthest processed frame
  const [viewingFrame, setViewingFrame] = useState(0); // The frame currently displayed
  
  const [decayRate, setDecayRate] = useState(1.0);
  
  // Prompt Injections
  const [customPrompt, setCustomPrompt] = useState('');
  const [overrideCoreDirective, setOverrideCoreDirective] = useState(false);
  
  // Signal Degradation / Injections
  const [inputBitcrush, setInputBitcrush] = useState(false);
  const [addChromaticAberration, setAddChromaticAberration] = useState(false);
  const [addJpegArtifacts, setAddJpegArtifacts] = useState(false);
  const [addScanlines, setAddScanlines] = useState(false);
  const [addDataMoshing, setAddDataMoshing] = useState(false);
  const [addVhsDistortion, setAddVhsDistortion] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('decay_selected_model');
        if (saved) return saved;
      } catch (_) {}
    }
    return DEFAULT_MODEL_ID;
  });

  // Use Object URLs for display (strings)
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [workingImageUrl, setWorkingImageUrl] = useState<string | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [gifDelay, setGifDelay] = useState(100);
  
  // Image Fit Mode
  const [imageFitMode, setImageFitMode] = useState<'contain' | 'cover'>('cover');

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Slider State
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Safety & Control
  const [resetArmed, setResetArmed] = useState(false);
  const stopSignal = useRef(false);
  const lastBlipTime = useRef(0);

  const terminalRef = useRef<HTMLDivElement>(null);
  const sessionRestoredRef = useRef(false);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message: `> ${message}`,
      type
    };
    setLogs(prev => {
        // Prevent duplicate consecutive entries with identical content
        const lastLog = prev[prev.length - 1];
        if (lastLog && lastLog.message === `> ${message}`) {
          return prev;
        }
        const updated = [...prev.slice(-99), newLog];
        DBService.saveState('logs', updated); // Persist logs
        return updated;
    });
  }, []);

  // Restore Session
  useEffect(() => {
    if (sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;

    const restoreSession = async () => {
      try {
        const savedState = await DBService.getState('appStatus');
        const savedLogs = await DBService.getState('logs');
        const savedConfig = await DBService.getState('config');
        const onboardingComplete = await DBService.getState('onboardingComplete');
        
        if (!onboardingComplete) {
            setShowOnboarding(true);
        }

        if (savedLogs) {
          // Keep console clean by deduplicating startup key notices from prior sessions
          const cleaned = savedLogs.filter((l: LogEntry) => !l.message.includes('No API key detected') && !l.message.includes('NO_VISITOR_KEY') && !l.message.includes('Visitor key active') && !l.message.includes('AUTH:'));
          setLogs(cleaned);
          DBService.saveState('logs', cleaned);
        }
        
        const sourceBlob = await DBService.getImage('source');
        if (sourceBlob) {
            const url = URL.createObjectURL(sourceBlob);
            setSourceImageUrl(url);
            
            // If we have a source, check for progress
            const savedFrameIndex = savedState?.currentFrame || 0;
            setCurrentFrame(savedFrameIndex);
            setViewingFrame(savedFrameIndex);
            
            // Load the latest frame
            let latestBlobKey = 'source';
            if (savedFrameIndex > 0) latestBlobKey = `frame_${savedFrameIndex}`;
            if (savedState?.completed && savedState?.hasHero) latestBlobKey = 'hero';

            const latestBlob = await DBService.getImage(latestBlobKey);
            if (latestBlob) {
                const wUrl = URL.createObjectURL(latestBlob);
                setWorkingImageUrl(wUrl);
                if (latestBlobKey === 'hero') {
                    setHeroImageUrl(wUrl);
                    setAppState(AppState.COMPLETED);
                    setShowExportModal(true); // Show modal on restore if completed
                    addLog("SESSION_RESTORED: DECAY_COMPLETE", 'success');
                } else if (savedFrameIndex > 0) {
                     setWorkingImageUrl(wUrl);
                     addLog(`SESSION_RESTORED: RESUMING AT FRAME ${savedFrameIndex}`, 'info');
                     setAppState(AppState.IDLE); 
                } else {
                    addLog("SESSION_RESTORED: READY", 'info');
                    setWorkingImageUrl(url); // Reset to source
                    setAppState(AppState.IDLE);
                }
            } else {
                setWorkingImageUrl(url);
            }
        }

        if (savedConfig) {
             setOverrideCoreDirective(!!savedConfig.overrideCoreDirective);
             setCustomPrompt(savedConfig.customPrompt || '');
             // Map old allowEntropy or new inputBitcrush
             setInputBitcrush(!!savedConfig.inputBitcrush);
             
             setAddChromaticAberration(!!savedConfig.injections?.includes('CHROMATIC_ABERRATION'));
             setAddJpegArtifacts(!!savedConfig.injections?.includes('JPEG_ARTIFACTS'));
             setAddScanlines(!!savedConfig.injections?.includes('SCANLINE_GHOSTING'));
             setAddDataMoshing(!!savedConfig.injections?.includes('DATAMOSH_GLITCHING'));
             setAddVhsDistortion(!!savedConfig.injections?.includes('VHS_DISTORTION'));
             setDecayRate(savedConfig.decayRate || 1.0);
             if (savedConfig.imageFitMode) setImageFitMode(savedConfig.imageFitMode);
        }

        // Provide a single clean notice in debug console about key status
        if (typeof window !== 'undefined') {
          const hasKey = decayService.current.getVisitorApiKey();
          setKeyAttached(!!hasKey);
          if (hasKey) {
            addLog("NOTICE: Visitor key active. Ready to execute decay sequences.", 'success');
          } else {
            addLog("NOTICE: No API key detected. Add ?gemini_api_key=YOUR_KEY to URL to generate.", 'info');
          }
        }
      } catch (err) {
        console.error("Failed to restore session", err);
        addLog("STORAGE_ERROR: COULD_NOT_RESTORE_SESSION", 'error');
      }
    };
    restoreSession();
  }, []); // Run once on mount

  // Effect to handle Fit/Crop mode changes for the source image
  useEffect(() => {
    const reprocessSourceImage = async () => {
        // Only run if we are in IDLE state and have a source image
        if (appState !== AppState.IDLE || !sourceImageUrl) return;

        try {
            const rawBlob = await DBService.getImage('raw_source');
            if (!rawBlob) return; // No raw source to reprocess

            // Load raw image
            const img = new Image();
            const rawUrl = URL.createObjectURL(rawBlob);
            img.src = rawUrl;
            await new Promise((resolve) => { img.onload = resolve; });

            // Process
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_SIZE;
            canvas.height = CANVAS_SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(rawUrl);
                return;
            }

            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

            const hRatio = CANVAS_SIZE / img.width;
            const vRatio = CANVAS_SIZE / img.height;
            const ratio = imageFitMode === 'cover' ? Math.max(hRatio, vRatio) : Math.min(hRatio, vRatio);

            const centerShift_x = (CANVAS_SIZE - img.width * ratio) / 2;
            const centerShift_y = (CANVAS_SIZE - img.height * ratio) / 2;

            ctx.drawImage(img, 0, 0, img.width, img.height, centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);

            canvas.toBlob(async (blob) => {
                if (blob) {
                    await DBService.saveImage('source', blob);
                    const newUrl = URL.createObjectURL(blob);
                    
                    // Update Source URL
                    setSourceImageUrl(prev => {
                        if (prev) URL.revokeObjectURL(prev);
                        return newUrl;
                    });

                    // If viewing source (frame 0), update working URL to match
                    if (viewingFrame === 0) {
                        setWorkingImageUrl(prev => {
                            // Don't revoke here if it's the same as source (which it is)
                            // But React state flow might be tricky, so let's just set it.
                            return newUrl;
                        });
                    }
                    
                    addLog(`SOURCE_IMAGE_RESCALED: ${imageFitMode.toUpperCase()}`, 'info');
                }
                URL.revokeObjectURL(rawUrl);
            }, 'image/png');

        } catch (e) {
            console.error("Failed to reprocess source", e);
        }
    };

    reprocessSourceImage();
  }, [imageFitMode]);

  useEffect(() => {
    if (terminalRef.current) {
      const { scrollHeight, clientHeight } = terminalRef.current;
      terminalRef.current.scrollTop = scrollHeight - clientHeight;
    }
  }, [logs]);

  // Track viewport width
  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setViewportWidth(entry.contentRect.width);
      }
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [sourceImageUrl]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!sourceImageUrl) return;
    setIsDragging(true);
    updateSlider(e.clientX);
  };

  const updateSlider = useCallback((clientX: number) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) updateSlider(e.clientX);
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateSlider]);

  const processAndSaveBlob = async (processedBlob: Blob, rawBlob: Blob) => {
    await DBService.resetAll(); // Clear previous session
    await DBService.saveImage('source', processedBlob);
    await DBService.saveImage('raw_source', rawBlob); // Store raw for re-processing
    
    // Persist onboarding state after reset since resetAll clears it
    await DBService.saveState('onboardingComplete', true);
    
    const url = URL.createObjectURL(processedBlob);
    setSourceImageUrl(url);
    setWorkingImageUrl(url);
    setHeroImageUrl(null);
    setCurrentFrame(0);
    setViewingFrame(0);
    setAppState(AppState.IDLE);
    setSliderPos(50);
    setShowSocialPush(false);
    
    playAudio('start');
    addLog(`INPUT_TENSOR_NORMALIZATION [${CANVAS_SIZE}x${CANVAS_SIZE}]... [COMPLETED]`, 'success');
  }

  const bitcrushImage = async (blob: Blob): Promise<Blob> => {
      return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d')!;
              // Downsample to 128px (mild pixelation)
              const tempSize = 128; 
              canvas.width = tempSize;
              canvas.height = tempSize;
              ctx.drawImage(img, 0, 0, tempSize, tempSize);
              
              // Upsample back to 512px
              const finalCanvas = document.createElement('canvas');
              finalCanvas.width = CANVAS_SIZE;
              finalCanvas.height = CANVAS_SIZE;
              const finalCtx = finalCanvas.getContext('2d')!;
              // Critical: Use Nearest Neighbor for pixelated look
              finalCtx.imageSmoothingEnabled = false; 
              finalCtx.drawImage(canvas, 0, 0, tempSize, tempSize, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
              
              finalCanvas.toBlob((b) => resolve(b!), 'image/png');
          };
          img.src = URL.createObjectURL(blob);
      });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      playAudio('click');
      addLog(`SUBJECT_ACQUIRED: ${file.name.toUpperCase()}`, 'success');
      
      const reader = new FileReader();
      reader.onload = async (event) => {
         const result = event.target?.result as string;
         const img = new Image();
         img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_SIZE;
            canvas.height = CANVAS_SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

            const hRatio = CANVAS_SIZE / img.width;
            const vRatio = CANVAS_SIZE / img.height;
            // Respect fit mode
            const ratio = imageFitMode === 'cover' ? Math.max(hRatio, vRatio) : Math.min(hRatio, vRatio);
            
            const centerShift_x = (CANVAS_SIZE - img.width * ratio) / 2;
            const centerShift_y = (CANVAS_SIZE - img.height * ratio) / 2;

            ctx.drawImage(img, 0, 0, img.width, img.height, centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);
            
            canvas.toBlob(async (blob) => {
                if(blob) await processAndSaveBlob(blob, file);
            }, 'image/png');
         };
         img.src = result;
      }
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    if (appState === AppState.PROCESSING) return;
    playAudio('click');
    setCameraError(false);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' }, 
            audio: false 
        });
        streamRef.current = stream;
        setShowCamera(true);
        // Slight delay to ensure modal DOM exists
        setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        }, 100);
        addLog("OPTICAL_SENSOR_ENGAGED", "success");
    } catch (err) {
        console.error(err);
        setCameraError(true);
        setShowCamera(true);
        addLog("OPTICAL_SENSOR_FAILURE: PERMISSION_DENIED", "error");
        playAudio('error');
    }
  };

  const stopCamera = () => {
      playAudio('click');
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      setShowCamera(false);
  };

  const capturePhoto = () => {
      if (videoRef.current) {
          playAudio('blip');
          const video = videoRef.current;
          
          // Capture Raw High-Res Frame first for future re-processing
          const rawCanvas = document.createElement('canvas');
          rawCanvas.width = video.videoWidth;
          rawCanvas.height = video.videoHeight;
          const rawCtx = rawCanvas.getContext('2d');
          if (!rawCtx) return;
          rawCtx.drawImage(video, 0, 0);

          rawCanvas.toBlob((rawBlob) => {
              if (rawBlob) {
                  // Now create the processed 512x512 version
                  const canvas = document.createElement('canvas');
                  canvas.width = CANVAS_SIZE;
                  canvas.height = CANVAS_SIZE;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) return;

                  ctx.fillStyle = 'black';
                  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

                  // Calculate aspect ratio crop based on fit mode
                  const hRatio = CANVAS_SIZE / video.videoWidth;
                  const vRatio = CANVAS_SIZE / video.videoHeight;
                  const ratio = imageFitMode === 'cover' ? Math.max(hRatio, vRatio) : Math.min(hRatio, vRatio);
                  
                  const centerShift_x = (CANVAS_SIZE - video.videoWidth * ratio) / 2;
                  const centerShift_y = (CANVAS_SIZE - video.videoHeight * ratio) / 2;

                  ctx.save();
                  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio);
                  ctx.restore();

                  canvas.toBlob(async (blob) => {
                      if (blob) {
                          stopCamera();
                          addLog("IMAGE_DATA_LATCHED", "success");
                          await processAndSaveBlob(blob, rawBlob);
                      }
                  }, 'image/png');
              }
          }, 'image/png');
      }
  };

  const playSliderSound = useCallback(() => {
    const now = Date.now();
    if (now - lastBlipTime.current > 50) { // Reduced to 50ms for smoother feel on rapid slides
        playAudio('blip');
        lastBlipTime.current = now;
    }
  }, []);

  // Timeline Scrubbing Logic
  const handleTimelineScrub = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (appState === AppState.PROCESSING) return;
      const frameIndex = parseInt(e.target.value);
      setViewingFrame(frameIndex);
      
      const key = frameIndex === 0 ? 'source' : (frameIndex === TOTAL_FRAMES ? 'hero' : `frame_${frameIndex}`);
      const blob = await DBService.getImage(key);
      if (blob) {
          const url = URL.createObjectURL(blob);
          // Revoke old only if it's a blob url we created recently (simplification: we revoke on every change for now, except source)
          if (workingImageUrl && workingImageUrl !== sourceImageUrl) URL.revokeObjectURL(workingImageUrl);
          setWorkingImageUrl(url);
          
          playSliderSound();
      }
  };
  
  const saveCurrentFrame = () => {
      if (!workingImageUrl) return;
      const link = document.createElement('a');
      link.href = workingImageUrl;
      link.download = `decay_t${decayRate.toFixed(2)}_frame_${viewingFrame}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      playAudio('success');
      addLog(`FRAME_${viewingFrame}_EXTRACTED`, "success");
  };

  const toggleExecution = async () => {
      if (appState === AppState.PROCESSING) {
          // HALT LOGIC
          stopSignal.current = true;
          addLog("HALT_SIGNAL_RECEIVED... TERMINATING SEQUENCE.", "warning");
          playAudio('halt');
          return;
      }
      
      // EXECUTE LOGIC
      playAudio('start');
      stopSignal.current = false;
      executeDecay();
  };

  const executeDecay = async () => {
    let sourceBlob = await DBService.getImage('source');
    
    // Robust fallback: if DBService returned undefined but sourceImageUrl exists, rehydrate from blob URL
    if (!sourceBlob && sourceImageUrl) {
      try {
        const res = await fetch(sourceImageUrl);
        sourceBlob = await res.blob();
        await DBService.saveImage('source', sourceBlob);
      } catch (_) {}
    }
    
    // If we're restarting or starting fresh
    let startFrame = currentFrame;
    if (appState === AppState.COMPLETED) {
        startFrame = 0;
        await DBService.clearImages();
        await DBService.saveImage('source', sourceBlob!);
        // We preserve raw_source implicitly because clearImages does not selectively delete. 
        // Wait, clearImages() deletes EVERYTHING in 'images'.
        // So we need to re-save raw_source if we want to keep it.
        const rawBlob = await DBService.getImage('raw_source');
        if (rawBlob) {
             // We need to re-save it after clear, but clearImages is async.
             // Actually, clearImages deletes everything. 
             // Ideally we just delete frames. But checking existing implementation: DBService.clearImages() -> db.clear('images').
             // So we must fetch raw first, then clear, then save back.
             await DBService.saveImage('raw_source', rawBlob); 
        }
    }
    
    if (!sourceBlob && startFrame === 0) {
      addLog("ERR_NULL_SOURCE: Awaiting subject injection.", "error");
      playAudio('error');
      return;
    }

    if (!decayService.current.getVisitorApiKey()) {
      setShowAuthModal(true);
      addLog("AUTH_REQUIRED: Connect your Gemini API key to begin generation.", "warning");
      playAudio('error');
      return;
    }

    setAppState(AppState.PROCESSING);
    
    const injections: string[] = [];
    if (addChromaticAberration) injections.push('CHROMATIC_ABERRATION');
    if (addJpegArtifacts) injections.push('JPEG_ARTIFACTS');
    if (addScanlines) injections.push('SCANLINE_GHOSTING');
    if (addDataMoshing) injections.push('DATAMOSH_GLITCHING');
    if (addVhsDistortion) injections.push('VHS_DISTORTION');
    
    // Save Config
    await DBService.saveState('config', {
        customPrompt,
        overrideCoreDirective,
        inputBitcrush, // Save new config
        injections,
        decayRate,
        imageFitMode // Save fit mode
    });

    addLog(`INIT_PROTOCOL: RECURSIVE IMAGE-TO-IMAGE | FRAME ${startFrame}`, 'info');
    
    // Determine start image (either source or last generated frame)
    let currentBlob = sourceBlob!;
    if (startFrame > 0) {
        const lastFrameBlob = await DBService.getImage(`frame_${startFrame}`);
        if (lastFrameBlob) currentBlob = lastFrameBlob;
    } else if (inputBitcrush) {
        // Only apply bitcrush if we are starting from the source (frame 0)
        addLog("PREPROCESS: DOWNSAMPLE (BITCRUSH_128px)", 'warning');
        currentBlob = await bitcrushImage(sourceBlob!);
    }

    // Calculate actual temperature for logging (Matches service logic)
    const actualTemp = Math.max(0.0, Math.min(2.0, (decayRate - 0.5) * 1.8 + 0.1)).toFixed(2);

    for (let i = startFrame + 1; i <= TOTAL_FRAMES; i++) {
      if (stopSignal.current) {
          setAppState(AppState.IDLE);
          addLog(`SEQUENCE_HALTED AT GEN_${i-1}`, "warning");
          break;
      }

      const isHero = i === TOTAL_FRAMES;
      
      if (isHero) {
        addLog(`FINAL_ITERATION: STABILIZING HERO ARTIFACT...`, 'warning');
      }

      try {
        const startTime = Date.now();
        const activeModel = decayService.current.getSelectedModel();
        
        const nextBlob = await decayService.current.processFrame(
          currentBlob,
          isHero,
          { 
            injections, 
            customPrompt, 
            overrideCoreDirective,
            decayRate,
            modelId: selectedModelId
          }
        );

        if (nextBlob) {
          const latency = Date.now() - startTime;
          currentBlob = nextBlob;
          
          // Persist Frame
          const key = isHero ? 'hero' : `frame_${i}`;
          await DBService.saveImage(key, nextBlob);
          if (isHero) {
            await DBService.saveImage(`frame_${i}`, nextBlob);
          }
          
          // Persist State
          await DBService.saveState('appStatus', {
              currentFrame: i,
              completed: isHero,
              hasHero: isHero
          });

          // Update UI
          const newUrl = URL.createObjectURL(nextBlob);
          if (workingImageUrl && workingImageUrl !== sourceImageUrl) URL.revokeObjectURL(workingImageUrl); // Clean up old
          setWorkingImageUrl(newUrl);
          setCurrentFrame(i);
          setViewingFrame(i); // Sync view with progress

          playAudio(isHero ? 'success' : 'process');

          if (isHero) {
            setHeroImageUrl(newUrl);
            addLog(`> RESP: ${activeModel.shortLabel} | ${latency}ms | ${(nextBlob.size/1024).toFixed(1)}KB`, 'success');
            addLog(`ARTIFACT_69_STABILIZED. SEQUENCE COMPLETE.`, 'success');
          } else {
             // Technical logs
             addLog(`> REQ: ${activeModel.id} | TEMP: ${actualTemp} | FRAME: ${String(i).padStart(2, '0')}`, 'info');
             addLog(`> RESP: OK | LATENCY: ${latency}ms | SIZE: ${(nextBlob.size/1024).toFixed(1)}KB`, 'success');
          }
        }
      } catch (err: any) {
        playAudio('error');
        const errorMessage = err?.message || 'UNKNOWN_SIGNAL_LOSS';
        addLog(`ERR: ${errorMessage}`, 'error');
        setAppState(AppState.ERROR);
        break;
      }
      
      // Delay to avoid rate limits
      await new Promise(r => setTimeout(r, 1500));
    }

    if (!stopSignal.current && appState !== AppState.ERROR) {
       setAppState(AppState.COMPLETED);
       setShowExportModal(true); // Auto-open modal on completion
    }
  };

  const triggerSocialPush = () => {
      // Delay to allow download to start
      setTimeout(() => {
          setShowSocialPush(true);
          playAudio('blip');
      }, 1500);
  };

  const downloadCurrentImage = () => {
    if (!workingImageUrl) return;
    const link = document.createElement('a');
    link.href = workingImageUrl;
    link.download = `decay_frame_${viewingFrame}_t${decayRate.toFixed(2)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(`FRAME_${viewingFrame}_EXTRACTED_SUCCESSFULLY`, "success");
    playAudio('success');
    triggerSocialPush();
  };

  const exportComparison = async (orientation: 'horizontal' | 'vertical') => {
      const sourceBlob = await DBService.getImage('source');
      
      // Determine right-side image based on viewingFrame
      let key = `frame_${viewingFrame}`;
      if (viewingFrame === TOTAL_FRAMES) key = 'hero';
      if (viewingFrame === 0) key = 'source';

      const compareBlob = await DBService.getImage(key);

      if (!sourceBlob || !compareBlob) {
          addLog("ERROR: INCOMPLETE_DATA_FOR_COMPARISON", "error");
          playAudio('error');
          return;
      }

      playAudio('process');
      addLog(`GENERATING_${orientation.toUpperCase()}_COMPARISON_MATRIX [0 vs ${viewingFrame}]...`, "info");

      const load = (b: Blob) => new Promise<HTMLImageElement>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.src = URL.createObjectURL(b);
      });

      const [srcImg, compImg] = await Promise.all([load(sourceBlob), load(compareBlob)]);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = CANVAS_SIZE; 

      if (orientation === 'horizontal') {
          canvas.width = size * 2;
          canvas.height = size;
          // Source Left
          ctx.drawImage(srcImg, 0, 0, size, size);
          // Compare Right
          ctx.drawImage(compImg, size, 0, size, size);
          
          // Optional: Add a subtle divider
          ctx.fillStyle = '#00ffd5';
          ctx.fillRect(size - 1, 0, 2, size);
          
      } else {
          canvas.width = size;
          canvas.height = size * 2;
          // Source Top
          ctx.drawImage(srcImg, 0, 0, size, size);
          // Compare Bottom
          ctx.drawImage(compImg, 0, size, size, size);

          // Optional: Add a subtle divider
          ctx.fillStyle = '#00ffd5';
          ctx.fillRect(0, size - 1, size, 2);
      }

      canvas.toBlob((b) => {
          if (!b) return;
          const link = document.createElement('a');
          link.href = URL.createObjectURL(b);
          link.download = `decay_comparison_${orientation}_f${viewingFrame}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          playAudio('success');
          addLog(`COMPARISON_EXPORT_COMPLETE`, 'success');
          triggerSocialPush();
      }, 'image/png');
  };

  const exportGif = async () => {
    if (isExporting) return;
    setIsExporting(true);
    playAudio('click');
    addLog(`INITIATING_GIF_ENCODING: COMPILING FULL SEQUENCE (0-${currentFrame}) [${gifDelay}ms DELAY]...`, "warning");

    let workerUrl = '';
    const loadedFrameUrls: string[] = [];

    try {
        // Fix for cross-origin worker issues: Load script into Blob
        // Use unpkg to get the raw worker script (classic script), not an ES module from esm.sh
        const workerResponse = await fetch('https://unpkg.com/gif.js.optimized@1.0.1/dist/gif.worker.js');
        if (!workerResponse.ok) throw new Error("FAILED_TO_FETCH_GIF_WORKER");
        const workerBlob = await workerResponse.blob();
        workerUrl = URL.createObjectURL(workerBlob);

        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            workerScript: workerUrl
        });

        // Fetch the ENTIRE sequence of images
        const frames: Blob[] = [];
        
        // Frame 0: Source image (or bitcrushed source)
        const source = await DBService.getImage('source');
        if (source) {
            if (inputBitcrush) {
                const bitcrushedSource = await bitcrushImage(source);
                frames.push(bitcrushedSource);
            } else {
                frames.push(source);
            }
        }

        // Entire intermediate sequence from Frame 1 through currentFrame
        const targetEndFrame = Math.max(currentFrame, 1);
        for (let i = 1; i <= targetEndFrame; i++) {
            let b = await DBService.getImage(`frame_${i}`);
            if (!b && (i === TOTAL_FRAMES || i === targetEndFrame)) {
                b = await DBService.getImage('hero');
            }
            if (b) {
                frames.push(b);
            }
        }

        // Fallback: If currentFrame was 0 or frames were missing from numeric sequence
        if (frames.length <= 1) {
            const keys = await DBService.getAllKeys('images');
            const frameKeys = keys.filter(k => k.startsWith('frame_')).sort((a, b) => {
                const numA = parseInt(a.split('_')[1]);
                const numB = parseInt(b.split('_')[1]);
                return numA - numB;
            });
            for (const k of frameKeys) {
                const b = await DBService.getImage(k);
                if (b && !frames.includes(b)) frames.push(b);
            }
            const hero = await DBService.getImage('hero');
            if (hero && !frames.includes(hero)) frames.push(hero);
        }

        if (frames.length < 2) {
            addLog("ERROR: INSUFFICIENT_DATA_FOR_GIF (MIN 2 FRAMES REQUIRED)", "error");
            setIsExporting(false);
            playAudio('error');
            URL.revokeObjectURL(workerUrl);
            return;
        }

        const loadImage = (blob: Blob): Promise<HTMLImageElement> => 
            new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(blob);
                loadedFrameUrls.push(url); // Track for cleanup
                img.onload = () => {
                    resolve(img);
                };
                img.onerror = reject;
                img.src = url;
            });

        // Create a temporary canvas for normalization
        const canvas = document.createElement('canvas');
        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
        const ctx = canvas.getContext('2d');

        for (let i = 0; i < frames.length; i++) {
            const img = await loadImage(frames[i]);
            
            if (ctx) {
                // Clear and draw normalized
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
                ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
                
                const isLastFrame = i === frames.length - 1;
                // Add the canvas context to the GIF to use the normalized image data
                gif.addFrame(ctx, { copy: true, delay: isLastFrame ? 3000 : gifDelay });
            }
        }

        gif.on('finished', function(blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `decay_animation_t${decayRate.toFixed(2)}.gif`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            // CLEANUP
            if (workerUrl) URL.revokeObjectURL(workerUrl);
            loadedFrameUrls.forEach(u => URL.revokeObjectURL(u));

            addLog(`GIF_ENCODING_COMPLETE: ENTIRE SEQUENCE (${frames.length} FRAMES) EXPORTED.`, "success");
            setIsExporting(false);
            playAudio('success');
            triggerSocialPush();
        });

        gif.render();

    } catch (e) {
        console.error(e);
        addLog("GIF_ENCODING_FAILED: CHECK NETWORK CONNECTION", "error");
        setIsExporting(false);
        playAudio('error');
        
        // Cleanup on error
        if (workerUrl) URL.revokeObjectURL(workerUrl);
        loadedFrameUrls.forEach(u => URL.revokeObjectURL(u));
    }
  };

  const handleReset = async () => {
      playAudio('click');
      if (!resetArmed) {
          setResetArmed(true);
          addLog("WARNING: SYSTEM_WIPE_ARMED. CONFIRM TO PROCEED.", "warning");
          setTimeout(() => setResetArmed(false), 3000); // Disarm after 3s
          return;
      }
      
      setResetArmed(false);
      resetTerminal();
  };

  const resetTerminal = async () => {
    playAudio('halt');
    setAppState(AppState.IDLE);
    setLogs([]);
    setCurrentFrame(0);
    setViewingFrame(0);
    setShowSocialPush(false);
    setShowExportModal(false);
    
    // Revoke old URLs
    if (workingImageUrl) URL.revokeObjectURL(workingImageUrl);
    if (heroImageUrl) URL.revokeObjectURL(heroImageUrl);
    // Keep source URL if we want, or clear it. Let's clear everything.
    if (sourceImageUrl) URL.revokeObjectURL(sourceImageUrl);

    setSourceImageUrl(null);
    setWorkingImageUrl(null);
    setHeroImageUrl(null);
    setSliderPos(50);
    
    await DBService.resetAll();
    // Re-save onboarding state
    await DBService.saveState('onboardingComplete', true);
    addLog("SYSTEM_REBOOT... TERMINAL_READY.");
  };

  const handleMuteToggle = () => {
      const newState = !isMuted;
      setIsMuted(newState);
      setGlobalMuted(newState);
  };

  // Guidance logic
  const shouldPulseLoad = appState === AppState.IDLE && !sourceImageUrl;
  const shouldFlickerExecute = appState === AppState.IDLE && !!sourceImageUrl;
  const shouldGlimmerSave = appState === AppState.COMPLETED;

  const getEntropyLabel = (rate: number) => {
    if (rate < 0.8) return "STRICT [TEMP ~0.1]";
    if (rate > 1.2) return "CHAOTIC [TEMP ~1.9]";
    return "BALANCED [TEMP ~1.0]";
  };

  const Checkbox = ({ label, checked, onChange, colorClass = 'teal', tooltip = '' }) => {
    const isDisabled = appState === AppState.PROCESSING;
    const colors = {
      teal: { border: 'border-[#00ffd5]', text: 'text-[#00ffd5]', bg: 'bg-[#00ffd5]' },
      magenta: { border: 'border-[#ff007f]', text: 'text-[#ff007f]', bg: 'bg-[#ff007f]' },
      purple: { border: 'border-[#7a00ff]', text: 'text-[#e5e5e5]', bg: 'bg-[#7a00ff]' }
    };
    const currentColors = colors[colorClass] || colors.teal;

    return (
       <div 
        title={tooltip}
        className={`flex items-center gap-3 select-none transition-opacity ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => {
            if (!isDisabled) {
                onChange(!checked);
                playAudio('click');
            }
        }}
      >
        <div className={`w-5 h-5 border flex items-center justify-center transition-colors ${checked ? `${currentColors.border} ${currentColors.bg}/10` : 'border-[#00ffd5]'}`}>
          {checked && <div className={`w-2.5 h-2.5 ${currentColors.bg}`}></div>}
        </div>
        <span className={`text-xs font-bold tracking-widest uppercase transition-colors ${checked ? currentColors.text : 'text-[#00ffd5]'}`}>
          {label}
        </span>
      </div>
    );
  };
  
  const handleOnboardingComplete = async () => {
      setShowOnboarding(false);
      await DBService.saveState('onboardingComplete', true);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 max-w-6xl mx-auto selection:bg-[#ff007f] selection:text-white rounded-none">
      
      {showOnboarding && (
        <OnboardingModal 
          onComplete={handleOnboardingComplete}
          getApiKey={() => decayService.current.getVisitorApiKey()}
          onSetApiKey={(key, remember) => {
            decayService.current.setVisitorApiKey(key, remember);
            setKeyAttached(true);
            addLog("AUTH_SUCCESS: Key attached from boot terminal. Ready.", "success");
          }}
        />
      )}

      <AuthKeyModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentKey={decayService.current.getVisitorApiKey()}
        selectedModelId={selectedModelId}
        onSelectModel={(modelId) => {
          setSelectedModelId(modelId);
          decayService.current.setSelectedModel(modelId);
          addLog(`MODEL_SELECT: Active engine set to ${decayService.current.getSelectedModel().name}`, 'info');
        }}
        onPurge={() => {
          decayService.current.setVisitorApiKey(null);
          setKeyAttached(false);
          setShowAuthModal(false);
          addLog("AUTH: Key removed from device memory.", "info");
        }}
        onSuccess={(key, remember) => {
          decayService.current.setVisitorApiKey(key, remember);
          setKeyAttached(true);
          setShowAuthModal(false);
          addLog("AUTH_SUCCESS: Key attached to device memory. Ready.", "success");
          setTimeout(() => {
            executeDecay();
          }, 100);
        }}
      />

      <header className="border-b border-[#00ffd5] pb-4 flex justify-between items-end gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setShowOnboarding(true); playAudio('click'); }}
            className="text-3xl md:text-4xl hover:scale-125 active:scale-95 transition-all duration-300 cursor-pointer border-none outline-none focus:outline-none p-0 bg-transparent group select-none relative"
            title="App Start // Click to view System Protocol & BYOK Setup Guide"
            aria-label="App Start"
          >
            <span className="inline-block transition-all duration-300 filter drop-shadow-[0_0_6px_rgba(0,255,213,0.4)] group-hover:drop-shadow-[0_0_20px_#00ffd5] group-hover:rotate-12 group-hover:brightness-125">
              🫠
            </span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tighter glitch-text text-[#00ffd5] uppercase">DIGITAL_DECAY</h1>
            </div>
            <p className="text-xs md:text-sm tracking-widest opacity-60 text-[#e5e5e5] font-bold">ENTROPY_ANALYSIS_UNIT // v2.0.0</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          {/* Active Model Indicator Button */}
          <button
            onClick={() => {
              playAudio('click');
              setShowAuthModal(true);
            }}
            className={`border px-2.5 py-1 text-xs font-mono tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedModelId === 'gemini-2.5-flash-image'
                ? 'border-[#00ffd5] text-[#00ffd5] bg-[#00ffd5]/10 hover:bg-[#00ffd5] hover:text-black font-bold'
                : 'border-purple-400 text-purple-300 bg-purple-950/40 hover:bg-purple-900/60 shadow-[0_0_10px_rgba(168,85,247,0.3)] font-bold'
            }`}
            title={`Active Engine: ${decayService.current.getSelectedModel().name}. Click to switch model or manage key.`}
          >
            <span>{selectedModelId === 'gemini-2.5-flash-image' ? '⚡ 2.5 FLASH [FREE TIER]' : '💎 3.1 FLASH [PAID TIER]'}</span>
          </button>

          {/* Key Status Button */}
          <button 
            onClick={() => { playAudio('click'); setShowAuthModal(true); }}
            className={`border px-2.5 py-1 text-xs font-mono tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
              keyAttached 
                ? 'border-[#00ffd5] text-[#00ffd5] bg-[#00ffd5]/10 hover:bg-[#00ffd5] hover:text-black shadow-[0_0_10px_rgba(0,255,213,0.2)] font-bold' 
                : 'border-[#ff007f]/60 text-[#ff007f] bg-[#ff007f]/5 hover:bg-[#ff007f] hover:text-black'
            }`}
            title={keyAttached ? "API Key Connected & Armed (Click to view/manage)" : "No API Key Connected (Click to connect)"}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${keyAttached ? 'bg-[#00ffd5] animate-pulse' : 'bg-[#ff007f]'}`}></span>
            <span>{keyAttached ? '[ 🔑 KEY: ARMED ]' : '[ 🔑 KEY: UNLINKED ]'}</span>
          </button>

          {/* Clear / Reset All Button */}
          <button
            onClick={handleReset}
            className={`border px-2.5 py-1 text-xs font-mono tracking-wider uppercase transition-all cursor-pointer ${
              resetArmed
                ? 'border-[#ff007f] bg-[#ff007f] text-black shadow-[0_0_20px_#ff007f] animate-magenta-flicker font-black'
                : 'border-[#00ffd5]/40 text-[#e5e5e5] hover:border-[#ff007f] hover:text-[#ff007f] hover:bg-[#ff007f]/10'
            }`}
            title="Clear everything (images, frames, settings) and start completely fresh"
          >
            {resetArmed ? ':: CONFIRM WIPE? ::' : '[ ⟲ CLEAR ALL ]'}
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch flex-grow">
        <div className="flex flex-col gap-6">
          <div 
            ref={imageContainerRef}
            onMouseDown={handleMouseDown}
            className={`border border-[#00ffd5] p-1 bg-black aspect-square relative overflow-hidden group select-none ${sourceImageUrl ? 'cursor-ew-resize' : ''}`}
          >
            {sourceImageUrl ? (
              <div ref={viewportRef} className="absolute inset-1 overflow-hidden pointer-events-none">
                {/* Right Side: Decaying Image (Always behind) */}
                <img 
                  src={workingImageUrl || sourceImageUrl} 
                  alt="Decaying Artifact"
                  className="absolute inset-0 w-full h-full object-cover object-left"
                  style={{ imageRendering: 'pixelated' }}
                />
                
                {/* Left Side: Source Image (In clipped container) */}
                <div 
                  className="absolute inset-0 overflow-hidden border-r border-[#00ffd5] shadow-[10px_0_30px_rgba(0,255,213,0.3)] z-10"
                  style={{ width: `${sliderPos}%` }}
                >
                  <img 
                    src={sourceImageUrl} 
                    alt="Original Subject" 
                    className="absolute top-0 left-0 h-full object-cover max-w-none object-left"
                    style={{ 
                      width: viewportWidth ? `${viewportWidth}px` : 'auto',
                      imageRendering: 'pixelated' 
                    }}
                  />
                </div>

                {/* HUD Label Left: Fixed geometry, never wraps or changes shape */}
                <div 
                  title="Shows the original uploaded image."
                  className="absolute top-10 left-4 text-xs bg-black/85 px-2 py-1 border border-[#00ffd5] text-[#00ffd5] tracking-widest font-bold z-20 pointer-events-auto cursor-help whitespace-nowrap select-none shadow-[0_0_12px_rgba(0,0,0,0.85)]"
                >
                  INPUT_TENSOR [SRC]
                </div>

                {/* HUD Label Right: Fixed geometry, never wraps or changes shape */}
                <div 
                  title="Shows the current state of the decayed image."
                  className="absolute top-10 right-4 text-xs bg-black/85 px-2 py-1 border border-[#7a00ff] text-[#e5e5e5] tracking-widest font-bold z-20 pointer-events-auto cursor-help whitespace-nowrap select-none shadow-[0_0_12px_rgba(0,0,0,0.85)]"
                >
                  OUTPUT_TENSOR [GEN_{String(viewingFrame).padStart(2, '0')}]
                </div>

                {/* Draggable Handle Bar */}
                <div 
                  className="absolute top-0 bottom-0 w-[2px] bg-[#00ffd5] shadow-[0_0_15px_#00ffd5] pointer-events-none flex items-center justify-center z-30"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="w-6 h-10 bg-black border border-[#00ffd5] flex items-center justify-center cursor-ew-resize">
                    <span className="text-[#00ffd5] text-xs font-bold">↔</span>
                  </div>
                </div>
              </div>
            ) : (
              <StandbyGraphic />
            )}
            
            <div className="absolute top-0 right-0 p-2 text-xs font-mono bg-black text-[#ff007f] border-l border-b border-[#00ffd5] z-40">
              PROGRESS: {Math.round((currentFrame / TOTAL_FRAMES) * 100)}%
            </div>
            <div className="absolute bottom-0 left-0 p-2 text-xs font-mono bg-black text-[#00ffd5] border-r border-t border-[#00ffd5] z-40">
              FRAME_{String(viewingFrame).padStart(2, '0')}
            </div>

            {appState === AppState.PROCESSING && (
              <div className="absolute inset-0 pointer-events-none z-50">
                <div className="w-full h-full border-[10px] border-[#ff007f]/5 animate-pulse"></div>
                <div className="absolute top-0 left-0 w-full h-1 bg-[#ff007f] opacity-20 animate-[scanline_1s_infinite]"></div>
              </div>
            )}
          </div>
          
          {/* Timeline Scrubber (Only visible if we have frames) */}
          {currentFrame > 0 && (
              <div className="flex gap-2 items-center border border-[#00ffd5] bg-black p-2 animate-in fade-in slide-in-from-top-1">
                  <span className="text-xs font-mono text-[#e5e5e5] whitespace-nowrap">HISTORY SCAN:</span>
                  <input 
                    type="range"
                    min="0"
                    max={currentFrame}
                    value={viewingFrame}
                    onChange={handleTimelineScrub}
                    disabled={appState === AppState.PROCESSING}
                    title="Drag to view frame history"
                    className="flex-grow accent-[#7a00ff] h-1 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs font-mono text-[#00ffd5] w-8 text-right">{viewingFrame}</span>
                  <button 
                    onClick={saveCurrentFrame}
                    disabled={appState === AppState.PROCESSING}
                    title="Download currently displayed frame"
                    className="ml-2 border border-[#00ffd5] p-1 text-[#00ffd5] hover:bg-[#00ffd5] hover:text-black text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                      💾
                  </button>
              </div>
          )}

          <div className="border border-[#00ffd5] p-6 bg-black flex flex-col gap-4">
            
            {/* Input Selection */}
            <div className="flex flex-col gap-4 pb-4 border-b border-[#00ffd5]/20">
              
              {/* Fit Mode Toggle */}
              <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                  <span className="text-[#00ffd5]">Input Scaling Mode</span>
                  <div className="flex border border-[#00ffd5] divide-x divide-[#00ffd5]">
                      <button 
                        onClick={() => { setImageFitMode('contain'); playAudio('click'); }}
                        className={`px-3 py-1 transition-colors min-w-[60px] text-center ${imageFitMode === 'contain' ? 'bg-[#00ffd5] text-black' : 'text-[#00ffd5] hover:bg-[#00ffd5]/10'} disabled:cursor-not-allowed`}
                        title="FIT: Preserve entire image (Adds black bars)"
                        disabled={appState === AppState.PROCESSING}
                      >
                          [ FIT ]
                      </button>
                      <button 
                         onClick={() => { setImageFitMode('cover'); playAudio('click'); }}
                         className={`px-3 py-1 transition-colors min-w-[60px] text-center ${imageFitMode === 'cover' ? 'bg-[#00ffd5] text-black' : 'text-[#00ffd5] hover:bg-[#00ffd5]/10'} disabled:cursor-not-allowed`}
                         title="CROP: Fill square (Removes black bars)"
                         disabled={appState === AppState.PROCESSING}
                      >
                          [ CROP ]
                      </button>
                  </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <div className="relative">
                    <input 
                        type="file" 
                        id="img-upload" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleFileUpload}
                        disabled={appState === AppState.PROCESSING}
                    />
                    <label 
                        htmlFor="img-upload"
                        title="Select a source image for the decay process."
                        className={`block text-center border p-3 transition-all font-bold tracking-widest text-sm uppercase ${
                        shouldPulseLoad
                            ? 'border-[#ff007f] text-[#ff007f] hover:bg-[#ff007f] hover:text-white animate-magenta-flicker'
                            : 'border-[#00ffd5] hover:bg-[#00ffd5] hover:text-black'
                        } ${appState === AppState.PROCESSING ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        Load File
                    </label>
                    </div>
                    <button
                        onClick={startCamera}
                        title="Use device camera as source"
                        disabled={appState === AppState.PROCESSING}
                        className={`block text-center border p-3 transition-all font-bold tracking-widest text-sm uppercase ${
                        shouldPulseLoad
                            ? 'border-[#ff007f] text-[#ff007f] hover:bg-[#ff007f] hover:text-white animate-magenta-flicker'
                            : 'border-[#00ffd5] text-[#00ffd5] hover:bg-[#00ffd5] hover:text-black'
                        } ${appState === AppState.PROCESSING ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        or use optical sensor
                    </button>
                </div>
                
                <button 
                    onClick={toggleExecution}
                    title={appState === AppState.PROCESSING ? "EMERGENCY HALT: Stop current generation" : "EXECUTE: Begin the 69-frame generation loop. Consumes API quota."}
                    disabled={!sourceImageUrl && appState !== AppState.PROCESSING}
                    className={`border p-3 transition-all font-bold tracking-widest text-sm uppercase disabled:opacity-20 flex items-center justify-center gap-2
                        ${appState === AppState.PROCESSING 
                            ? 'border-[#ff007f] text-[#ff007f] hover:bg-[#ff007f] hover:text-white animate-pulse shadow-[0_0_15px_rgba(255,0,127,0.4)] cursor-pointer' 
                            : 'border-[#ff007f] text-[#ff007f] hover:bg-[#ff007f] hover:text-white ' + (shouldFlickerExecute ? 'animate-magenta-flicker' : '') + ' disabled:cursor-not-allowed'
                        }
                    `}
                >
                    {appState === AppState.PROCESSING ? (
                        <>
                            <span className="w-2 h-2 bg-[#ff007f] rounded-full animate-ping"></span>
                            HALT SIGNAL
                        </>
                    ) : (
                        currentFrame > 0 && appState === AppState.IDLE ? `Resume (Gen ${currentFrame})` : 'Execute Decay'
                    )}
                </button>
              </div>
            </div>

            {/* Advanced Toggle */}
            <button 
                onClick={() => { setShowAdvanced(!showAdvanced); playAudio('click'); }}
                className={`flex items-center justify-between w-full p-3 border transition-all group ${showAdvanced ? 'border-[#00ffd5] bg-[#00ffd5]/5' : 'border-[#00ffd5]/30 hover:border-[#00ffd5] hover:bg-[#00ffd5]/5'}`}
            >
                <span className="text-xs font-bold tracking-[0.2em] text-[#00ffd5] uppercase flex items-center gap-2">
                    {showAdvanced ? '[-]' : '[+]'} Advanced Configuration
                </span>
                <span className="text-[#00ffd5]/50 font-mono text-[10px] group-hover:text-[#00ffd5]">
                    ENTROPY // TOKENS // INJECTIONS
                </span>
            </button>

            {showAdvanced && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1">
                        <div className="flex justify-between items-baseline">
                        <label className="text-base tracking-[0.2em] text-[#e5e5e5] font-bold uppercase">Entropy (Temperature)</label>
                        <div className="text-right">
                            <span className="block text-[#ff007f] font-mono text-xl leading-none">{decayRate.toFixed(2)}</span>
                            <span className="text-[10px] font-mono text-[#00ffd5]">{getEntropyLabel(decayRate)}</span>
                        </div>
                        </div>
                        <div className="h-8 flex items-center">
                        <input 
                            type="range" 
                            min="0.5" 
                            max="1.5" 
                            step="0.05" 
                            title={PROMPT_DESCRIPTIONS.COEFFICIENT}
                            value={decayRate}
                            disabled={appState === AppState.PROCESSING}
                            onChange={(e) => {
                                setDecayRate(parseFloat(e.target.value));
                                playSliderSound();
                            }}
                            className="disabled:cursor-not-allowed"
                        />
                        </div>
                    </div>

                    <div className="space-y-2 pt-4 border-t border-[#00ffd5]/20">
                        <div className="flex justify-between items-center pb-2">
                            <label className="text-base tracking-[0.2em] text-[#e5e5e5] font-bold uppercase">Style Tokens</label>
                            
                            <div 
                                title={PROMPT_DESCRIPTIONS.OVERRIDE}
                                className={`flex items-center gap-2 group ${appState === AppState.PROCESSING ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                onClick={() => {
                                    if (appState === AppState.PROCESSING) return;
                                    playAudio('click');
                                    const newValue = !overrideCoreDirective;
                                    setOverrideCoreDirective(newValue);
                                    if (newValue) {
                                        setCustomPrompt(prev => prev ? `${BASE_ROT_PROMPT} ${prev}` : BASE_ROT_PROMPT);
                                        addLog("CORE_DIRECTIVE_OVERRIDE_ENGAGED", "warning");
                                    } else {
                                        setCustomPrompt('');
                                        addLog("CORE_DIRECTIVE_RESTORED", "info");
                                    }
                                }}
                            >
                                <div className={`w-3 h-3 border transition-all ${overrideCoreDirective ? 'bg-amber-500 border-amber-500 shadow-[0_0_10px_#f59e0b]' : 'border-amber-500/50'}`}></div>
                                <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${overrideCoreDirective ? 'text-amber-500' : 'text-amber-500/50 group-hover:text-amber-500'}`}>
                                    System Prompt Override
                                </span>
                            </div>
                        </div>

                        {overrideCoreDirective ? (
                            <textarea 
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="ENTER_NEW_DIRECTIVE..."
                            disabled={appState === AppState.PROCESSING}
                            className="w-full bg-black border border-amber-500 text-amber-500 p-3 text-sm font-mono focus:outline-none focus:shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all placeholder-amber-500/30 h-32 resize-none disabled:cursor-not-allowed"
                            />
                        ) : (
                            <input 
                            type="text"
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="e.g. 'Melting wax texture'..."
                            title={PROMPT_DESCRIPTIONS.SIGNAL_INJECTION}
                            disabled={appState === AppState.PROCESSING}
                            className="w-full bg-black border border-[#00ffd5]/50 text-[#00ffd5] p-3 text-sm font-mono focus:outline-none focus:border-[#ff007f] focus:shadow-[0_0_10px_rgba(255,0,127,0.3)] transition-all placeholder-[#00ffd5]/30 disabled:cursor-not-allowed"
                            />
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 pt-4 border-t border-[#00ffd5]/20">
                        <Checkbox label="Signal Degradation (Bitcrush)" checked={inputBitcrush} onChange={setInputBitcrush} colorClass="magenta" tooltip={PROMPT_DESCRIPTIONS.BITCRUSH} />
                        <Checkbox label="Chromatic Aberration" checked={addChromaticAberration} onChange={setAddChromaticAberration} colorClass="purple" tooltip={PROMPT_DESCRIPTIONS.CHROMATIC_ABERRATION} />
                        <Checkbox label="JPEG Artifacts" checked={addJpegArtifacts} onChange={setAddJpegArtifacts} colorClass="purple" tooltip={PROMPT_DESCRIPTIONS.JPEG_ARTIFACTS} />
                        <Checkbox label="Scanline Ghosting" checked={addScanlines} onChange={setAddScanlines} colorClass="purple" tooltip={PROMPT_DESCRIPTIONS.SCANLINE_GHOSTING} />
                        <Checkbox label="Datamosh Glitching" checked={addDataMoshing} onChange={setAddDataMoshing} colorClass="purple" tooltip={PROMPT_DESCRIPTIONS.DATAMOSH_GLITCHING} />
                        <Checkbox label="VHS Distortion" checked={addVhsDistortion} onChange={setAddVhsDistortion} colorClass="purple" tooltip={PROMPT_DESCRIPTIONS.VHS_DISTORTION} />
                    </div>
                </div>
            )}
          </div>
        </div>

        <div className="relative h-[500px] lg:h-full w-full">
            <div className="absolute inset-0 border border-[#00ffd5] flex flex-col bg-black overflow-hidden">
                <div className="bg-[#00ffd5] text-black px-3 py-2 text-xs font-bold flex justify-between items-center tracking-[0.2em] uppercase shrink-0">
                    <span>Debug Console / Logs</span>
                    <span className="opacity-70 font-mono">{decayService.current.getSelectedModel().shortLabel.toUpperCase()}</span>
                </div>
                <div 
                    ref={terminalRef}
                    className="flex-grow p-5 overflow-y-auto font-mono text-sm space-y-2 scrollbar-hide"
                >
                    {logs.length === 0 && (
                    <p className="opacity-20 italic">Awaiting data stream initiation...</p>
                    )}
                    {logs.map((log) => {
                    const isLong = log.message.length > 120;
                    return (
                        <div key={log.id} className="flex gap-3 items-start leading-tight">
                        <span className="opacity-30 text-xs whitespace-nowrap mt-0.5">{log.timestamp}</span>
                        <div className={`min-w-0 flex-1
                            ${log.type === 'error' ? 'text-[#ff007f]' : 
                            log.type === 'success' ? 'text-[#00ffd5]' : 
                            log.type === 'warning' ? 'text-amber-400' : 
                            'text-[#00ffd5]/80'}
                        `}>
                            {isLong ? (
                            <details className="group">
                                <summary className="cursor-pointer hover:brightness-125 outline-none list-none [&::-webkit-details-marker]:hidden">
                                <span className="break-all">{log.message.substring(0, 80)}</span>
                                <span className="opacity-50 ml-2 text-xs font-bold tracking-widest bg-white/10 px-1 py-0.5 rounded uppercase group-open:hidden">[EXPAND]</span>
                                <span className="opacity-50 ml-2 text-xs font-bold tracking-widest bg-white/10 px-1 py-0.5 rounded uppercase hidden group-open:inline-block">[COLLAPSE]</span>
                                </summary>
                                <div className="mt-2 p-2 bg-white/5 border-l-2 border-current font-mono text-sm break-all whitespace-pre-wrap select-text">
                                {log.message}
                                </div>
                            </details>
                            ) : (
                            <span className="break-all">{log.message}</span>
                            )}
                        </div>
                        </div>
                    );
                    })}
                    {appState === AppState.PROCESSING && (
                    <div className="animate-pulse inline-block w-2.5 h-4 bg-[#ff007f] ml-2"></div>
                    )}
                </div>

                {(currentFrame > 0 || appState !== AppState.IDLE) && (
                    <div className="p-4 border-t border-[#00ffd5] bg-black flex flex-col gap-3 shrink-0">
                        {currentFrame > 0 && (
                            <button 
                                onClick={() => { setShowExportModal(true); playAudio('click'); }}
                                disabled={appState === AppState.PROCESSING}
                                title="Open the full suite of export tools for the current frame."
                                className="text-sm border border-[#00ffd5] p-3 text-[#00ffd5] hover:bg-[#00ffd5] hover:text-black transition-all font-bold tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                [ OPEN EXPORT MENU ]
                            </button>
                        )}
                        <button 
                        onClick={handleReset}
                        title="WARNING: Permanently deletes current session and images."
                        className={`text-sm border p-3 transition-all font-bold tracking-widest uppercase
                            ${resetArmed 
                                ? 'border-[#ff007f] bg-[#ff007f] text-black shadow-[0_0_25px_#ff007f] animate-magenta-flicker font-black'
                                : 'border-[#ff007f] text-[#ff007f] hover:bg-[#ff007f] hover:text-black hover:shadow-[0_0_15px_rgba(255,0,127,0.4)]'
                            }
                        `}
                        >
                        {resetArmed ? ":: CONFIRM SYSTEM WIPE // PURGE ::" : "Reset System"}
                        </button>
                    </div>
                )}
            </div>
        </div>
      </main>
      
      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center">
            <div className="relative w-full max-w-2xl aspect-square bg-black border border-[#00ffd5] shadow-[0_0_30px_rgba(0,255,213,0.3)]">
                {/* Camera Feed or Error */}
                {cameraError ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
                        <p className="text-[#ff007f] font-bold tracking-widest text-center px-4 animate-pulse">
                            OPTICAL SENSOR MALFUNCTION<br/>
                            <span className="text-xs opacity-70">PERMISSION DENIED BY USER AGENT</span>
                        </p>
                    </div>
                ) : (
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                    />
                )}
                
                {/* Overlay UI */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Corners */}
                    <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-[#ff007f]"></div>
                    <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-[#ff007f]"></div>
                    <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-[#ff007f]"></div>
                    <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-[#ff007f]"></div>
                    
                    {/* Crosshair */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 border border-[#00ffd5]/50"></div>
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-[#00ffd5]/20"></div>
                    <div className="absolute top-0 left-1/2 h-full w-[1px] bg-[#00ffd5]/20"></div>

                    {/* Text Info */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[#00ffd5] text-xs font-bold tracking-widest animate-pulse">
                        REC :: LIVE_FEED
                    </div>
                </div>

                {/* Controls */}
                <div className="absolute bottom-0 left-0 w-full bg-black/80 p-4 border-t border-[#00ffd5] flex justify-between items-center z-10">
                    <button 
                        onClick={stopCamera}
                        className="text-[#ff007f] font-bold text-sm tracking-widest hover:text-white transition-colors"
                        title="Close camera interface"
                    >
                        [ CANCEL ]
                    </button>
                    {!cameraError && (
                        <button 
                            onClick={capturePhoto}
                            className="w-16 h-16 rounded-full border-2 border-[#00ffd5] flex items-center justify-center group hover:bg-[#00ffd5]/20 transition-all"
                            title="Capture Photo"
                        >
                            <div className="w-12 h-12 bg-[#00ffd5] rounded-full group-hover:scale-90 transition-transform"></div>
                        </button>
                    )}
                    <div className="text-[#e5e5e5] font-mono text-xs w-16 text-right">
                        512x512
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Unified Export Modal */}
      {showExportModal && workingImageUrl && (
        <div 
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => { setShowExportModal(false); setShowSocialPush(false); playAudio('click'); }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="max-w-5xl w-full border border-[#00ffd5] p-1 bg-black shadow-[0_0_50px_rgba(0,255,213,0.1)] relative overflow-hidden transition-all duration-500"
          >
            
            {/* Social Push Overlay */}
            {showSocialPush && (
                <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-500">
                    <div className="absolute inset-0 pointer-events-none border-[4px] border-[#7a00ff] animate-pulse"></div>
                    <div className="text-center space-y-6 max-w-lg">
                        <div className="space-y-2">
                             <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-[#00ffd5] glitch-text uppercase">
                                SEQUENCE<br/>FINALIZED
                             </h2>
                             <div className="h-px w-full bg-[#7a00ff]/50"></div>
                             <p className="text-[#00ffd5] font-mono text-sm md:text-base tracking-widest">
                                 EXPORT COMPLETED.
                                 <br/>INITIALIZE UPLINK WITH THE ARCHITECT?
                             </p>
                        </div>
                        
                        <a 
                            href="https://x.com/SummitSatoshi" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block w-full bg-[#7a00ff] text-white p-5 text-xl font-bold tracking-[0.2em] uppercase hover:bg-white hover:text-[#7a00ff] transition-all hover:shadow-[0_0_30px_rgba(122,0,255,0.6)] border border-transparent hover:border-[#7a00ff]"
                            onClick={() => playAudio('success')}
                        >
                            ESTABLISH_LINK [@SummitSatoshi]
                        </a>

                        <button 
                            onClick={() => { setShowSocialPush(false); playAudio('click'); }}
                            className="text-[#e5e5e5] text-xs font-mono tracking-widest hover:text-[#ff007f] transition-colors border-b border-transparent hover:border-[#ff007f]"
                        >
                            [ RETURN_TO_TERMINAL ]
                        </button>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center bg-[#00ffd5] text-black px-4 py-2 text-sm font-bold uppercase select-none">
              <span className="tracking-[0.3em] flex items-center gap-2">
                  <span className="w-2 h-2 bg-black animate-pulse"></span>
                  {appState === AppState.COMPLETED ? "SEQUENCE FINALIZED" : "EXPORT OPTIONS // PAUSED"}
              </span>
              <button 
                onClick={() => { setShowExportModal(false); setShowSocialPush(false); playAudio('click'); }} 
                className="hover:bg-black hover:text-[#00ffd5] px-2 transition-colors"
                title="Close Modal"
              >
                  [CLOSE]
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-black">
                {/* Left Col: Preview */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs text-[#00ffd5] font-bold tracking-widest uppercase">
                        Preview Monitor
                    </div>
                    <div className="relative aspect-square border border-[#00ffd5]/20 bg-[#111] overflow-hidden group flex flex-col justify-center">
                        <img 
                            src={workingImageUrl} 
                            alt="Export Artifact" 
                            className="w-full h-full object-contain z-10 relative"
                        />
                        {/* Information Overlays */}
                        <div className="absolute top-0 left-0 w-full p-2 flex justify-between items-start z-20 pointer-events-none">
                             <div className="bg-black/70 border border-[#00ffd5]/50 px-2 py-1 text-[10px] text-[#00ffd5] font-mono">
                                 FRAME_INDEX :: {String(viewingFrame).padStart(2, '0')}
                             </div>
                             <div className="bg-black/70 border border-[#00ffd5]/50 px-2 py-1 text-[10px] text-[#00ffd5] font-mono">
                                 DIM :: 512x512
                             </div>
                        </div>
                        <div className="absolute bottom-0 left-0 w-full p-2 flex justify-between items-end z-20 pointer-events-none">
                             <div className="bg-black/70 border border-[#ff007f]/50 px-2 py-1 text-[10px] text-[#ff007f] font-mono">
                                 TYPE :: STATIC_PNG_PREVIEW
                             </div>
                        </div>
                    </div>

                    {currentFrame > 0 && (
                        <div className="flex gap-2 items-center border border-[#00ffd5]/30 bg-black/50 p-2">
                            <span className="text-[10px] font-mono text-[#e5e5e5] whitespace-nowrap">SCAN:</span>
                            <input 
                                type="range"
                                min="0"
                                max={currentFrame}
                                value={viewingFrame}
                                onChange={handleTimelineScrub}
                                title="Drag to view frame history"
                                className="flex-grow accent-[#00ffd5] h-1 cursor-pointer bg-gray-800 appearance-none rounded-none"
                            />
                            <span className="text-[10px] font-mono text-[#00ffd5] w-6 text-right">{viewingFrame}</span>
                            <button 
                                onClick={downloadCurrentImage}
                                title="Download currently displayed frame"
                                className="ml-1 border border-[#00ffd5] p-1 text-[#00ffd5] hover:bg-[#00ffd5] hover:text-black text-[10px] transition-colors"
                            >
                                💾
                            </button>
                        </div>
                    )}

                     <p className="text-[10px] text-[#e5e5e5]/50 font-mono text-center">
                        Displaying Frame {viewingFrame} of {TOTAL_FRAMES}
                     </p>
                </div>

                {/* Right Col: Output Options */}
                <div className="flex flex-col gap-4">

                    {/* Block 1: Static Images */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-baseline border-b border-[#00ffd5]/20 pb-1">
                            <span className="text-xs text-[#00ffd5] font-bold tracking-widest uppercase">Static Output (.PNG)</span>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <button 
                                onClick={downloadCurrentImage}
                                className={`flex-1 border border-[#00ffd5] p-3 text-left hover:bg-[#00ffd5] hover:text-black transition-all group relative overflow-hidden ${shouldGlimmerSave ? 'animate-glimmer' : ''}`}
                                title="Download the displayed frame as a high-quality PNG."
                            >
                                <div className="relative z-10">
                                    <div className="text-sm font-bold tracking-widest uppercase">Save Current Frame</div>
                                    <div className="text-[10px] font-mono opacity-70 mt-1">SINGLE IMAGE // HIGH RES</div>
                                </div>
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={() => exportComparison('horizontal')}
                                    className="flex-1 border border-[#ff007f] p-3 text-left hover:bg-[#ff007f] hover:text-white transition-all text-[#ff007f] flex flex-col items-center justify-center gap-1 group"
                                    title="Create a side-by-side comparison image."
                                >
                                     <div className="flex gap-1 mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <div className="w-4 h-5 border border-current bg-current/10"></div>
                                        <div className="w-4 h-5 border border-current bg-current/40"></div>
                                     </div>
                                     <div className="text-[10px] font-bold tracking-widest uppercase">Compare (H)</div>
                                     <div className="text-[8px] font-mono opacity-50">SRC | GEN</div>
                                </button>
                                <button 
                                    onClick={() => exportComparison('vertical')}
                                    className="flex-1 border border-[#ff007f] p-3 text-left hover:bg-[#ff007f] hover:text-white transition-all text-[#ff007f] flex flex-col items-center justify-center gap-1 group"
                                    title="Create a top-bottom comparison image."
                                >
                                     <div className="flex flex-col gap-1 mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <div className="w-6 h-3 border border-current bg-current/10"></div>
                                        <div className="w-6 h-3 border border-current bg-current/40"></div>
                                     </div>
                                     <div className="text-[10px] font-bold tracking-widest uppercase">Compare (V)</div>
                                     <div className="text-[8px] font-mono opacity-50">SRC / GEN</div>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Block 2: Animation */}
                    <div className="space-y-2 pt-2 border-t border-[#00ffd5]/10">
                         <div className="flex justify-between items-baseline border-b border-[#7a00ff]/20 pb-1">
                            <span className="text-xs text-[#7a00ff] font-bold tracking-widest uppercase">Animated Output (.GIF)</span>
                        </div>
                        <button 
                            onClick={exportGif}
                            disabled={isExporting}
                            className="w-full border border-[#7a00ff] p-3 text-left hover:bg-[#7a00ff] hover:text-white transition-all text-[#e5e5e5] disabled:opacity-50 group disabled:cursor-not-allowed"
                            title="Compile the entire sequence of images into a GIF animation."
                        >
                             <div className="text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                                 Compile Entire Animation Sequence
                                 {isExporting && <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>}
                             </div>
                             <div className="text-[10px] font-mono opacity-70 mt-1 flex justify-between items-center">
                                 <span>FRAMES: 0-{currentFrame} (FULL SEQUENCE // {currentFrame + 1} FRAMES) // LOOP</span>
                                 <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                     <span>DELAY: {gifDelay}ms</span>
                                     <input 
                                        type="range" 
                                        min="20" 
                                        max="500" 
                                        step="10" 
                                        value={gifDelay}
                                        onChange={(e) => {
                                            setGifDelay(parseInt(e.target.value));
                                            playSliderSound();
                                        }}
                                        className="w-20 h-1 accent-white"
                                     />
                                 </div>
                             </div>
                        </button>
                    </div>

                </div>
            </div>
            
            {/* Footer */}
            <div className="bg-black border-t border-[#00ffd5] p-2 text-center">
                 <p className="text-[10px] text-[#00ffd5]/50 tracking-[0.2em] uppercase">DECAY_CORP_EXPORT_WIZARD_v9.0</p>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto py-6 border-t border-[#00ffd5]/20 flex justify-between items-center shrink-0">
        <a 
          href="https://x.com/SummitSatoshi" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-[#00ffd5] hover:text-[#ff007f] hover:shadow-[0_0_10px_rgba(255,0,127,0.5)] uppercase tracking-[0.2em] transition-all flex items-center gap-2 group border-b border-transparent hover:border-[#ff007f] pb-1"
        >
            Made w. <span className="text-[#7a00ff] drop-shadow-[0_0_5px_rgba(122,0,255,0.5)] animate-pulse">💜</span> by J.
        </a>
        
        <div className="flex items-center gap-4">
             <button 
                onClick={handleMuteToggle}
                className="border border-[#00ffd5]/30 p-2 hover:bg-[#00ffd5] hover:text-black transition-all text-[#00ffd5] group"
                title={isMuted ? "Unmute Audio" : "Mute Audio"}
            >
                {isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                        <path d="M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                        <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                )}
            </button>

            <button 
                onClick={() => { playAudio('click'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="border border-[#00ffd5]/30 p-2 hover:bg-[#00ffd5] hover:text-black transition-all text-[#00ffd5] group"
                title="SCROLL_TO_TOP"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" className="group-hover:animate-bounce">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
            </button>
        </div>
      </footer>
    </div>
  );
};

export default App;