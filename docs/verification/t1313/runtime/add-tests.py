from pathlib import Path
p=Path('docs/verification/t1313/runtime/freeze.py');s=p.read_text().replace('docs/verification/t1313/runtime/frontend.vitest.config.ts','docs/verification/t1313/runtime/frontend.vitest.config.ts\ndocs/verification/t1313/runtime/backend.vitest.config.ts');p.write_text(s)
