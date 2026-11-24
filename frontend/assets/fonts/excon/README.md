# Excon font (not included in this repository)

The app's typeface is **Excon** by Indian Type Foundry, which is free on Fontshare under the ITF Free Font License. That license allows self-hosting on your own website but **forbids redistributing the font files through repositories**, so they are not committed here.

**To install it (1 minute):**
1. Download Excon from https://www.fontshare.com/fonts/excon
2. From the download's `Fonts/WEB/fonts/` folder, copy these two files into **this folder**:
   - `Excon-Variable.woff2`
   - `Excon-Variable.woff`
3. Rebuild or restart (`docker compose up -d --build`, or `run.bat`).

Without these files the app still works fully. It falls back to the system font (`system-ui`).
