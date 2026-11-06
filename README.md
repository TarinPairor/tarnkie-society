# Forest multiplayer

From this directory:

```sh
npm install
npm run dev
```

Open the exact address printed by the server, normally **http://localhost:5174/**. If a Python server or another process occupies that port, the game automatically tries the next available port. You can explicitly use port 5175 with `npm run dev -- --port 5175`. Enter a unique display name, choose **Tarin** or **Amy**, and join. Open a second browser/tab with another name to play together. Only one connected **Amy** and one connected **Tarin** are allowed at a time across the entire server, including all mine instances. An occupied character cannot be selected from another browser or with another display name. Leaving, disconnecting, or being removed releases that character; reconnecting cannot displace someone who has claimed the slot. Amy never appears as a wandering AI character.

For devices on the same Wi-Fi, open **http://<server-computer-LAN-IP>:5174/** on each device. All browsers must connect to the same Node server. HTTP and WebSockets share this port; HTTPS deployments automatically use WSS. A Python static server cannot run multiplayer.

## Controls

The game fills the window. The top-left Menu contains controls, the connected-player list, Leave / change character, pause, map, and seed settings. The menu and map start closed.

- WASD / arrows: walk
- I: open / close inventory
- Hold left click on cave rock: mine within five blocks
- Shift: run
- P: pause your movement
- M: toggle the minimap
- Escape / click the world: close the menu
- Touch devices: drag the left thumb joystick to move; hold the right Sprint button to run. Tap the backpack to open inventory and aim the right mining joystick in the cave to dig within five blocks. The left joystick still moves independently. Joystick deflection controls walking speed, and both touches work together. Controls reset on touch cancellation, menu, pause, disconnect, and screen rotation.

Opening the menu, pausing, or switching windows stops your character. Other players and creatures continue moving. Leave / change character returns to the join screen.

## Shared world

One shared 144×144 forest has five connected villages, cottages, wells, fences, and wandering creatures. The server advances player movement and NPC AI at 20 Hz and broadcasts snapshots at 10 Hz. Clients interpolate positions and display names, character choices, facing, and walking frames in real time. Movement is collision checked on the server; stale inputs stop automatically. This remains a prototype without combat or building interiors.

Forest regeneration and randomization are temporarily disabled for all players, including the host. The server rejects regeneration requests; the menu controls are read-only. A disconnected player disappears immediately; automatic reconnect can recover their session and position within 15 seconds. Tab-local session storage also supports a quick refresh/rejoin. Display names are reserved for that 15-second grace period, then released. Leaving explicitly releases the name immediately. No account/password is used. Restarting the server resets sessions and the world; character inventories are saved separately.

Tarin and Amy use their custom standing sprites and two-frame walking cycles. Walking cadence follows distance traveled, running accelerates it, and facing follows the sprite's native direction. Tarin's source art faces left, so only rightward facing mirrors it. Assets are bundled in `assets/`. Refresh them with `npm run game:assets` inside `../retro-png-maker/`.

Run `npm test` here for terrain, collision, animation, shared-world behavior, reconnects, and two-client HTTP/WebSocket protocol tests. The WebSocket integration tests use paired in-memory streams rather than binding a port.
# tarnkie-society

## Hugs

Move within 56 world pixels of another player, then press **H** or tap the contextual **Hug** button. The recipient can tap **Accept**/**Deny**, or press **E**/**Q** (Escape also denies). No hug starts without the recipient accepting. Requests expire after 10 seconds, moving apart, disconnecting, or changing the world. Only one pending/active hug per player is allowed, with a short request cooldown.

Acceptance safely brings both players together, freezes movement for 2.8 seconds, and shows Tarin/Amy hug poses with floating pixel hearts to every player. Reduced-motion settings use stationary hearts. The server checks distance, clear space, recipient identity, expiry, and consent.

Tarin uses `tarin-hug-40x40.json`; Amy uses a newly authored `Amy-hug-16x16.json` derived from her custom standing sprite. Both are bundled in `assets/actors.json` by the editor's `game:assets` command.

## Chat

Tap the speech-bubble icon in the top-right corner, or press **Enter** / **C**, to open chat. Type up to 140 characters and press Enter/Send, or click a quick message such as “Hi!”, “Follow me!”, or “Want a hug?”. Escape or the close button returns to the game. Movement and touch controls stop while the composer is open.

Messages appear in wrapping speech bubbles above the sender for six seconds and synchronize over WebSockets. Each player's newest message replaces their previous bubble. The server also retains the latest 50 messages in memory for the corner feed; no chat is saved to a database. The server validates messages and applies an 800 ms cooldown per sender. Speech clears on disconnect or world regeneration. Quick messages and typed messages share the same delivery behavior.

Hug composition places Amy on the left and Tarin on the right at the same baseline, six world pixels apart, independent of who requests. Amy has a right-facing profile hug pose; Tarin uses the supplied left-facing pose. Drawing order is consistent on both clients so the bodies overlap during the embrace.

Creature density is intentionally sparse: two of each normal creature and one of each monster across the entire forest (20 wanderers total). They spawn away from the starting point and at least six tiles apart. Decorative plants, berries, flowers, and mushrooms use a 2.5% spawn chance, reduced from 11%. Forest trees and village structures retain their density.

## Tree cover and transient notices

Trees have opaque 68×90 scaled canopies, about 17% larger than before, and a 10×8 world-pixel trunk collision footprint instead of blocking an entire 32×32 tile. Players can step under foliage, and foreground trees hide sprites naturally. Canopies stay opaque. Only your own client draws your concealed character at 42% opacity over the tree so you can track yourself; other players receive no silhouette overlay for you. Concealed players' name tags, speech bubbles, and nearby hug actions are suppressed so those overlays do not expose their hiding position. This is visual cover; the minimap continues to show only your own position.

Outgoing hug confirmations and action errors flash briefly, fade, and disappear after 2.2 seconds of real time. They never intercept taps and no longer occupy the connection-status banner. The recipient's interactive Accept/Deny prompt still lasts until the request expires or is resolved.

## Chat display settings

Menu → **Chat display** has independent **Above-head messages** and **Live server chat** toggles. Both start enabled and preferences are saved per browser, so each player can keep either, both, or neither display visible. Toggling display never changes message delivery.

The Minecraft-style corner feed shows `<Name> message`, retains up to 50 messages, scrolls through earlier lines, and sits above the joystick on phones. Hidden feeds continue receiving messages. Rejoining/reconnecting loads the server's recent history without duplicates; messages from players who leave remain in the feed. Forest regeneration preserves the feed; a server restart clears it. Quick messages and typed chat go to both displays, and the composer remains available with either display disabled.

When two players are concealed by the same tree canopy, they can see each other through it: your own sprite remains at 42% opacity, and the other player appears at 65%. Their name, overhead chat, and nearby hug action become visible to you. Players outside that canopy, or hiding under a different tree, still cannot see them.

## Mine northeast of Fernwood

The forest has about 15% fewer trees. Follow the short trail northeast from Fernwood to the timber-and-rock mineshaft near tile **86, 60**, marked in gold on the minimap. Walk into the opening to enter a separate cave stage. The transfer zone covers the full doorway, including slightly off-center approaches. When nearby, you can also press **E** or tap **Enter mine**; the cave exit has the same **E** / **Exit mine** action. Mobile and desktop movement use the same automatic entrance.

The shared cave is procedurally generated from the forest seed, with 35 separated chambers, 1–5-tile-wide winding passages, timber supports, rails, and ore seams. Chambers are only 3–5 tiles across, with small five-tile junctions connecting multiple paths. Single-file passages include orthogonal bridges at every bend so diagonal corner contacts never create unreachable gray floor. Four larger junction chambers each connect several tunnels. Extra links create loops and alternate routes, and offset room centers plus curving tunnel paths break up long straight corridors. **Light gray is walkable floor; dark rock is solid.** Every floor tile is connected to the entry chamber. Each exit refreshes the cave for the next entry. Players still underground keep their existing cave instance; new entries use the refreshed one, so they cannot collide with players in a different layout. Players entering before an exit share that visit. Reconnecting restores the same cave instance within the reconnect grace period.

To return, walk into the ladder/exit in the entry chamber near cave tile **15, 15**. A brief transition cooldown and separated arrival spots prevent bouncing back through a portal. The server maintains each player's stage, filters player visibility by stage, preserves cave location on reconnect, and keeps server chat shared across stages. Hugs require both players to be in the same stage.

Click or tap the forest mine entrance to see its five-second info bubble: “Magic mines! Ever time you enter some thing is different 😕”. The bubble follows the entrance on screen, never catches taps, and closes on stage changes or another world click.

## Online players and removal

The Menu lists every currently connected player across the forest and all cave instances, with character, current area, and host/you labels. The first connected player is the host. Every connected player sees **Remove** buttons for all other online players, including the host. The server requires an active session but does not restrict removal to the host. You leave your own session using **Leave / change character**.

Removal immediately releases the player's name and character, cancels their hugs, disconnects them, clears their resume token, and returns them to the join screen without automatic reconnection. This is a kick rather than a ban: they may explicitly join again. The host label transfers automatically when the host disconnects or is removed.

## Cave floor / collision consistency

Cave entry and reconnect send the server's exact floor tiles, collision tiles, and structures in a compact run-length encoded payload. Clients use that authoritative layout for drawing and the minimap rather than relying only on local procedural generation. It is sent once per stage/layout change, not with every movement update.

Cave connectivity validation checks player-sized clearance at tile centers and crossings. Regression tests traverse all gray floor tiles using the real movement/collision code across multiple cave visits. Solid rock ledges use dark trim so they cannot be mistaken for light-gray floor.

Forest and mine collision arrays are independent. Player movement uses `worldFor(player)`, selecting the correct stage and mine-visit instance. Cave terrain packets are explicitly tagged `mine` and cannot be applied to the overworld. Regression tests fill the entire overworld with obstacles while a miner walks, and fill the mine with walls while a forest player walks, proving neither stage blocks the other.

## Updating local development

After pulling or changing game code, restart any old server process and fully refresh existing browser tabs. `npm run dev` now uses Node watch mode and restarts the backend when imported code changes; `npm start` runs a normal persistent production server. Browser/server protocol checks reject stale builds rather than allowing an old visible cave to be paired with a new collision layout. Mine-entry and hug actions restore canvas focus, and movement keys still work if a game button held focus.

## Inventory and ore

Cave rock contains copper (common, 70% of ore veins), iron (uncommon, 25%), and gold (rare, 5%). Veins can be buried: ore is visible only when its rock has a walkable neighbor. Exposed wall blocks look lighter and have a different texture from deep rock. Mining opens a floor tile and exposes its neighboring rock. Stone drops nothing; breaking an ore block adds one ore directly to your inventory. The outer cave boundary cannot be mined.

On laptop, hold the left mouse button over an exposed block. Drag the pointer while holding to choose another block. On a phone, hold and aim the right joystick; it mines the first visible wall in that direction and continues digging as blocks break. Movement remains on the left joystick, and Sprint is still available. Both controls obey a maximum reach of five tiles, measured from the player to the target block center, and cannot mine through intervening rock. Stone takes 0.5 seconds per block; copper, iron, and gold each take 0.7 seconds. All blocks show progressive cracks. A translucent pickaxe swings during mining and spins briefly on each break; reduced-motion mode uses a still pickaxe.

The server advances mining, checks reach and exposed rock, and shares progress and excavated tiles with everyone in that cave instance. Releasing the pointer/joystick, changing targets, opening a panel, pausing, disconnecting, hugging, leaving the cave, or moving out of reach stops mining. Missing input heartbeats stop mining automatically. Two players cannot receive duplicate drops for one block. Excavations survive reconnects and remain in that cave instance until it is discarded; fresh mine visits use new terrain.

Press I or tap the backpack button on a phone to see a single row of five inventory slots. Each ore type stacks in one slot with a quantity shown on its icon. The panel contains only the Inventory heading, close button, and slots. Esc, I, the close button, or tapping the world closes the panel. Opening inventory stops movement and mining. Inventory belongs to the selected character: Tarin and Amy have separate saved ore counts, independent of display name, browser, and session token. Logout, removal, closing a tab, session expiry, changing characters, and restarting the server preserve those counts. Every collected ore is saved immediately; leaving also saves inventory. Reconnecting always uses the latest character inventory, so an older session cannot overwrite a newer save.

### Inventory storage

`npm start` and `npm run dev` write a versioned JSON save to `game/data/inventories.json` (relative to this server file). This private directory is ignored by git and cannot be downloaded through the game HTTP server. Updates use a flushed temporary file followed by atomic replacement. An unreadable/corrupt save stops startup instead of resetting inventory; if a save fails during mining, the ore block remains intact and an error is shown. Back up this file to preserve inventories when moving the server. Only one game server should write a save file.

Set `GAME_DATA_DIR` to change the save directory. On Render, attach a persistent disk at `/var/data` and set `GAME_DATA_DIR=/var/data`. Only files under the disk mount survive service redeploys/restarts, and persistent disks require a paid service ([Render persistent disk documentation](https://render.com/docs/disks)). Without a persistent disk, logout/rejoin still restores character inventories while that server instance is running, but Render can discard the save on restart or redeploy.

The programmatic `createGameServer()` factory also uses disk persistence by default, following `GAME_DATA_DIR`. Tests explicitly pass an isolated `new InventoryStore()` in memory. The `ForestRoom` simulation defaults to an in-memory store; pass an `InventoryStore` with a `filePath` when using the simulation directly.

## Cave spiders

Each cave instance has at most two rare Cave spiders, using the existing monster sprite. They spawn once in the larger natural chambers (at least five tiles across, with open neighboring floor), away from the entrance and at least 20 tiles apart. Spawning waits until every current miner has reported their cave camera bounds; spawn points must lie outside all of those viewports with a two-tile margin. There are no recurring on-screen spawns or monster spawns in narrow tunnels.

Spiders idle and wander like overworld animals. A spider starts following the nearest player within 15 tiles and keeps its current target until that player moves beyond 20 tiles, disconnects, or leaves that cave instance. Pursuit speed is one-third of player sprint speed (170 / 3 ≈ 56.7 world pixels per second). They find paths around walls through narrow tunnels and update those routes as players move or mining opens passages. They stop close to the player and do not attack.

Cave AI runs on the server and is shared with everyone in the same mine instance. Miners in older cave instances keep their own monster population; monsters never target players in another mine or the overworld. Returning to a freshly generated cave gets a new, separate population.
