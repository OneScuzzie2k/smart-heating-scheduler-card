# 0.5.4 — lock boost temperatures clearly

- Disable full-card boost target/duration inputs during a running boost and show its active target. Stop boost remains available.
- Mini dial shows “Boost · locked” in its existing caption. Incoming boost snapshots cancel an in-progress dial drag immediately without sending a manual target.
- Native HA thermostat controls and physical device buttons keep their existing behavior, including Off.
- 48 frontend/model/DOM tests pass. Works with integration 0.5.3; frontend-only update, no Core restart required.

# 0.5.3 — boost for household users

- Full and mini boost controls use server-supplied per-zone permissions instead of requiring administrator access.
- Settings, schedules and other administrator controls retain their restrictions. Disconnected cards cannot boost.
- Requires integration 0.5.3 and a frontend reload. 46 frontend/model/DOM tests pass.

# 0.5.2 — clear preheating priority and pause reasons

- Show the actual pause reason supplied by the backend.
- Explain that presence alone does not pause scheduled preheating; occupancy adds a minimum.
- Requires integration 0.5.2 for the corrected control policy. Existing settings and mini-card layout preserved.

# 0.5.1 — independent frost range and clear save errors

- Frost target input uses the backend’s verified hardware range instead of the normal schedule minimum.
- Explain that normal schedule/manual bounds remain unchanged; requires backend 0.5.1 for the independent range.
- Preserve frost opt-in, Off permission and existing mini-card layout.
- Keep failed-save explanations visible next to Save settings across live status updates, while preserving the unsaved draft.

# 0.5.0 — setup, frost, backups and preheating feedback

- Guided zone setup guidance and HA wizard entry point.
- Collapsed, optional frost settings with reviewed target, Off permission and recovery/freshness controls.
- Download weekly schedules or zone settings; validate and preview files before importing. Full settings restoration keeps the destination disabled.
- Copy saved weeks between compatible zones; show learning progress, warm-up estimates and last measured result.
- Keep existing mini thermostat/boost layout unchanged. Requires integration 0.5.0 for new backend controls.

# 0.3.0 - first stable release

- Promote the tested dev.5 frontend with the full responsive planner, per-zone occupancy/holiday/boost controls and compact thermostat/boost mini card.
- Keep the single interactive target dial and fixed-height occupancy badge; no layout or heating-command changes from dev.5.
- Update installation instructions to the stable 0.3.0 backend/card pair. Requires Home Assistant Core 2026.11.1+. See backend release acceptance for live expiry, holiday and restart results and external timer requirements.

# 0.3.0-dev.5 - keep mini cards aligned

- Show active occupancy as a small person/Occupied badge in the dial's existing bottom gap.
- Position occupancy, holiday and manual-resume status outside normal layout flow so state changes do not change thermostat height or move boost controls.
- No heating-control, schedule or backend changes. Compatible with backend 0.3.0.dev2.

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
