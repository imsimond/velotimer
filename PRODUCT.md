# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, Mantine, Parcel, SCSS, SVG, and Node.js; deployable to Cloudflare Pages or GitHub Pages. Use Mantine for buttons, the lap table, settings controls, and overlays, while keeping timer logic independent and using SCSS for the fixed clock and app layout.

## Users

Track cycling coaches running training sessions at a velodrome, typically operating the timer on a portrait smartphone while holding a cyclist with both hands.

## Product Purpose

Provide a simple countdown that automatically becomes a stopwatch, allowing a coach to start a session before hands-on work, record lap splits, and end the run.

## Positioning

The countdown and stopwatch are one continuous timing session, with audible countdown cues, touch-friendly Lap/Stop controls, and a permanently reserved, internally scrollable lap region whose table appears after the first lap or when the timer ends.

## Operating Context

Used trackside during cycling training. The coach starts the countdown, puts the phone down, then needs the display to remain awake and timing to continue through the countdown-to-stopwatch transition.

## Capabilities and Constraints

- Countdown defaults to 12 seconds and is configurable from 1 to 99 seconds.
- Countdown Reset cancels and returns to the configured start value.
- Stopwatch captures lap and end times to three decimal places and auto-ends at 99:59.999.
- Settings persist in the current browser tab's session storage; timer sessions do not.
- The installable PWA must work offline and request a screen wake lock while timing where supported.
- Browser event delivery, timer precision policies, and suspension prevent guaranteeing physical millisecond accuracy or uninterrupted background operation.
- Advanced lap analytics and native React Native implementation are out of scope.

## Brand Commitments

Preserve the DSEG seven-segment font and amber active/off-segment treatment from the countdown prototype, with a dark interface and rich red highlight inspired by velodrome clocks. Preserve its Web Audio tone character and make echo configurable.

## Evidence on Hand

- Existing countdown prototype: `index.html`.
- DSEG font and license: `font/DSEG7ClassicMini-BoldItalic.woff2`, `font/DSEG-LICENSE.txt`.
- No verified performance claims or official timing certification are available; do not imply either.

## Product Principles

- Keep the live timer and its actions immediately legible at trackside.
- Keep clock digit slots, timer bounds, and lap-table space fixed across timer phases and as laps are recorded.
- Derive elapsed time from a monotonic clock, not display-update frequency.
- Keep the main screen focused on timing; defer configuration until requested.
- Treat wake lock and offline support as progressive browser capabilities.
