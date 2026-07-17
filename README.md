# Gold Vein Mask Tool

A first browser-based prototype for processing abstract marble and alcohol-ink images. It detects gold-toned / metallic-gold areas and turns them into a downloadable black-and-white PNG mask: detected gold pixels become solid black and all other pixels become pure white.

## Prototype features

- Upload one JPG or PNG image from your computer.
- Preview the original image and generated mask side by side.
- Tune **Gold color sensitivity** to include fewer or more warm metallic tones.
- Tune **Minimum fragment size** to remove tiny isolated detections.
- Download the generated mask as a PNG.

Background reconstruction is intentionally not implemented in this prototype.

## Launch locally

This project is a static web app with no required build step.

```bash
npm start
```

Then open <http://localhost:4173> in your browser.

If you prefer not to use npm, you can launch the same static server directly:

```bash
python3 -m http.server 4173
```


## Public deployment

This repository is configured for GitHub Pages through `.github/workflows/pages.yml`. To publish the static preview:

1. In the GitHub repository, open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push or merge changes to `main`, or run the **Deploy static site to GitHub Pages** workflow manually.
4. Open the Pages URL shown in the workflow summary. It typically uses the format `https://<owner>.github.io/gold-vein-tool/`.

## Verify the prototype

Run the unit tests for the gold detection and mask-generation logic:

```bash
npm test
```

Manual browser check:

1. Start the app with `npm start`.
2. Open <http://localhost:4173>.
3. Upload a JPG or PNG marble / alcohol-ink image.
4. Confirm the original preview and black-and-white mask appear side by side.
5. Move the sensitivity and minimum-fragment controls and confirm the mask updates.
6. Click **Download mask PNG** and confirm a PNG file is saved.
