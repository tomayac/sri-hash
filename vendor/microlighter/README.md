<!--
  SPDX-FileCopyrightText: 2026 Thomas Steiner
  SPDX-License-Identifier: Apache-2.0
-->

# Vendored MicroLighter

The files here are from
[MicroLighter](https://github.com/davatron5000/microlighter) 2.2.0 (MIT, see
`LICENSE`), limited to the HTML grammar and its dependencies.

`grammars/html.js` is patched in two places:

- `embedded-javascript` skips empty `<script>` elements, so the generic `tags`
  rule highlights the attributes of `<script src="…"></script>`.
- Attribute rules accept any whitespace (`\s`) before an attribute name in place
  of spaces and tabs only, so attributes on their own lines are highlighted.
