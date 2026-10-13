# Audio patterns

Add one `.json` file per velodrome in this folder, using lowercase filenames.
Copy `standard.json` as a starting point. The settings dropdown includes these files when
Parcel starts or the app is built; no JavaScript list needs updating. Restart
the dev server after adding or removing a file.

```json
{
  "name": "Your velodrome",
  "type": "square",
  "events": [
    { "seconds": 30, "frequency": 488, "duration": 0.66 },
    { "seconds": 7, "frequency": 488, "duration": 0.33 },
    { "seconds": 0, "frequency": 976, "duration": 0.66 }
  ]
}
```

- `name` is the velodrome name shown in the dropdown.
- `type` is optional and defaults to `square`. Other supported values are
  `sine`, `triangle`, and `sawtooth`; it applies to every event in the file.
- `seconds` is the number of seconds remaining when the tone begins. Any
  nonnegative number is allowed, including fractions. Events can be listed in
  any order; cues beyond the selected countdown length are skipped.
- `frequency` is a positive number in hertz.
- `duration` is a positive number in seconds.

Include a cue at `0` for the start signal, or omit it for a silent start.
An empty `events` array gives a completely silent countdown. Echo and volume
are still controlled by the app's existing settings.

The filename (without `.json`) identifies the saved selection, so keep it
stable when changing the display name. If a selected file is removed, the app
falls back to Standard on reload. Keep `standard.json` as the default pattern.
Use valid JSON: double quotes, no comments, and no trailing commas.
