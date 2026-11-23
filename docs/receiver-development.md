# Receiver timetable review

The `feature/receiver-schedule-foundation` branch is a development checkpoint.
Use it only with the matching integration branch. It is not a replacement for
the stable release and does not move schedule ownership to the receiver.

The admin-only Settings disclosure appears when the backend supplies receiver
status. It can read a complete native timetable, preview a saved HA week, download
the receiver record and preview restoration of a retained backup. Unsaved drafts
must be saved or discarded before using these tools. Each changed day shows its
original and proposed periods.

Copy requires the zone's HA scheduling to be disabled, a current backend preview
and the exact phrase `WRITE RECEIVER TIMETABLE`. The backend independently checks
permissions, mapping, schedule revision, boost state, a fresh receiver read and
durable backup storage. It verifies all seven days after writing.

Keep a downloaded backup before removing the integration. Downloads contain
receiver identifiers; review them before sharing. An unresolved copy requires a
new read and review. The UI never claims that a radio acknowledgement alone proves
success. See the integration's
[architecture and hardware acceptance plan](https://github.com/OneScuzzie2k/smart-heating-scheduler/blob/feature/receiver-schedule-foundation/docs/receiver-scheduling.md).

The main heating dial redesign is separate from these admin tools. Existing
mini cards and household boost permissions remain supported.
