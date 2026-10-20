# Cutline

Cutline is a browser-based video editor. Imported media stays in the browser; no upload or server-side processing is used.

## Run

Open `index.html` directly for editing, or serve this folder locally to enable microphone recording:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy with Docker on your domain

Before starting the containers:

1. In your DNS provider, create an **A record** with name `cutline` and value `34.134.79.147` (the public IP of the Docker host shown in your DNS setup). Do not include `http://` or a port. Remove any conflicting record for the `cutline` subdomain.
2. Allow inbound TCP ports **80 and 443** in the server firewall/cloud firewall. Allow UDP port **443** if you want HTTP/3; it is optional.
3. Make sure these ports are not already in use by another web server or reverse proxy on the host.

Then, from the project folder on the Docker host, start the containers:

```powershell
docker compose up --build -d
```

Open `https://cutline.shibaprasad.online`. Caddy requests and renews the TLS certificate automatically, so the domain must already resolve to the server and ports 80/443 must be reachable from the internet. The site is also available over HTTP and redirects to HTTPS.

To stop the containers:

```powershell
docker compose down
```

The Caddy data volume stores TLS certificates across container restarts. Microphone recording requires HTTPS outside localhost. Video editing and rendering still run in each visitor's browser; the containers only serve the static app and terminate HTTPS.

## Edit and export

- Import one or more videos, choose a source, set its in/out points, and add it to the timeline. Add the same source more than once to assemble multiple sections.
- Select timeline clips to change trim points, playback speed, or clip volume. Use the earlier/later and remove controls to arrange the sequence.
- Choose an output aspect ratio, apply a color filter, and add a title overlay.
- Upload an audio track or record a voiceover. Recording requires microphone permission and HTTPS or localhost.
- Choose MP4 or WebM in the export-format menu. MP4 uses the browser's built-in MP4 encoder and is available only when that browser supports it; WebM is the broader-compatibility option. Export renders in real time, so keep the tab open until rendering finishes. Some browser-generated files omit duration metadata; Cutline attempts to recover their duration by seeking to the end when they are imported again. Export availability depends on browser support for `MediaRecorder` and canvas capture; a current Chrome or Edge browser is recommended.
