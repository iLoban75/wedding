#!/usr/bin/env node
// Шифрует приглашения гостей. Запуск:  node build.mjs   (или  npm run build)
//
// Что делает:
//   1. читает private/guests.source.json (имена гостей и их коды — это НЕ публикуется);
//   2. каждому гостю без кода выдаёт случайный код и записывает его обратно в файл;
//   3. шифрует приглашение каждого гостя его же кодом (AES-256-GCM, ключ из кода через PBKDF2);
//   4. кладёт результат в папку data/ — вот её уже можно публиковать: без кода там ничего не прочитать.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash, randomBytes, randomInt, pbkdf2Sync, createCipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = process.env.GUESTS_FILE || path.join(ROOT, 'private', 'guests.source.json');
const OUT_DIR = path.join(ROOT, 'data');

const ITERATIONS = 250_000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // без I, L, O, 0, 1 — их легко перепутать
const CODE_LENGTH = 12;
const MIN_CODE_LENGTH = 10;

// Должна совпадать с normalize() в js/crypto.js (для латиницы и цифр)
const normalize = (code) => String(code).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');

function generateCode() {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s.match(/.{4}/g).join('-');
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// ---------- читаем и проверяем список гостей ----------
let config;
try {
  config = JSON.parse(readFileSync(SOURCE, 'utf8'));
} catch (e) {
  fail(`Не удалось прочитать ${SOURCE}\n  ${e.message}`);
}
if (!Array.isArray(config.guests) || config.guests.length === 0) {
  fail('В файле нет ни одного гостя (поле "guests").');
}

const seenIds = new Set();
const seenCodes = new Set();
let sourceChanged = false;

config.guests.forEach((g, i) => {
  const label = `Гость №${i + 1}`;
  if (!g.id || typeof g.id !== 'string') fail(`${label}: нужно поле "id" (любая уникальная строка, например "g002").`);
  if (seenIds.has(g.id)) fail(`${label}: id "${g.id}" уже использован.`);
  seenIds.add(g.id);
  if (!g.addressee || !g.greeting) fail(`${label} (${g.id}): нужны поля "addressee" и "greeting".`);

  if (!g.code) {
    g.code = generateCode();
    sourceChanged = true;
  }
  const normalized = normalize(g.code);
  if (normalized.length < MIN_CODE_LENGTH) {
    fail(`${label} (${g.id}): код слишком короткий или содержит не только латинские буквы и цифры. ` +
         `Нужно минимум ${MIN_CODE_LENGTH} символов A–Z и 0–9, иначе код легко подобрать. ` +
         `Оставьте поле "code" пустым — и код будет создан автоматически.`);
  }
  if (seenCodes.has(normalized)) fail(`${label} (${g.id}): такой код уже есть у другого гостя.`);
  seenCodes.add(normalized);

  if (!Number.isInteger(g.seats) || g.seats < 1) g.seats = 1;
});

if (sourceChanged) writeFileSync(SOURCE, JSON.stringify(config, null, 2) + '\n');

// ---------- шифруем ----------
function encrypt(code, payload) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(code, salt, ITERATIONS, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iter: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    // WebCrypto в браузере ждёт «шифртекст + тег» одним куском
    ct: Buffer.concat([body, tag]).toString('base64'),
  };
}

mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.json')) unlinkSync(path.join(OUT_DIR, f)); // убираем устаревшие приглашения
}

const baseUrl = String(config.siteUrl || '').replace(/\/?$/, '/');
const rows = [];

for (const g of config.guests) {
  const code = normalize(g.code);
  const fileId = createHash('sha256').update('wedding-file:' + code).digest('hex').slice(0, 32);

  const { code: _secret, ...payload } = g; // сам код внутрь приглашения не кладём
  writeFileSync(path.join(OUT_DIR, `${fileId}.json`), JSON.stringify(encrypt(code, payload)));

  rows.push({ guest: g.addressee, code: g.code, link: `${baseUrl}?code=${g.code}` });
}

// ---------- итог ----------
console.log(`\n✔ Готово: зашифровано приглашений — ${rows.length}. Файлы лежат в папке data/\n`);
for (const r of rows) {
  console.log(`  ${r.guest}`);
  console.log(`    код:    ${r.code}`);
  console.log(`    ссылка: ${r.link}\n`);
}
if (baseUrl.includes('ВАШ_ЛОГИН')) {
  console.log('  Подсказка: после публикации впишите настоящий адрес сайта в поле "siteUrl"');
  console.log('  файла private/guests.source.json и запустите сборку ещё раз — ссылки обновятся.\n');
}
