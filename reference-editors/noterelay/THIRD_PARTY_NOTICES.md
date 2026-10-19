# Third-party notices

This file records third-party code, theme structures and design systems
incorporated into NoteRelay, together with reference-only projects that did
not contribute copied source code.

## gzh-design-skill

NoteRelay's WeChat renderer and six built-in WeChat themes incorporate and
adapt theme structures, component designs and compatibility techniques from:

- Project: gzh-design-skill
- Repository: https://github.com/isjiamu/gzh-design-skill
- Copyright (C) 2026 甲木 (Jiamu) × 摸鱼小李 (Moyu Xiaoli)
- License: GNU Affero General Public License v3.0 or later
- NoteRelay modifications: July 2026

The incorporated material has been adapted from an AI-agent skill and HTML
theme system into an Obsidian plugin renderer. NoteRelay distributes the
combined work under GNU AGPL-3.0-or-later. The complete license text is
included in the repository's `LICENSE` file.

## Note to RED

NoteRelay's Xiaohongshu preview structure, default and memo templates, theme
presets, font options, pagination behavior and background-selection
experience incorporate and adapt code from:

- Project: Note to RED
- Repository: https://github.com/Yeban8090/note-to-red
- Copyright (c) 2025 夜半Yeban
- License: MIT License
- NoteRelay modifications: July 2026

MIT License

Copyright (c) 2025 夜半Yeban

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Spider Media

NoteRelay's Toutiao renderer adapts the structural formatting, visual styles,
task-list handling, and ProseMirror paste-compatibility approach from:

- Project: Spider Media
- Repository: https://github.com/ivanzwb/spider-media
- Copyright (c) 2026 Spider Media contributors
- License: MIT License
- NoteRelay modifications: August 2026

The MIT license grant and disclaimer printed in the Note to RED section above
also apply to Spider Media, with the Spider Media copyright notice stated here.

## Reference-only projects

The following repositories informed product research or workflow design.
NoteRelay does not claim that source code from these repositories was copied:

- ximen-notetomp: https://github.com/ximencuisu/ximen-notetomp
- md-to-x-article-skill: https://github.com/shaom/md-to-x-article-skill

At the time of review, these repositories did not expose a standalone
`LICENSE` file at their default raw GitHub path. Their inclusion in this
reference-only section does not grant or imply rights beyond those stated by
their respective maintainers.

## Bundled runtime libraries

NoteRelay's JavaScript bundle includes open-source runtime libraries and their
transitive dependencies. The principal direct dependencies are:

- markdown-it — MIT
- html-to-image — MIT
- fflate — MIT

Their complete package metadata and upstream license files are available
through `package-lock.json` and the corresponding npm packages.
