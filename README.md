# Forest multiplayer

From this directory:

```sh
npm install
npm run dev
```

Open the exact address printed by the server, normally **http://localhost:5174/**. If a Python server or another process occupies that port, the game automatically tries the next available port. You can explicitly use port 5175 with `npm run dev -- --port 5175`. Enter a unique display name, choose **Tarin** or **Amy**, and join. Open a second browser/tab with another name to play together. Both characters can be selected by multiple players.

For devices on the same Wi-Fi, open **http://<server-computer-LAN-IP>:5174/** on each device. All browsers must connect to the same Node server. HTTP and WebSockets share this port; HTTPS deployments automatically use WSS. A Python static server cannot run multiplayer.

## Controls

The game fills the window. The top-left Menu contains controls, the connected-player list, Leave / change character, pause, map, and seed settings. The menu and map start closed.

- WASD / arrows: walk
- Shift: run
- P: pause your movement
- M: toggle the minimap
- Escape / click the world: close the menu
- Touch devices: drag the left thumb joystick to move; hold the right Sprint button to run. Joystick deflection controls walking speed, and both touches work together. Controls reset on touch cancellation, menu, pause, disconnect, and screen rotation.

Opening the menu, pausing, or switching windows stops your character. Other players and creatures continue moving. Leave / change character returns to the join screen.

## Shared world

One shared 144×144 forest has five connected villages, cottages, wells, fences, and wandering creatures. The server advances player movement and NPC AI at 20 Hz and broadcasts snapshots at 10 Hz. Clients interpolate positions and display names, character choices, facing, and walking frames in real time. Movement is collision checked on the server; stale inputs stop automatically. This remains a prototype without combat or building interiors.

The first connected player controls the forest seed. Regeneration changes the world for everyone and resets players to the shared spawn. A disconnected player disappears immediately; automatic reconnect can recover their session and position within 15 seconds. Tab-local session storage also supports a quick refresh/rejoin. Display names are reserved for that 15-second grace period, then released. Leaving explicitly releases the name immediately. No account/password or persistent database is used: restarting the server resets sessions and the world.

Tarin and Amy use their custom standing sprites and two-frame walking cycles. Walking cadence follows distance traveled, running accelerates it, and facing left mirrors the sprite. Assets are bundled in `assets/`. Refresh them with `npm run game:assets` inside `../retro-png-maker/`.

Run `npm test` here for terrain, collision, animation, shared-world behavior, reconnects, and two-client HTTP/WebSocket protocol tests. The WebSocket integration tests use paired in-memory streams rather than binding a port.
# tarnkie-society

## Hugs

Move within 56 world pixels of another player, then press **H** or tap the contextual **Hug** button. The recipient can tap **Accept**/**Deny**, or press **E**/**Q** (Escape also denies). No hug starts without the recipient accepting. Requests expire after 10 seconds, moving apart, disconnecting, or changing the world. Only one pending/active hug per player is allowed, with a short request cooldown.

Acceptance safely brings both players together, freezes movement for 2.8 seconds, and shows Tarin/Amy hug poses with floating pixel hearts to every player. Reduced-motion settings use stationary hearts. The server checks distance, clear space, recipient identity, expiry, and consent.

Tarin uses `tarin-hug-40x40.json`; Amy uses a newly authored `Amy-hug-16x16.json` derived from her custom standing sprite. Both are bundled in `assets/actors.json` by the editor's `game:assets` command.

## Chat

Tap the speech-bubble icon in the top-right corner, or press **Enter** / **C**, to open chat. Type up to 140 characters and press Enter/Send, or click a quick message such as “Hi!”, “Follow me!”, or “Want a hug?”. Escape or the close button returns to the game. Movement and touch controls stop while the composer is open.

Messages appear in wrapping speech bubbles above the sender for six seconds and synchronize over WebSockets. Each player's newest message replaces their previous bubble; there is no persistent chat history. The server validates messages and applies an 800 ms cooldown per sender. Speech clears on disconnect or world regeneration. Quick messages and typed messages share the same delivery behavior.
