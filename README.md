# codist-ui

The interface of [Codist](https://github.com/abxengg/codist), in Svelte 5. The build in `dist/` is committed and
embedded by the Go package in this repository, so the Codist binary carries the interface and building Codist needs
no Node.

Screens, as the sidebar lists them: **Now** (what the AI is doing, what needs attention, what changed, and a
**Download it** button when Ollama lacks the model), **Issues** (every open issue, filtered by type, urgency, change
and who found it: the AI model or the code checks), **Commits** (the branch graph, three dots per commit for checks,
AI and behaviour runs, and each commit on a stage with its diff, findings and how Codist decided each one) and
**Chat** (questions about the codebase, answered with the files and lines used). Under **More**: **Incidents**,
**Map** (services in hexagons, classes and methods, Feign calls), **Activity** and **Repository**.

Motion follows one clock (`src/lib/motion.ts`): screens fade and rise in over 220 ms, the sidebar highlight slides,
counts pop when they change, toasts can be held by pointing and dismissed by clicking, and lists show placeholder
cards while loading. All of it stops when the system asks for less motion.

```bash
npm install
npm run dev     # live reload on :5173, with /api sent to Codist on :8080 (CODIST_API to change)
npm run build   # rebuilds dist/; commit it with the change
```

```go
import ui "github.com/abxengg/codist-ui"

mux.Handle("/", ui.Handler())
```

## Licence

Source available under the [PolyForm Noncommercial License 1.0.0](LICENSE): free for any noncommercial purpose, such
as personal study, research, hobby projects and testing, and for use by charities, schools, public research and
public health bodies and government institutions. **Using it for a business, or in anything sold, needs a commercial
licence** from the author: open an issue at [github.com/abxengg/codist](https://github.com/abxengg/codist/issues)
to ask. Third-party code included in Codist keeps its own licence.

Required Notice: Copyright 2026 Abinash (https://github.com/AbiXnash)
