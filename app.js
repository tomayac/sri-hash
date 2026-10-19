// SPDX-FileCopyrightText: 2026 Thomas Steiner
// SPDX-License-Identifier: Apache-2.0

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

const renderCopyable = (label, value) => `
  <div class="copyable">
    <h2>${escapeHTML(label)}</h2>
    <div class="row">
      <pre><code>${escapeHTML(value)}</code></pre>
      <button type="button" class="copy" data-value="${escapeHTML(value)}">
        Copy
      </button>
    </div>
  </div>`;

const renderError = (message) => {
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

  const buffer = await response.arrayBuffer();
  const integrity = (
    await Promise.all(
      algorithms.map(
        async (algorithm) =>
          `${algorithm}-${toBase64(
            await crypto.subtle.digest(ALGORITHMS[algorithm], buffer),
          )}`,
      ),
    )
  ).join(' ');

  const attributes = `integrity="${integrity}" crossorigin="anonymous"`;
  const tag = isStylesheet(url, response.headers.get('content-type') ?? '')
    ? `<link rel="stylesheet" href="${url}" ${attributes}>`
    : `<script src="${url}" ${attributes}></script>`;

  result.innerHTML = `
    ${renderCopyable('Integrity', integrity)}
    ${renderCopyable('HTML', tag)}
    <p class="meta">
      ${formatBytes(buffer.byteLength)} hashed from
      <a href="${escapeHTML(url)}">${escapeHTML(url)}</a>.
    </p>`;
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
    button.textContent = 'Copy';
  }, 1500);
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
