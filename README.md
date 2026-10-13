# Digital Decay

**What happens when AI keeps recreating its own last image?**

Digital Decay is a creative experiment in recursive AI image generation. Start with an image, ask Gemini to recreate it, then feed that result back in. Over 69 generations, small changes can accumulate until the image takes on a different character.

[Open the app](https://whatifqu3stion.github.io/digital-decay/) · [Explore the code](services/geminiService.ts) · [Key handling and security review](docs/security-review.md)

## An example

![Source image on the left; frame 69 on the right, with the same broad composition transformed into bold outlines and patterned surfaces.](docs/examples/decay-comparison-frame-69.png)

<p align="center">
  <em>Before and after: the source image (left) and generation 69 (right). The composition remains recognizable as realistic textures become bold outlines and patterns.</em>
</p>

<p align="center">
  <img src="docs/examples/decay_animation-optimize.gif" width="300" alt="Animation showing the source image changing through 69 successive AI generations.">
  <br>
  <em>The transformation in motion: the source image followed by 69 AI generations, each using the previous image as its starting point.</em>
</p>

## The exploration

Copying a digital file can preserve every bit. Asking an image model to recreate it is a different operation: the model generates a new image, and that image can introduce changes. Here, each change becomes part of the next input. The model sees its latest output, rather than returning to the original each time.

Think of a visual game of telephone. What survives repeated retelling? What gets simplified, exaggerated or replaced? Can the composition remain familiar while the style changes completely?

The idea echoes Alvin Lucier's [*I am sitting in a room*](https://www.moma.org/explore/inside_out/2015/01/20/collecting-alvin-luciers-i-am-sitting-in-a-room/), in which recorded speech is repeatedly played and recorded again in the same room. Digital Decay explores feedback through image generation instead of sound and room acoustics.

“Decay” is a creative framing. Some results become more orderly or decorative. The images alone cannot establish what is happening inside the model, reveal particular training examples, or prove that it converges toward a stable destination. The 69-generation endpoint is a limit set by the app, not a scientific threshold.

## Design decisions

The design challenge is to make an unfamiliar process inviting enough to try and clear enough to investigate. The retro terminal gives the experiment a playful identity; the controls need to help people understand what they are changing.

<table>
<tr>
<td align="center" valign="top" width="33%"><a href="docs/ux/workspace.jpg"><img src="docs/ux/workspace.jpg" width="240" alt="Source image loaded in the comparison workspace, with fit, crop and start controls visible and advanced settings collapsed."></a></td>
<td align="center" valign="top" width="33%"><a href="docs/ux/controls.jpg"><img src="docs/ux/controls.jpg" width="240" alt="Expanded advanced settings showing entropy, custom instructions and optional visual effects."></a></td>
<td align="center" valign="top" width="33%"><a href="docs/ux/key-setup.jpg"><img src="docs/ux/key-setup.jpg" width="240" alt="Key setup dialog with model choice, billing guidance and an unchecked remember-key option."></a></td>
</tr>
<tr>
<td valign="top"><strong>Keep the first step small.</strong> Load and frame an image before opening advanced settings. The comparison divider keeps the source available as a visual reference. Shown here before generation.</td>
<td valign="top"><strong>Reveal depth when wanted.</strong> Temperature, custom instructions and effects sit behind one expandable panel, giving curious users room to experiment without putting every choice in the starting view.</td>
<td valign="top"><strong>Make the commitment visible.</strong> Model choice, billing guidance and key storage sit together. BYOK makes running costs the visitor's responsibility, so setup needs to explain that before generation.</td>
</tr>
</table>

*Screenshots from the live app. Select an image to view it at full size.*

## How it works

1. **Choose an image.** Upload a file or capture one with the camera. Fit it within a square or crop it to fill the square.
2. **Choose how to reinterpret it.** Adjust the controls or add an instruction.
3. **Generate and repeat.** Send the current image and prompt to Gemini. Save the returned image and use it as the next input.
4. **Inspect the changes.** Compare a frame against the source, scrub through the sequence, or halt and resume.
5. **Export.** Save a still, a side-by-side comparison, or a GIF of the available frames.

The default instruction is deliberately simple:

> Preserve the shapes and basic colors of the previous iteration.

That leaves room to explore how much can change while the basic arrangement remains recognizable.

| Control | What it actually changes |
| --- | --- |
| **Entropy** | Maps the slider's 0.5–1.5 range to a model temperature of 0.1–1.9 and changes the prompt from stricter copying to looser interpretation. It is a creative control, not a measurement of entropy or a guaranteed rate of change. |
| **Bitcrush** | Reduces the starting image to 128 × 128 pixels before the first generation. |
| **VHS, JPEG, chromatic aberration and other effects** | Adds requests for those visual styles to the prompt. These are model interpretations, not actual codec corruption or optical processing. |
| **Custom prompt** | Adds an instruction, or replaces the default directive when override is enabled. |

For a more useful comparison, begin separate runs with the same source and change one control at a time. Keep the model and prompt consistent. Even then, generated results can differ between runs.

## Try it

1. Open the [live app](https://whatifqu3stion.github.io/digital-decay/).
2. Connect your own [Gemini API key](https://aistudio.google.com/app/apikey) through the key dialog.
3. Check your project's billing, image quota and [current Google pricing](https://ai.google.dev/gemini-api/docs/pricing). Generation is billed to your account; a full run requests 69 new images, with input and output charges depending on the model.
4. Load an image and start with a short run before committing to the full sequence.

The default is Gemini 3.1 Flash Image. The older 2.5 option is labeled legacy because Google's documentation marks it deprecated. Availability and quotas depend on Google and your project.

## Architecture behind the experience

React and TypeScript manage the interface; Google's GenAI SDK handles image generation. The supporting choices follow the needs of the experiment:

| Need | Implementation and tradeoff |
| --- | --- |
| Inspect the journey, not just the last image | Save frames and session state in IndexedDB, the browser's local database. This supports history inspection without a hosted image store, but browser data can be cleared or evicted. |
| Keep a long run understandable | Space requests out and report progress, cooldowns and errors. Retry errors classified as temporary rate limits; billing and other failures can still stop the sequence. |
| Let people keep their results | Prepare stills, comparisons and GIFs with Canvas and browser workers. Exports avoid a separate rendering service, but large sequences use the visitor's memory and processing power. |
| Share an experiment without funding every visitor's run | On GitHub Pages, send requests directly to Google using the visitor's key. This simplifies hosting but adds key setup and browser-security tradeoffs. Local development instead uses the included Express forwarding server. |

The source plus 69 generations can produce up to 70 frames. Neither deployment route uses a host-funded fallback key.

### API key privacy

Keys are saved for the tab session by default. “Remember on this device” optionally stores one in `localStorage`. Both are readable by JavaScript running on the same origin; they are not encrypted vaults. Other apps on the same GitHub Pages origin share that storage boundary, and the page also loads third-party resources.

Use **Disconnect Key** to clear the app's saved key. Never include a key in a URL, screenshot or commit. Legacy key URLs are no longer accepted; removing a parameter from the address bar cannot undo earlier exposure. Images and prompts used for generation are sent to Google under its service terms.

## Run locally

Use Node.js 20 or newer:

```bash
git clone https://github.com/whatifqu3stion/digital-decay.git
cd digital-decay
npm ci
npm run dev
```

Open `http://localhost:3000`. Enter your key in the app; no `.env` key is needed.

```bash
npm run lint   # TypeScript checks
npm run build  # Static production bundle
npm test       # Key handling regression checks
```

For a fork, choose **Settings → Pages → Source → GitHub Actions**. The included workflow deploys pushes to `main` without a Gemini repository secret.

## License

The code is licensed under [MIT](LICENSE). Example images illustrate the experiment; the code license does not grant rights to third-party likenesses or underlying source material.
