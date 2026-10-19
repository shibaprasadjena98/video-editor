# Cutline

Cutline is a browser-based video editor. Imported media stays in the browser; no upload or server-side processing is used.

## Run

Open `index.html` directly for editing, or serve this folder locally to enable microphone recording:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy with Docker

Build and start the static web server:

```powershell
docker compose up --build -d
```

Open `http://localhost:8080`. To stop it:

```powershell
docker compose down
```

For public deployment, point a domain to the Docker host and put an HTTPS-enabled reverse proxy (such as Caddy, Traefik, or Nginx Proxy Manager) in front of this container. Microphone recording requires HTTPS outside localhost. Video editing and rendering still run in each visitor's browser; the container only serves the static app.

## Edit and export

- Import one or more videos, choose a source, set its in/out points, and add it to the timeline. Add the same source more than once to assemble multiple sections.
- Select timeline clips to change trim points, playback speed, or clip volume. Use the earlier/later and remove controls to arrange the sequence.
- Choose an output aspect ratio, apply a color filter, and add a title overlay.
- Upload an audio track or record a voiceover. Recording requires microphone permission and HTTPS or localhost.
- Choose MP4 or WebM in the export-format menu. MP4 uses the browser's built-in MP4 encoder and is available only when that browser supports it; WebM is the broader-compatibility option. Export renders in real time, so keep the tab open until rendering finishes. Some browser-generated files omit duration metadata; Cutline attempts to recover their duration by seeking to the end when they are imported again. Export availability depends on browser support for `MediaRecorder` and canvas capture; a current Chrome or Edge browser is recommended.
