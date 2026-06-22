# public/fixtures

Static JSON projection of the canonical fixture dataset
(`src/fixtures/canonical.ts`), per IMPLEMENTATION-ARCHITECTURE §3 and
shared-components SPEC §9.

- `canonical.json` — the full `canonicalDataset` serialized as JSON. It can
  be served as a deterministic mock API payload before the real service
  contract (stage 15) and backend (stage 16) exist.

Regenerate after changing the canonical fixtures:

```bash
pnpm fixtures:export
```

The exporter introduces no randomness or wall-clock time — the dataset
carries a fixed clock (`FIXED_NOW`), so the output is byte-stable.
