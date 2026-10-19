<!--
  SPDX-FileCopyrightText: 2026 Thomas Steiner
  SPDX-License-Identifier: Apache-2.0
-->

# SRI Hash Generator

A bookmarkable
[Subresource Integrity](https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity)
hash generator. Pass the resource and the hash algorithms in the URL, and the
page fetches the resource and shows the `integrity` value plus a ready-to-paste
`<script>` or `<link>` tag.

**Live:** https://tomayac.github.io/sri-hash/

## URL parameters

| Parameter   | Description                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `url`       | The resource to hash.                                                                                                          |
| `algorithm` | `sha256`, `sha384`, or `sha512`. Repeat the parameter or separate values with commas for several hashes. Defaults to `sha384`. |

Examples:

- https://tomayac.github.io/sri-hash/?url=https://code.jquery.com/jquery-3.5.0.min.js&algorithm=sha256
- https://tomayac.github.io/sri-hash/?url=https://code.jquery.com/jquery-3.5.0.min.js&algorithm=sha384,sha512

## Pasted code

The page also hashes pasted code. Links to pasted code keep everything in the
fragment after `#`, which browsers never send to a server:

| Fragment parameter | Description                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`             | The code, compressed with `deflate-raw` and base64url-encoded. Used while it fits in 600 characters.                                                                   |
| `digests`          | For longer code: the SHA-256, SHA-384, and SHA-512 digests, concatenated and base64url-encoded, so the link stays at about 250 characters however much code you paste. |
| `bytes`            | The code size, shown next to the result when the link only has `digests`.                                                                                              |
| `src`              | Optional file path for the HTML snippet. A path ending in `.css` gives a `<link>` tag.                                                                                 |

Pasted code is hashed as UTF-8 with `LF` line endings. The file you serve must
match it byte for byte, including whether it ends with a newline.

## CORS

Hashing runs in the browser with `crypto.subtle.digest()`, so the resource must
be served with an `Access-Control-Allow-Origin` header. Browsers require that
header for cross-origin SRI anyway, so a resource this tool cannot fetch would
fail its integrity check on your page, too.

## Credits

Syntax highlighting by
[MicroLighter](https://github.com/davatron5000/microlighter) (MIT), vendored in
`vendor/microlighter/` with a small patch to its HTML grammar.

## License

Apache 2.0
