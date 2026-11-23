# Receiver timetable review

The `feature/receiver-schedule-foundation` branch is a development checkpoint.
Use it only with the matching integration branch. It is not a replacement for
the stable release. Receiver ownership requires the explicit dev.3 handover below.

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

## Native timer checkpoint 0.6.0-dev.2

The matching development integration adds a collapsed **Hardware timer
qualification** section. Inspect the actual mode, prepare a two-minute test,
disable only the reviewed zone and pause competing receiver controllers, then
type `TEST RECEIVER TIMER` to start. The unchanged Manual target and original
hold are backed up before any mode change. The receiver must supply a bounded
countdown; HA observes native return to Schedule before restoring the original
hold. It does not label an HA watchdog restoration as successful native expiry.

The card shows expiry, scheduled-target agreement and original-hold restoration
separately. Status updates cannot erase a receiver error or replace new timer
progress with a cached preview. Restore paused controllers and enable the zone
only after confirming the original hold is restored. These tools do not enable
permanent native schedule ownership or alter ordinary mini-card permissions.


## Clock, transition and owner checkpoint 0.6.0-dev.3

Use the matching backend. Clock and schedule transitions contains fresh Time-cluster
readback, explicit synchronization of UTC/timezone/active-or-next DST rules, and a
five-minute lower-temperature two-boundary test. Pause the zone and competing hold
controllers for writes. A missed boundary remains unproven even if restoration succeeds.

Schedule controller enables a verified receiver only after its timer, both transitions,
clock and desired copied timetable pass backend checks. Re-enable the zone afterwards.
Preheating, occupancy, holidays and profiles stay in their existing configurable UI.
Schedule-origin overrides use finite renewable hardware leases. Manual/Off boosts and
frost-while-Off restoration still require HA, as explained before handover.

A native zone's Save week writes and verifies its receiver first. To adopt a physical
schedule edit, pause the zone, Read receiver timetable, review it and use the exact
import acknowledgement. Partial writes stay unresolved, never silently switching to
HA control. Return to HA scheduling before a whole-zone import or downgrading.

The full dashboard shows actual native receiver mode separately from the HA rule.
Mini cards retain their compact layout and household boost permissions.
