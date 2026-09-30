# LogoGone 🎨

> Remove any logo from photos and videos — free, private, 4K-ready.
> Runs 100% in your browser. No upload. No server. No signup.

![LogoGone](https://img.shields.io/badge/status-live-22d3a0) ![License](https://img.shields.io/badge/license-MIT-7c5cff) ![Free](https://img.shields.io/badge/price-free-success)

---

## ✨ Features

- 🖼️ **Photo mode** — brush over logo → inpaint → download PNG (original resolution)
- 🎬 **Video mode** — frame-by-frame inpaint → download WebM
- 🎨 **3 brush tools** — Mark, Erase, Size slider (5–120px)
- ↩️ **Undo** — up to 30 steps
- ⚙️ **5 quality presets** — 480p / 720p / 1080p / 4K / Original
- 📊 **Live progress** — frame X/Y, ETA, percentage
- 🔀 **Before / After** toggle
- 🔒 **100% private** — nothing leaves your browser
- 📱 **Mobile responsive** — touch brush works
- 🌐 **Offline capable** — after first load

---

## 🚀 Live Demo

Deploy your own in 2 minutes — see below.

---

## 🛠️ Tech Stack

- **HTML5 + CSS3 + Vanilla JS** — no framework, no build step
- **OpenCV.js 4.8** — inpainting (Telea + Navier-Stokes)
- **MediaRecorder API** — video encoding in browser
- **Canvas API** — pixel-level frame processing

---

## 📦 Local Development

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/logogone.git
cd logogone

# 2. Serve locally (any static server works)
python3 -m http.server 8080
# or
npx serve .

# 3. Open http://localhost:8080