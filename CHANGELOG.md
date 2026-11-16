# 0.3.0-dev.4 - compact thermostat and boost

- Match the native thermostat layout with one interactive round target dial, room reading, compact boost duration and Boost/Stop boost button.
- Remove the duplicate target slider, instruction text and permanent footer. Show Resume schedule only during a manual hold; link the title to the full scheduler.
- Use rounded arcs and compact phone typography; clip dial-handle rotation to avoid sideways scrolling.
- Frontend-only update, compatible with backend0.3.0.dev2. Validation:32 tests, Card/HACS checks and disconnected browser interaction plus phone/tablet layout checks.

# 0.3.0-dev.3 - mini-card preview

- Add an optional one-zone mini thermostat/boost layout with manual target and boost-duration sliders, native thermostat details, Resume schedule and dashboard link.
- Make the 270-degree thermostat dial interactive: pointer/touch drag, arc click, snapped preview, one command on release, keyboard steps and visible handle/focus. Preserve pointer capture across incoming snapshots; cancellation, unavailability and ownership guards prevent commands.
- Add layout and zone selection to the visual editor and a disconnected `/mini` design preview.
- Manual targets respect observed live mode, reviewed bounds, availability and boost/holiday guards. No backend change required.
- Validation: 32 frontend tests, including mini zone isolation, guarded mapped-climate calls, dial geometry, drag/release/cancel, incoming snapshots, keyboard focus and disabled/fault conditions.

# 0.3.0-dev.2

- Rename the occupied comfort feature to Occupancy override and expose it as a per-zone setting with an enable switch, minimum temperature, day buttons, hours and explicit people/sensor selection.
- Show enabled rules with current status alongside the dashboard/day schedule and conditional bands under applicable weekly timelines.
- Preserve policy revisions and unsaved occupancy selections across snapshots; reject enabled rules without occupancy inputs or active days.
- Correct the temperature explanation when live heating control is enabled.
- Validation: 25 frontend tests passed. Backend API/storage contract unchanged; compatible with backend 0.3.0.dev2.

# 0.3.0-dev.1 - Phase 3 development candidate

Added working per-zone boost, presence and holiday controls; persistent deadlines/ownership, guarded optional climate commands, adapter completion signals, policy revisions and admin-only mutations. Default remains observe-only. Updated responsive card and disconnected demo. Full installation/hardware validation and release work remain.

# Changelog

## 0.2.0-dev.1 — responsive card preview

- Added four connected views using the supplied orange/teal design language.
- Added desktop seven-day timelines and a mobile period-list editor.
- Added validated local drafts, day/week copying, undo, save/cancel and conflict recovery.
- Added HA card configuration editor, subscriptions and dark/light themes.
- Added a disconnected interactive preview and automated model/DOM tests.
- Heating actuation, presence and holiday remain disabled pending later phases.
