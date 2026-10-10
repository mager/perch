# Perch visual system

## Direction

White, precise, and welcoming. The owner explicitly changed the initial dark
terminal direction to an Apple-inspired light interface with bold centered text.
The final white dashboard study and bird-on-Mini artwork are the visual references.
Physical scene: checking a personal Mac from a bright laptop or phone, with the
clarity and restraint of a native utility. Restrained neutral palette, near-white
surfaces, dark green-black ink, and small green status signals. Amber marks stale
or interrupted reporting, always accompanied by text.

## Visual contract

Landing page: centered bold headline, generous space, large bird-on-Mini artwork,
illustrative dashboard preview, honest stale-state explanation, privacy principles,
and self-hosting instructions. Do not imply that the illustration is actual hardware
identification or that sample metrics are live.

Dashboard: horizontal machine chooser, centered name and heartbeat, open three-column
resource strip, fine history plot, and session rows. Native system sans typography,
monospace only for detailed data. At narrow widths resource metrics stack; chart axis
labels remain readable independent of SVG scaling. No nested cards or decorative
animation. Keep keyboard focus and controls visible.

## Identity and assets

Reusable standalone perched bird, custom vector wordmark, and favicon. The SVGs
are independent of data and routing. Generated hero art is conceptual, not a product
photograph. Source provenance lives in docs/brand-assets.md.

## States and interaction

Fresh at up to three minutes since server receipt; older snapshots retain their
metrics with explicit stale labels. No first heartbeat has an onboarding state.
API failures retain the last result marked unverified. Authentication expiry clears
private snapshots. Poll every 60 seconds while visible and update age labels between
polls. Sample-only controls exercise normal, stale, empty, unavailable, and error states.
Chart paths break across gaps over three minutes. No Codex task-status inference.

## Accessibility and motion

WCAG AA is the target. Native controls, semantic landmarks and tables, text status,
visible focus, minimum 44px controls, responsive layouts, and reduced-motion support.
No decorative pulse or page-load choreography. Browser and automated checks do not
replace real-device and assistive-technology testing.

## Native Mac companion

The same bird is a monochrome template in the menu bar, adapting to macOS light
and dark appearance. Native SwiftUI controls, system typography, restrained green
actions, and a scrollable connection window. The bird and primary connection action
stay in a fixed header; validation feedback appears beside that action. The menu distinguishes local samples
from server receipts and unknown current state. No animation or inferred task
status. First launch sends nothing; optional metadata starts off.
