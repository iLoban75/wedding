/* Проверка кода и расшифровка приглашения.
   Один и тот же файл работает и в браузере, и в Node (так мы проверяем сборку тем же кодом). */
(function (root) {
  'use strict';

  // Если гость набирает код на русской раскладке, возвращаем буквы с тех же клавиш английской раскладки.
  const LAYOUT = {
    'й': 'Q', 'ц': 'W', 'у': 'E', 'к': 'R', 'е': 'T', 'н': 'Y', 'г': 'U', 'ш': 'I', 'щ': 'O', 'з': 'P',
    'ф': 'A', 'ы': 'S', 'в': 'D', 'а': 'F', 'п': 'G', 'р': 'H', 'о': 'J', 'л': 'K', 'д': 'L',
    'я': 'Z', 'ч': 'X', 'с': 'C', 'м': 'V', 'и': 'B', 'т': 'N', 'ь': 'M'
  };

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // «abcd-ef12 3456» -> «ABCDEF123456»
  function normalize(raw) {
    return String(raw)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[а-яё]/g, function (ch) { return LAYOUT[ch] || ''; })
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  }

  function fromBase64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function isSupported() {
    return !!(root.crypto && root.crypto.subtle);
  }

  // Имя файла с приглашением выводится из кода, но по имени код не восстановить
  async function fileIdFor(code) {
    const digest = await root.crypto.subtle.digest('SHA-256', encoder.encode('wedding-file:' + code));
    return toHex(digest).slice(0, 32);
  }

  async function decrypt(code, pack) {
    const subtle = root.crypto.subtle;
    const material = await subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey(
      { name: 'PBKDF2', salt: fromBase64(pack.salt), iterations: pack.iter, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(pack.iv) }, key, fromBase64(pack.ct));
    return JSON.parse(decoder.decode(plain));
  }

  root.WeddingCrypto = { normalize: normalize, fileIdFor: fileIdFor, decrypt: decrypt, isSupported: isSupported };
})(typeof self !== 'undefined' ? self : globalThis);
