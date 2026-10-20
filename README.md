# Cutline

Cutline is a browser-based video editor. Imported media stays in the browser; no upload or server-side processing is used.

## Run

Run the development server to test the app locally:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`). The build output can also be served with any static web server:

```powershell
npm run build
```

## Deploy with Docker behind an existing website

The app container binds only to `127.0.0.1:8080`, so it does not take over public HTTP/HTTPS ports. If your main website already listens on ports 80/443, configure its existing reverse proxy to forward `cutline.shibaprasad.online` to this local port.

Start the app from the project folder on the Docker host:

```powershell
docker compose up --build -d
```

For an existing **Caddy** server, add the site block from `Caddyfile` to its Caddy configuration and reload Caddy. For an existing **Nginx** server, add a virtual host like:

```nginx
server {
    listen 80;
    server_name cutline.shibaprasad.online;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name cutline.shibaprasad.online;

    # Use the TLS certificate and key for this hostname.
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ensure the `cutline` DNS record points to the host and that the existing proxy has a valid TLS certificate for `cutline.shibaprasad.online`. Then open `https://cutline.shibaprasad.online`.

To stop the app container:

```powershell
docker compose down
```

Microphone recording requires HTTPS outside localhost. Video editing and rendering still run in each visitor's browser; Docker only serves the static app.

## Edit and export

- Import one or more videos, choose a source, set its in/out points, and add it to the timeline. Add the same source more than once to assemble multiple sections.
- Select timeline clips to change trim points, playback speed, or clip volume. Use the earlier/later and remove controls to arrange the sequence.
- Choose an output aspect ratio, apply a color filter, and add a title overlay.
- Upload an audio track or record a voiceover. Recording requires microphone permission and HTTPS or localhost.
- Choose MP4 or WebM in the export-format menu. Export renders in real time in your browser, then finalizes the recorded file locally so media players can read its duration and seek accurately. Finalization uses Mediabunny and may take additional time for long videos. Export availability depends on browser support for `MediaRecorder`, canvas capture, and the selected output format; a current Chrome or Edge browser is recommended.
