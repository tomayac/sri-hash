// SPDX-FileCopyrightText: 2026 Thomas Steiner
// SPDX-License-Identifier: Apache-2.0

import { highlightAll } from './vendor/microlighter/index.js';

const ALGORITHMS = {
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};
const DEFAULT_ALGORITHM = 'sha384';

const form = document.querySelector('form');
const urlInput = form.elements.url;
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

const toBase64 = (buffer) => {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

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

const isStylesheet = (url, contentType) =>
  /\bcss\b/.test(contentType) || /\.css$/i.test(new URL(url).pathname);

const formatBytes = (bytes) =>
  bytes < 1024
    ? `${bytes} bytes`
    : `${(bytes / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KiB`;

const renderCopyButton = (label, value) =>
  `<button type="button" class="copy" data-label="${escapeHTML(label)}"
    data-value="${escapeHTML(value)}">${escapeHTML(label)}</button>`;

// Formats the tag the way Prettier would, one attribute per line.
const formatTag = (url, contentType, integrity) => {
  const attributes = (first) =>
    [first, `integrity="${integrity}"`, 'crossorigin="anonymous"']
      .map((attribute) => `  ${attribute}`)
      .join('\n');
  return isStylesheet(url, contentType)
    ? `<link\n${attributes(`rel="stylesheet"\n  href="${url}"`)}\n/>`
    : `<script\n${attributes(`src="${url}"`)}\n></script>`;
};

// The last successfully fetched resource, so toggling an algorithm can rehash
// without fetching again.
let fetched = null;

const renderError = (message) => {
  fetched = null;
  result.innerHTML = `<p class="error">${message}</p>`;
};

const generate = async (url, algorithms) => {
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

  fetched = {
    url,
    buffer: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? '',
  };
  await render(algorithms);
};

const render = async (algorithms) => {
  const { url, buffer, contentType } = fetched;
  const hashes = await Promise.all(
    algorithms.map(async (algorithm) => ({
      algorithm,
      value: `${algorithm}-${toBase64(
        await crypto.subtle.digest(ALGORITHMS[algorithm], buffer),
      )}`,
    })),
  );
  const integrity = hashes.map(({ value }) => value).join(' ');
  const tag = formatTag(url, contentType, integrity);

  result.innerHTML = `
    <h2>HTML</h2>
    <pre><code class="language-html"></code></pre>
    <div class="buttons">
      ${renderCopyButton('Copy HTML', tag)}
      ${hashes
        .map(({ algorithm, value }) =>
          renderCopyButton(`Copy ${ALGORITHMS[algorithm]}`, value),
        )
        .join('')}
    </div>
    <p class="meta">
      ${formatBytes(buffer.byteLength)} hashed from
      <a href="${escapeHTML(url)}">${escapeHTML(url)}</a>.
    </p>`;
  result.querySelector('code').textContent = tag;
  await highlightAll({ root: result });
};

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

// Keeps the output and the bookmarkable URL in sync with the checkboxes.
form.addEventListener('change', async (event) => {
  if (event.target.name !== 'algorithm') {
    return;
  }
  const checked = checkboxes.filter((checkbox) => checkbox.checked);
  if (!checked.length) {
    event.target.checked = true;
    return;
  }
  const algorithms = checked.map((checkbox) => checkbox.value);
  const params = new URLSearchParams(location.search);
  params.set('algorithm', algorithms.join(','));
  history.replaceState(null, '', `?${params}`);
  if (fetched) {
    await render(algorithms);
  }
});

const params = new URLSearchParams(location.search);
const algorithms = parseAlgorithms(params);
for (const checkbox of checkboxes) {
  checkbox.checked = algorithms.includes(checkbox.value);
}

const url = params.get('url');
if (url) {
  urlInput.value = url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    renderError(`<code>${escapeHTML(url)}</code> is not a valid URL.`);
  }
  if (parsed && !/^https?:$/.test(parsed.protocol)) {
    renderError('Only <code>http:</code> and <code>https:</code> URLs work.');
  } else if (parsed) {
    generate(parsed.href, algorithms);
  }
} else {
  urlInput.focus();
}
