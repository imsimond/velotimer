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
- Settings persist in browser storage across sessions; timer sessions do not.
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

## Timing Verification

Start warms the audio output and waits for a progressing, stable output clock before scheduling the countdown. Audio resume and output-clock readiness each have a one-second timeout; a failure leaves the timer ready for another attempt instead of starting silently. Countdown digits use the output clock, with latency estimates as a fallback for browsers without output timestamps. At the go boundary, stopwatch timing continues on a fixed monotonic clock so later audio-route changes cannot alter lap times.

Timing diagnostics open upward from a toggle immediately above the timing controls. They record startup wait, estimated output latency, output-timestamp age, clock correction, digit-boundary lateness, frame gaps, and React commit duration. The copy icon exports a JSON snapshot with browser information and settings; the report version is `audio-clock-v1`. Measurements are app-side, not physical sound or screen measurements. Values marked "Not sampled" have not yet been observed. Worst values reset on Start. Clipboard export requires a secure browser context and permission.

Android PWA acceptance checks:

1. Deploy the production build, open the installed PWA online, then fully close and reopen it. Confirm the diagnostics copy icon is present so the test is not using a cached older build.
2. With the built-in speaker and diagnostics open, record a cold-start session and a repeat session. Copy a report near the end of the countdown and another after go; note whether sound leads or trails the changing digits.
3. Repeat with 1-, 5-, 12-, and 30-second countdowns, echo off and on, and diagnostics closed. Include first launch, app resume, and offline launch.
4. Compare the built-in speaker with any wired or Bluetooth output separately. Do not change audio output during a session. Browser-reported latency does not guarantee complete compensation for Bluetooth processing.
5. Keep the app visible and the screen awake. Also test returning after screen lock or backgrounding; browser suspension can interrupt audio and visual updates even when elapsed-time arithmetic continues.
6. For physical synchronisation, record the phone's screen and speaker together using an external camera with verified audio/video alignment. Internal screen recordings and desktop emulation cannot establish Android speaker/display accuracy.

Nonzero digit lateness includes JavaScript and React commit delay relative to the requested boundary, but not compositor, panel scan-out, sound propagation, or unreported hardware latency. Tone attack also affects perceived onset. No claim of perfect physical synchronisation or suitability for certified timing is made without device measurements.
