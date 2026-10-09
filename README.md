# 🫠 DIGITAL_DECAY // Recursive Visual Entropy Engine

> *"I am sitting in a neural network, looking at a picture whose likeness I will ask the model to re-imagine again and again, until the original features of the image are completely destroyed, and what remains is the latent resonance of the machine itself."*  
> — Adapted from Alvin Lucier (*I Am Sitting in a Room*, 1969)

[![GitHub Pages Deployment](https://img.shields.io/badge/Deployment-GitHub%20Pages-00ffd5?style=flat-square&logo=github)](https://whatifqu3stion.github.io/digital-decay/)
[![Model](https://img.shields.io/badge/Model-Gemini%202.5%20%2F%203.1%20Flash-ff007f?style=flat-square)](https://ai.google.dev/)
[![Architecture](https://img.shields.io/badge/Architecture-100%25%20Client--Side%20BYOK-00ffd5?style=flat-square)]()
[![Status](https://img.shields.io/badge/Status-Operational-00ffd5?style=flat-square)]()

---

## 👁 The Conceptual Exploration

### 1. Digital Generational Loss & Neural Drift
In analog media, copying a cassette tape, VHS recording, or physical photocopy creates tangible degeneration: tape hiss, magnetic bleed, color skew, and toner artifacts. The degradation is physical, mechanical, and predictable.

In traditional digital computing, copies are mathematically exact ($1:1$, lossless). But **Generative Multimodal Models (LMMs) break this permanence.** 

When an artificial intelligence is asked to observe an image and recreate what it sees, it is **never copying pixels**—it is translating visual input into an internal web of semantic tokens, passing through a probabilistic latent space, and synthesizing a new dream of what it believes was there.

**DIGITAL_DECAY** subjects this process to recursive generational decay:
* **The Machine as an Unreliable Narrator:** When Frame $N$ becomes the input tensor for Frame $N+1$, the model's subtle misinterpretations do not disappear. They become the foundational truth for the next generation.
* **The Attractor States of Machine Memory:** Human faces gradually melt into ancient stone statues, alien masks, or biomechanical visages. Modern cityscapes dissolve into crystalline overgrown ruins or circuitry. These are not random errors—they are the **latent attractor basins** of the foundation model's training data.
* **Why 69 Generations?** The number 69 forms an ouroboros—a recursive feedback loop where the tail of the sequence continually feeds into its mouth, compounding microscopic discrepancies until the subject undergoes total visual metamorphosis into a stabilized **"Hero Artifact."**

---

## ⚙️ Technical Mechanics & Architecture

```
[ Source Image ] (Upload / Optical Sensor)
       │
       ▼
 ┌─────────────┐
 │ Preprocess  │ ──> (FIT / CROP Scaling + Optional 128px Bitcrush)
 └─────────────┘
       │
       ▼
 ┌─────────────┐ <──────────────────────────────────────────┐
 │ Generation  │                                            │
 │   Cycle N   │ ──> Prompt Directives + Entropy + Mutators │
 └─────────────┘                                            │
       │                                                    │
       ▼ (Gemini Image API Call)                            │
 ┌─────────────┐                                            │
 │ Frame N+1   │ ──> Persist to IndexedDB                   │
 └─────────────┘ ──> Update Visual Scrubber & UI            │
       │                                                    │
       ├────[ If N < 69 ] ──────────────────────────────────┘
       │
       ▼ [ If N == 69 ]
 ┌──────────────────────────────────────────────────────────┐
 │ 🏆 HERO ARTIFACT STABILIZED                              │
 │ Export: Hi-Res Still / 69-Frame GIF / Timeline Inspection │
 └──────────────────────────────────────────────────────────┘
```

### 1. The Recursive Loop ($I_{N+1} = \mathcal{M}(I_N, \mathcal{P}, \mathcal{T}, \mathcal{I})$)
1. **Source Latching:** The user supplies a source subject via direct file upload or live camera sensor feed.
2. **Aspect Framing:**
   * **FIT:** Preserves the entire source image with black pillarbox/letterbox borders.
   * **CROP:** Center-crops to a pure $1:1$ square aspect ratio.
3. **Recursive Re-Ingestion:** The output PNG of generation $N$ is converted to a base64 payload and fed into Gemini as the visual prompt for generation $N+1$.
4. **Core Directive:** `"Preserve the shapes and basic colors of the previous iteration."` This tension—forcing the model to hold onto the original image while its inherent stochasticity pulls it elsewhere—is what fuels the visual decay.

### 2. Parametric Entropy Coefficient ($\mathcal{T}$)
The application maps the user-controlled **Entropy** slider directly to Gemini's generative temperature ($0.1$ to $1.9$):
* **Low Entropy ($0.1 - 0.7$):** Strict visual replication. Suppresses creative divergence; the model struggles to reproduce exact details, resulting in painterly vector smoothing and subtle analog drift.
* **Balanced Entropy ($0.8 - 1.2$):** Classic generational decay. Organic structures warp, eyes wander, edges dissolve into surreal geometries over $20 - 40$ frames.
* **High Entropy ($1.3 - 1.9$):** Chaos and rapid mutation. The model aggressively hallucinates new objects, dreamlike textures, and radical color shifts within the first few frames.

### 3. Procedural Degradation Mutators
Users can toggle procedural aesthetic mutators that inject synthetic noise into the prompt directive:
* **Bitcrush (128px):** Downsamples the initial canvas to a blocky $128 \times 128$ grid before feeding to the model, forcing early semantic pixelation.
* **Chromatic Aberration:** Induces R/G/B optical channel misalignment and prism edge fringe.
* **JPEG Compression:** Recreates 8×8 DCT blocking and high-frequency ringing artifacts.
* **Scanline Ghosting:** Simulates phosphor decay, line doubling, and cathode-ray tube bleed.
* **Datamoshing:** Simulates compressed video codec frame dropouts, motion vector tears, and macroblock smears.
* **VHS Distortion:** Introduces tape tracking flutter, luma noise, and magnetic color bleed.

### 4. Sliding-Window Rate Pacer (`SlidingWindowPacer`)
Google enforces rate limits across its image generation endpoints:
* **Adaptive Rolling Window:** The built-in pacer maintains a timestamp queue of the last requests within a 60-second sliding window, pacing calls so you never exceed Google's quota limits.
* **Visual Core Cooling:** If the quota window fills during high-speed runs, the terminal displays an automated countdown (`[ ⏳ COOLING NEURAL CORE: Resuming in 8s... ]`) and smoothly continues.
* **Zero-Abort Resilience:** If Google returns a transient 429 rate limit mid-sequence, the loop pauses, auto-cools, and **automatically retries the exact same frame**, ensuring you never lose your progress or have your session aborted prematurely.

---

## 🔑 API Key & Google Cloud Billing Requirement

To protect hosts from compute charges and enable direct client-side generation, **DIGITAL_DECAY operates on a 100% Bring Your Own Key (BYOK) architecture**:

> **Important Note on Gemini Image Models:**  
> Google allows developers to create Gemini API keys for free in Google AI Studio. However, Google’s backend assigns **0 quota (`limit: 0`)** for native image generation models (`gemini-2.5-flash-image`, `gemini-3.1-flash-image`) unless your AI Studio project has an active **Google Cloud Billing account linked**.  
> * Image generations cost approximately **$0.039 to $0.045 per image** (around ~$2.70 for an entire 69-frame sequence).
> * To unlock your key from `limit: 0`, visit [Google AI Studio Plan Information](https://aistudio.google.com/app/plan_information) and click **"Set up billing"**.

### Privacy & Security Safeguards
* **Device-Only Memory:** Your API key is stored strictly in your browser's private `localStorage` or `sessionStorage`. It is **never** sent to an intermediate database, third-party server, or analytics pipeline.
* **Address Bar Scrubbing:** If you supply a key via URL query parameter (`?gemini_api_key=AIzaSy...`), the app immediately scrubs the key from the browser address bar on boot using `window.history.replaceState` to prevent shoulder-surfing, bookmark leakage, or history persistence.

---

## 🖥 User Interface & Features

* **Interactive Split-Screen Comparator:** Click and drag the glowing scanline divider across the canvas to compare the original Frame $0$ against any decayed generation in real time.
* **History Time-Travel Scrubber:** Scrub through all generated frames with instant cached playback powered by IndexedDB.
* **Animated GIF Export:** Compiles all 69 frames into a downloadable loop directly in the browser via client-side Web Workers.
* **Synthesized Retro Audio Engine:** Web Audio API sound design recreating CRT capacitor hums, stepper motor seek chirps, and vintage BIOS POST confirmations.
* **Emergency Halt & Resume:** Pause the sequence at any generation, adjust entropy or mutators, and resume seamlessly.

---

## 🚀 Live Demo & Deployment

* **Live GitHub Pages URL:**  
  👉 **[https://whatifqu3stion.github.io/digital-decay/](https://whatifqu3stion.github.io/digital-decay/)**

### Deploying Your Own Fork to GitHub Pages
1. Fork or clone this repository.
2. In your repository settings, go to **Settings > Pages**.
3. Under **Build and deployment > Source**, choose **GitHub Actions**.
4. Push any commit to `main`—the workflow (`.github/workflows/deploy.yml`) will automatically build and publish the application.

---

## 🛠 Local Development

```bash
# 1. Clone the repository
git clone https://github.com/whatifqu3stion/digital-decay.git
cd digital-decay

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open `http://localhost:3000` to launch the terminal.

---

## 📜 License
MIT License. Created for creative generative research, digital entropy experimentation, and visual art exploration.
