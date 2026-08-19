# @brett_lamy/viz-engine

The reusable timeline and SVG primitive layer behind the O'RLY explainer
bookshelf.

```tsx
import { Camera, Player, Timeline, colors, ease } from '@brett_lamy/viz-engine';
import '@brett_lamy/viz-engine/styles.css';

const timeline = new Timeline();
const radius = timeline.channel('radius', 0);
timeline.tween(radius, 80, { at: 0, dur: 1, ease: ease.enter });

export function Demo() {
  return (
    <Player timeline={timeline} loop>
      {(state) => (
        <Camera x={640} y={360} k={1}>
          <circle cx={640} cy={360} r={state.get(radius)} fill={colors.ACCENT} />
        </Camera>
      )}
    </Player>
  );
}
```

The package also exposes `@brett_lamy/viz-engine/draw`, `/acts`, and
`/narrator` for the lower-level compatibility APIs.

## Architecture diagrams

The architecture vocabulary is designed for explanatory diagrams rather than
static infrastructure inventories. `ArchitectureFrame` supplies the restrained
paper canvas, `ArchitectureCard` gives typed nodes a consistent editorial
hierarchy, `ArchitectureEdge` routes labeled traffic with scrub-safe flow, and
`ArchitectureGrid` / `ArchitecturePhaseRail` cover dense stores and protocol
phases.

```tsx
import {
  ArchitectureCard,
  ArchitectureEdge,
  ArchitectureFrame,
} from '@brett_lamy/viz-engine';

<ArchitectureFrame w={1200} h={620} label="EVENT LOG" rightLabel="OFFSET 0043">
  <ArchitectureEdge
    from={{ x: 210, y: 220 }}
    to={{ x: 520, y: 220 }}
    label="APPEND"
    tone="blue"
    flow={writeU}
  />
  <ArchitectureCard x={210} y={220} label="WRITER" meta="CLIENT" tone="green" />
  <ArchitectureCard x={520} y={220} label="STREAM" meta="APPEND-ONLY" tone="blue" />
</ArchitectureFrame>
```

All primitives are deterministic SVG: drive `u` and `flow` from the timeline,
and seeking produces the same diagram at the same sampled time.

## Video player

`VizPlayer` is included in this package. Give it a `Timeline` and a render
function; the same timeline remains seekable and can optionally follow
narration audio:

```tsx
import { Timeline, VizPlayer } from '@brett_lamy/viz-engine';
import '@brett_lamy/viz-engine/styles.css';

const timeline = new Timeline();
const opacity = timeline.channel('opacity', 0);
timeline.tween(opacity, 1, { at: 0, dur: 0.5 });

<VizPlayer
  scene={{
    timeline,
    render: (state) => <circle opacity={state.get(opacity)} />,
  }}
/>
```

For markdown/document URLs, `VideoEmbed` selects a native `<video>` element
for `.mp4`, `.webm`, and `.ogg` files and an iframe for hosted players:

```tsx
import { VideoEmbed } from '@brett_lamy/viz-engine';

<VideoEmbed src="https://example.com/explainer.mp4" title="Explainer" />
```
