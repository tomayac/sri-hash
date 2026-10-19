// SPDX-FileCopyrightText: 2026 Thomas Steiner
// SPDX-License-Identifier: Apache-2.0

import { highlightAll } from './vendor/microlighter/index.js';

const ALGORITHMS = {
  sha256: { name: 'SHA-256', bytes: 32 },
  sha384: { name: 'SHA-384', bytes: 48 },
  sha512: { name: 'SHA-512', bytes: 64 },
};
const DEFAULT_ALGORITHM = 'sha384';
// Longer compressed code goes into the link as its digests only, which keeps
// the link at a constant length of about 200 characters.
const MAX_CODE_LENGTH = 600;
const DEFAULT_SRC = 'script.js';

const form = document.querySelector('form');
const { url: urlInput, code: codeInput, src: srcInput } = form.elements;
const sources = [...form.querySelectorAll('[name="source"]')];
const panels = {
  url: document.querySelector('#url-panel'),
  code: document.querySelector('#code-panel'),
};
const checkboxes = [...form.querySelectorAll('[name="algorithm"]')];
const result = document.querySelector('#result');

// Accepts `algorithm=sha256&algorithm=sha384`, `algorithm=sha256,sha384`,
// and spellings like `SHA-256`.
const parseAlgorithms = (params) => {
  const values = [...params.getAll('algorithm'), ...params.getAll('alg')]
    .flatMap((value) => value.split(/[\s,]+/))
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((value) => value in ALGORITHMS);
  const unique = [...new Set(values)];
  return unique.length ? unique : [DEFAULT_ALGORITHM];
};

const selectedAlgorithms = () =>
  checkboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);

// Leaves characters that are legal in a query or fragment unescaped, so links
// stay readable.
const serialize = (params) =>
  params
    .toString()
    .replace(/%(3A|2F|2C|40)/g, (escaped) => decodeURIComponent(escaped));

const escapeHTML = (string) =>
  string.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );

const toBase64Url = (bytes) =>
  bytes.toBase64({ alphabet: 'base64url', omitPadding: true });

const fromBase64Url = (string) =>
  Uint8Array.fromBase64(string, { alphabet: 'base64url' });

const pipe = (bytes, transform) =>
  new Response(new Blob([bytes]).stream().pipeThrough(transform));

const compress = async (text) =>
  new Uint8Array(
    await pipe(text, new CompressionStream('deflate-raw')).arrayBuffer(),
  );

const decompress = (bytes) =>
  pipe(bytes, new DecompressionStream('deflate-raw')).text();

const digestAll = async (buffer) =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(ALGORITHMS).map(async ([key, { name }]) => [
        key,
        new Uint8Array(await crypto.subtle.digest(name, buffer)),
      ]),
    ),
  );

// Concatenates all digests in the order of `ALGORITHMS`, 144 bytes in total.
const packDigests = (digests) => {
  const packed = new Uint8Array(
    Object.values(ALGORITHMS).reduce((sum, { bytes }) => sum + bytes, 0),
  );
  let offset = 0;
  for (const key of Object.keys(ALGORITHMS)) {
    packed.set(digests[key], offset);
    offset += ALGORITHMS[key].bytes;
  }
  return packed;
};

const unpackDigests = (packed) => {
  const digests = {};
  let offset = 0;
  for (const [key, { bytes }] of Object.entries(ALGORITHMS)) {
    digests[key] = packed.slice(offset, offset + bytes);
    offset += bytes;
  }
  if (offset !== packed.length) {
    throw new RangeError('Unexpected digest length');
  }
  return digests;
};

const isStylesheet = (src, contentType = '') =>
  /\bcss\b/.test(contentType) ||
  /\.css$/i.test(new URL(src, location.href).pathname);

const formatBytes = (bytes) =>
  bytes < 1024
    ? `${bytes.toLocaleString('en-US')} bytes`
    : `${(bytes / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KiB`;

const renderCopyButton = (label, value) =>
  `<button type="button" class="copy" data-label="${escapeHTML(label)}"
    data-value="${escapeHTML(value)}">${escapeHTML(label)}</button>`;

// Formats the tag the way Prettier would, one attribute per line.
const formatTag = (src, contentType, integrity) => {
  const attributes = (first) =>
    [first, `integrity="${integrity}"`, 'crossorigin="anonymous"']
      .map((attribute) => `  ${attribute}`)
      .join('\n');
  return isStylesheet(src, contentType)
    ? `<link\n${attributes(`rel="stylesheet"\n  href="${src}"`)}\n/>`
    : `<script\n${attributes(`src="${src}"`)}\n></script>`;
};

// The last hashed resource with the digests for every algorithm, so toggling
// an algorithm needs neither a fetch nor a rehash.
let current = null;

const renderError = (message) => {
  current = null;
  result.innerHTML = `<p class="error">${message}</p>`;
};

const render = async () => {
  const { src, contentType, bytes, digests, meta } = current;
  const hashes = selectedAlgorithms().map(
    (algorithm) => `${algorithm}-${digests[algorithm].toBase64()}`,
  );
  const tag = formatTag(src, contentType, hashes.join(' '));

  result.innerHTML = `
    <h2>HTML</h2>
    <pre><code class="language-html"></code></pre>
    <div class="buttons">
      ${renderCopyButton('Copy HTML', tag)}
      ${hashes
        .map((hash) =>
          renderCopyButton(`Copy ${ALGORITHMS[hash.slice(0, 6)].name}`, hash),
        )
        .join('')}
    </div>
    <p class="meta">${formatBytes(bytes)} ${meta}</p>`;
  result.querySelector('code').textContent = tag;
  await highlightAll({ root: result });
};

const hashURL = async (url) => {
  result.innerHTML = '<p class="status">Fetching and hashing…</p>';

  let response;
  try {
    response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    renderError(
      `Could not fetch <code>${escapeHTML(url)}</code>. The server most
      likely does not send an <code>Access-Control-Allow-Origin</code> header,
      which browsers require both for this tool and for cross-origin SRI.`,
    );
    return;
  }
  if (!response.ok) {
    renderError(
      `The server answered with HTTP ${response.status}
      ${escapeHTML(response.statusText)}.`,
    );
    return;
  }

  const buffer = await response.arrayBuffer();
  current = {
    src: url,
    contentType: response.headers.get('content-type') ?? '',
    bytes: buffer.byteLength,
    digests: await digestAll(buffer),
    meta: `hashed from <a href="${escapeHTML(url)}">${escapeHTML(url)}</a>.`,
  };
  await render();
};

const hashCode = async (code, src) => {
  const buffer = new TextEncoder().encode(code);
  current = {
    src: src || DEFAULT_SRC,
    bytes: buffer.byteLength,
    digests: await digestAll(buffer),
    meta: 'of pasted code hashed.',
  };
  await render();
};

const setSource = (source) => {
  for (const radio of sources) {
    radio.checked = radio.value === source;
  }
  for (const [key, panel] of Object.entries(panels)) {
    // A disabled fieldset also skips validation of its `required` fields.
    panel.disabled = panel.hidden = key !== source;
  }
};

const algorithmQuery = () =>
  serialize(new URLSearchParams({ algorithm: selectedAlgorithms().join(',') }));

const linkForCode = async (code, src) => {
  const fragment = new URLSearchParams();
  if (src) {
    fragment.set('src', src);
  }
  const compressed = toBase64Url(await compress(code));
  if (compressed.length <= MAX_CODE_LENGTH) {
    fragment.set('code', compressed);
  } else {
    fragment.set('bytes', current.bytes);
    fragment.set('digests', toBase64Url(packDigests(current.digests)));
  }
  return `?${algorithmQuery()}#${serialize(fragment)}`;
};

// Restores the state from the link. URLs live in the query, pasted code lives
// in the fragment, so it never reaches a server.
const load = async () => {
  const params = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const algorithms = parseAlgorithms(params);
  for (const checkbox of checkboxes) {
    checkbox.checked = algorithms.includes(checkbox.value);
  }

  const url = params.get('url');
  if (fragment.has('code') || fragment.has('digests')) {
    setSource('code');
    srcInput.value = fragment.get('src') ?? '';
    try {
      if (fragment.has('code')) {
        codeInput.value = await decompress(fromBase64Url(fragment.get('code')));
        await hashCode(codeInput.value, srcInput.value);
      } else {
        codeInput.value = '';
        current = {
          src: srcInput.value || DEFAULT_SRC,
          bytes: Number(fragment.get('bytes')) || 0,
          digests: unpackDigests(fromBase64Url(fragment.get('digests'))),
          meta: `of code hashed. The code was too long for this link, so the
            link stores only its hashes.`,
        };
        await render();
      }
    } catch {
      renderError('This link contains damaged code or hashes.');
    }
  } else if (url) {
    setSource('url');
    urlInput.value = url;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      renderError(`<code>${escapeHTML(url)}</code> is not a valid URL.`);
      return;
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      renderError('Only <code>http:</code> and <code>https:</code> URLs work.');
      return;
    }
    await hashURL(parsed.href);
  } else {
    setSource('url');
    current = null;
    result.innerHTML = '';
    urlInput.focus();
  }
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (panels.url.disabled) {
    const src = srcInput.value.trim();
    await hashCode(codeInput.value, src);
    history.pushState(null, '', await linkForCode(codeInput.value, src));
  } else {
    const params = new URLSearchParams({ url: urlInput.value.trim() });
    history.pushState(null, '', `?${serialize(params)}&${algorithmQuery()}`);
    await load();
  }
});

form.addEventListener('change', async (event) => {
  if (event.target.name === 'source') {
    setSource(event.target.value);
    (event.target.value === 'url' ? urlInput : codeInput).focus();
    return;
  }
  if (event.target.name !== 'algorithm') {
    return;
  }
  // Keeps at least one algorithm, then syncs the output and the link.
  if (!selectedAlgorithms().length) {
    event.target.checked = true;
    return;
  }
  const params = new URLSearchParams(location.search);
  params.set('algorithm', selectedAlgorithms().join(','));
  history.replaceState(null, '', `?${serialize(params)}${location.hash}`);
  if (current) {
    await render();
  }
});

result.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy');
  if (!button) {
    return;
  }
  try {
    await navigator.clipboard.writeText(button.dataset.value);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Failed';
  }
  setTimeout(() => {
    button.textContent = button.dataset.label;
  }, 1500);
});

window.addEventListener('popstate', load);

load();
