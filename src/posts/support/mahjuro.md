---
title: Support for Mahjuro
description: The official support policy for Mahjuro.
keywords: mahjuro, support, policy, support policy, help
---

# {title}

**Mahjuro** is a mahjong roguelite: build melds, stack relics, and chase score targets across a run. No prior mahjong knowledge is required — the in-game tutorial teaches the basics.

**Contact:** [support@zeldas.page](mailto:support@zeldas.page)  
**Bug reports:** [github.com/Velfi/Mahjuro/issues](https://github.com/Velfi/Mahjuro/issues)

### System requirements

| | |
|---|---|
| **Platform** | macOS 11.0 (Big Sur) or later |
| **GPU** | Metal-capable Mac (Apple Silicon or discrete GPU) |
| **VRAM** | 4 GB minimum at 1080p with **Low memory** graphics; 6 GB+ recommended for **Visuals** at native resolution |
| **Input** | Keyboard and mouse; gamepads supported (Xbox, PlayStation, Switch, and others via SDL3) |
| **Network** | Optional — used for Game Center achievements only |

### Getting started

1. Launch Mahjuro from Applications.
2. Start a **New Run** and follow the tutorial (or skip if you already know the rules).
3. Between blinds, visit the **shop** for relics and upgrades.
4. Use **Options** (main menu or pause) for graphics, audio, controls, and tile sets.

### Saves and your data

The Mac App Store build runs in Apple’s **App Sandbox**. Saves, settings, and mods stay on your Mac inside the app container:

```
~/Library/Containers/com.zelda-built-this.Mahjuro.store/Data/Library/Application Support/Mahjuro/
```

Profile saves (`profile_*.json`, `settings.json`, run history) live there. Progress is **local to this Mac App Store install** — it does not sync with Steam or other stores.

**Back up saves:** quit the game, copy the folder above to external storage or iCloud Drive.

**Restore saves:** quit the game, replace that folder’s contents with your backup, then relaunch.

### Game Center and achievements

Mahjuro uses **Game Center** for 15 achievements (tutorial complete, first boss defeated, seasonal unlocks, and similar milestones).

- Sign in under **System Settings → Game Center** before or during play.
- Achievements unlock automatically when you meet the in-game condition.
- View progress in the Game Center app or System Settings.

If achievements never appear, confirm you’re signed into Game Center with the same Apple ID you used to purchase the app, then restart Mahjuro.

### Custom tile sets (mods)

You can install custom tile face atlases:

1. In-game: **Options → Open tileset mods** (opens the mod folder in Finder).
2. Copy the `_template` folder to a new name and add `atlas.png` + `atlas.toml`.
3. In **Options → Tile set**, pick your mod (shown as “(mod)”).

Each mod folder needs a valid `atlas.png` and `atlas.toml`. Folders starting with `_` or `.` are ignored.

### Export play statistics

**Options → Export play stats** opens a save dialog. Choose where to save an HTML summary of your profile stats. The game only writes where you explicitly save.

### Troubleshooting

**Game won’t launch or crashes on startup**

- Update macOS to 11.0 or later.
- Try **Options → Graphics → Low memory** on next launch (if you can reach the menu).
- If it keeps crashing, send the crash log from:
  `~/Library/Containers/com.zelda-built-this.Mahjuro.store/Data/Library/Application Support/Mahjuro/logs/crash.log`

**Low frame rate or stuttering**

- Lower graphics to **Low memory** or **Performance**.
- Close other GPU-heavy apps.
- On MacBooks, plug in power so the discrete GPU can stay active.

**Achievements not unlocking**

- Confirm Game Center sign-in (see above).
- Some achievements require specific in-game events (e.g. defeating a boss, finishing ten runs).

**Can’t find my save files**

- Use **Options → Open tileset mods** to reveal the container data folder, then go up one level to the `Mahjuro` root.

**Purchased on another store (Steam, etc.)**

- Mac App Store builds are separate products. Saves and achievements do not transfer between stores.
