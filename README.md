# SOLMARA: Second Crossing

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/xantuyz/gta6-01-v2/rank.svg)](https://make.fun/bounty/gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/xantuyz/gta6-01-v2/reward.svg)](https://make.fun/bounty/gta6-01)

Built for the [make.fun bounty gta6-01 — Make GTA 6](https://make.fun/bounty/gta6-01)
($1,666 prize pool; entries close 24 Nov 2026 15:00 UTC).

A stylized 3D open-world crime game in a desktop browser, from static
files with no network request. One harbour city block, two crossings, and
one night that decides a new courier's future. All city, characters,
vehicles, names, story, art, sound and music are original.

## Play

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Or open `game/index.html` through any static server. No build step, no
install. `main.ts` (Node 22, standard library only) hands the game in:
it copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library.

## The game

You are **Raka**, a new courier for Bos Dimas. Prove yourself across five
jobs in one night — Marina Pickup, Market Relay, Freight Run, Bridge
Window, and the finale, Second Crossing — without drawing the harbour
police. Earn $5,400 in total, then keep the city in free roam.

- **On foot and by car** — third-person walking, enter/exit any car (E),
  arcade driving across 5 vehicle classes (hatch, sedan, sport, van,
  police) with distinct speed, acceleration and grip.
- **A living block** — marina, market plaza, freight island, a drawbridge
  and a second crossing; 6 traffic cars cruising the grid and 10
  pedestrians wandering the market and the promenade.
- **Steal, get seen, get chased** — taking a car in front of a witness
  raises the 5-star wanted level and sends patrol cars after you. Ram
  them back at speed to stun them off your tail, outrun them, or hide
  until they lose your trail and the heat cools down. Get caught on foot
  or wrecked and Bos Dimas bails you out — back to the garage, mission
  restarted.
- **The campaign** — 5 sequential jobs with auto-advance: Marina Pickup
  +$450, Market Relay +$600, Freight Run +$750, Bridge Window +$900,
  Second Crossing +$1,500. Job 4 raises the drawbridge ~34° and closes
  the road; job 3's garage choice (van or sport) decides the finale
  handoff — van to the Freight Island, sport to the Marina — under a
  3-star pursuit. Finish all five for the TAMAT ending and free roam.
- **HUD + minimap** — wanted stars, money, health, speed, objective
  with live distance, context prompts, and a circular minimap with the
  mission target, landmarks and police dots.
- **Sound, synthesized** — WebAudio engine hum that follows your speed,
  a police siren while wanted, and pickup / success blips. No audio files.
- **Save** — money, missions completed and best time persist locally.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk / drive |
| E | Enter / exit car |
| Space | Handbrake |
| Mouse drag | Orbit camera (wheel zooms) |
| Shift | Run on foot |
| R | Restart mission |
| P / Esc | Pause |
| M | Mute |

## Screenshots

Deterministic renders — `?shot=<name>&seed=1` stages each scene and
runs a fixed number of simulation steps, so every run produces the same
frame byte for byte.

1. **Chase cover** — pursuit onto the drawbridge, two patrol cars ahead
   on the deck, wanted level 3.
2. **Market on foot** — Raka in the plaza, stalls, traffic, and the
   prompt to take the parked hatch.
3. **Garage crew choice** — the two mission cars in Bos Dimas's garage:
   Elang Sport (fast) or Kargo Van (roomy).
4. **Bridge detour** — the bridge closed, the long way round past the
   market toward the Marina.

## Tech

- three.js r160 (vendored under `game/vendor/`), ES modules, no bundler.
- Seeded RNG (mulberry32) for the city layout, traffic and pedestrians.
- `game/src/`: `main` (loop, camera, shot mode), `city`, `player`,
  `vehicles`, `traffic`, `police`, `missions`, `hud`, `audio`, `input`,
  `state`, `rng`, `shots`.

## License

MIT — see [LICENSE](LICENSE).
