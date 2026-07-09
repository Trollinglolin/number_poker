# Hosting a Multiplayer Web Game on Vercel for Discord Activities

This guide covers preparing your code, deploying to Vercel, configuring your custom domain, and integrating it as a Discord Activity.

---

## Phase 1: Code Architecture for Vercel and WebSockets

Vercel natively supports WebSockets. However, because Vercel automatically scales your backend dynamically across server instances, you must organize your code so Vercel can interpret your backend as serverless functions. 

### 1. Project Directory Structure
Vercel expects your backend server-side logic to live within an `api/` directory at the root of your project. Ensure your directory structure matches this format:

```text
my-game-project/
├── api/
│   └── ws.js          # Main backend server and WebSocket logic
├── public/            # Static assets (HTML, CSS, JS client)
│   ├── index.html
│   └── game.js
├── package.json
└── vercel.json        # Optional configurations
```

### 2. Update Backend Code (`api/ws.js`)
Instead of managing your own port listening via `app.listen(3000)`, your script must export an HTTP server instance. Vercel routes incoming traffic directly into this exported instance.

```javascript
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        // Broadcast the data to all connected clients
        wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(message);
            }
        });
    });
});

// Vercel handles routing traffic into the server instance automatically
export default server;
```

### 3. Update Client-Side Code (`public/game.js`)
Ensure your client-side code dynamically points to the current active host rather than standard local host configurations:

```javascript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
```

---

## Phase 2: Deploy to Vercel and Attach Custom Domain

### 1. Push to GitHub
Initialize your Git repository, commit your project files, and push them to a repository on GitHub.

### 2. Import into Vercel
1. Log into your Vercel Dashboard using your GitHub credentials.
2. Click "Add New" and select "Project".
3. Import your game's repository.
4. Leave the default build settings as they are and click "Deploy". Vercel will host your static files and map your `api/` endpoints.

### 3. Link Your Custom Domain
1. In your Vercel Project Dashboard, navigate to "Settings" > "Domains".
2. Enter your custom domain name (e.g., `yourdomain.com`) and click "Add".
3. Vercel will display the required DNS configuration details (either an A Record or a CNAME Record).

### 4. Configure Your Domain Registrar
1. Log into the management portal of the domain registrar where you purchased your domain.
2. Navigate to the DNS Management or Nameserver settings section.
3. Add the record provided by Vercel:
   - For root domains (`yourdomain.com`), add an **A Record** pointing to the IP address listed by Vercel.
   - For subdomains (`game.yourdomain.com`), add a **CNAME Record** pointing to `cname.vercel-dns.com`.
4. Save your changes. SSL/TLS certificates will automatically generate within a few minutes once DNS propagation finishes.

---

## Phase 3: Connect to Discord Activities

Discord displays embedded applications inside an iframe, routing asset deliveries and backend payloads securely over HTTPS/WSS.

### 1. Enable Activities in the Developer Portal
1. Open the Discord Developer Portal and select your created application.
2. On the left navigation bar, click "Activities" and select "Settings".
3. Turn on the "Enable Activities" toggle.

### 2. Configure URL Mappings
This maps paths requested inside the Discord iframe environment to your real Vercel servers.
1. Scroll down to the "URL Mappings" configuration block.
2. Add a mapping for root asset directories:
   - **Prefix:** `/`
   - **Target:** `yourdomain.com` (Do not include `https://` prefix)
3. Add an explicit mapping rule for your WebSocket endpoint to guarantee connection persistence through Discord proxies:
   - **Prefix:** `/api/ws`
   - **Target:** `yourdomain.com/api/ws`
4. Save changes.

### 3. Configure OAuth2 Installation Settings
1. Go to "Installation" under the App Settings sidebar.
2. Under "Installation Contexts", verify that "User Install" or "Guild Install" is selected so it can be added to voice channels.
3. In the Scopes settings, make sure `activities.write` and `applications.commands` are selected if required by your game architecture.

---

## Phase 4: Launch and Test Your Activity

Because the application is in development, it is only visible to you or assigned testers on your development team.

1. Launch your Discord Desktop Client.
2. Open "User Settings" > "Advanced", and turn on "Developer Mode".
3. Join any Voice Channel in a server or direct message group.
4. Click the "Start an Activity" launcher (the rocket icon button).
5. Locate and click your Application name from the menu.
6. Authorize the application permissions prompt. The game will launch directly within the Discord interface using your Vercel deployment.

---

## Important Architecture Note: State Synchronization

Vercel instances scale down to zero when idle and launch multiple parallel serverless instances when traffic hits. This means Player 1 and Player 2 might hit completely different isolated WebSocket instances and be unable to see each other.

To maintain unified game lobbies across serverless platforms, integrate a central, high-speed data layer:
1. Navigate to your Vercel Project Dashboard, choose the "Storage" tab, and add the "Upstash Redis" integration.
2. Install a Redis adapter plugin inside your node environment (e.g., `@socket.io/redis-adapter` if using Socket.io, or manual Redis pub/sub methods if utilizing raw WebSockets).
3. Update your server instance in `api/ws.js` to broadcast messages globally through the Redis layer so all connected game servers share real-time player coordinates.
