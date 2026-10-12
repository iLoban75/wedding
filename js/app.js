/* Логика страницы: вход по коду -> конверт -> приглашение. */
(function () {
  'use strict';

  var W = window.WEDDING;
  var Crypt = window.WeddingCrypto;
  var Fx = window.WeddingFx || { start: function () {}, burst: function () {} };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var guest = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function plural(n, forms) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  function show(name) {
    $$('.screen').forEach(function (s) { s.classList.toggle('is-active', s.id === 'screen-' + name); });
    document.body.setAttribute('data-screen', name);
    window.scrollTo(0, 0);
  }

  /* ---------- Общие тексты из config.js ---------- */
  function bindCommon() {
    var bride = W.couple.bride;
    var groom = W.couple.groom;
    $$('[data-bind="bride"]').forEach(function (n) { n.textContent = bride; });
    $$('[data-bind="groom"]').forEach(function (n) { n.textContent = groom; });
    $('#card-names').textContent = bride + ' & ' + groom;
    $('#card-date').textContent = W.dateText;
    $('#seal').textContent = bride.charAt(0) + '&' + groom.charAt(0);
    $('#hero-date').textContent = W.weekday + ' · ' + W.dateText;
  }

  /* ---------- 1. Ввод кода ---------- */
  var form = $('#code-form');
  var input = $('#code-input');
  var errorBox = $('#code-error');
  var submitBtn = $('#code-submit');

  function setError(message) {
    errorBox.textContent = message || '';
    errorBox.hidden = !message;
    if (message) {
      input.classList.remove('shake');
      void input.offsetWidth; // перезапуск анимации
      input.classList.add('shake');
    }
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    input.disabled = busy;
    submitBtn.classList.toggle('is-busy', busy);
  }

  // Красиво разбиваем код на группы: ABCD-EFGH-JKLM
  input.addEventListener('input', function () {
    var clean = Crypt.normalize(input.value).slice(0, 24);
    input.value = clean.replace(/(.{4})(?=.)/g, '$1-');
    if (!errorBox.hidden) setError('');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    tryOpen(input.value);
  });

  async function tryOpen(raw) {
    setError('');

    if (!Crypt.isSupported()) {
      setError('Откройте приглашение в современном браузере по защищённой ссылке (https).');
      return;
    }
    var code = Crypt.normalize(raw);
    if (code.length < 6) {
      setError('Введите, пожалуйста, код из нашего сообщения.');
      return;
    }

    setBusy(true);
    try {
      var id = await Crypt.fileIdFor(code);

      var response;
      try {
        response = await fetch('data/' + id + '.json', { cache: 'no-store' });
      } catch (networkError) {
        var ne = new Error('network');
        ne.kind = 'network';
        throw ne;
      }
      if (!response.ok) throw new Error('not found');

      var pack = await response.json();
      guest = await Crypt.decrypt(code, pack);
    } catch (e) {
      setBusy(false);
      setError(e && e.kind === 'network'
        ? 'Не удалось загрузить приглашение. Проверьте интернет и попробуйте ещё раз.'
        : 'Код не подошёл. Проверьте его, пожалуйста, и попробуйте ещё раз.');
      return;
    }
    setBusy(false);

    renderInvite();
    $('#env-to').textContent = guest.addressee;
    show('envelope');
  }

  /* ---------- 2. Конверт ---------- */
  var envelope = $('#envelope');
  var stage = $('#env-stage');
  var envelopeOpened = false;

  envelope.addEventListener('click', function () {
    if (envelopeOpened) return;
    envelopeOpened = true;

    envelope.classList.add('is-open');
    stage.classList.add('is-opened');

    var rect = envelope.getBoundingClientRect();
    setTimeout(function () {
      Fx.burst(rect.left + rect.width / 2, rect.top + rect.height * 0.55);
    }, 120);

    setTimeout(function () { stage.classList.add('is-leaving'); }, reduceMotion ? 500 : 2900);
    setTimeout(function () {
      show('invite');
      startInvite();
    }, reduceMotion ? 800 : 3800);
  });

  /* ---------- 3. Приглашение ---------- */
  function renderInvite() {
    // Персональный блок
    $('#g-title').textContent = guest.greeting;
    $('#g-text').textContent = W.intro;

    var note = $('#g-note');
    if (guest.note) { note.textContent = guest.note; note.hidden = false; }

    var seats = $('#g-seats');
    if (guest.seats) {
      seats.textContent = guest.seats === 1
        ? 'Мы забронировали для вас 1 место'
        : 'Мы забронировали для вас ' + guest.seats + ' ' + plural(guest.seats, ['место', 'места', 'мест']);
      seats.hidden = false;
    }

    // Дата и место
    $('#w-date').textContent = W.dateText;
    $('#w-time').textContent = W.weekday + ', начало в ' + W.timeText;
    $('#w-venue').textContent = W.venue.name;
    $('#w-address').textContent = W.venue.address;
    $('#w-map').href = W.venue.mapUrl || ('https://yandex.ru/maps/?text=' + encodeURIComponent(W.venue.address));

    // Программа
    var timeline = $('#timeline');
    timeline.textContent = '';
    W.program.forEach(function (item, i) {
      var li = el('li', 'timeline__item reveal');
      li.style.setProperty('--d', (i * 0.08).toFixed(2) + 's');
      li.appendChild(el('div', 'timeline__time', item.time));
      var body = el('div', 'timeline__body');
      body.appendChild(el('h4', 'timeline__title', item.title));
      if (item.text) body.appendChild(el('p', 'timeline__text', item.text));
      li.appendChild(body);
      timeline.appendChild(li);
    });

    // Дресс-код
    $('#dress-text').textContent = W.dress.text;
    var swatches = $('#swatches');
    swatches.textContent = '';
    W.dress.colors.forEach(function (c, i) {
      var s = el('div', 'swatch reveal');
      s.style.setProperty('--d', (i * 0.07).toFixed(2) + 's');
      var dot = el('i');
      dot.style.setProperty('--c', c.hex);
      s.appendChild(dot);
      s.appendChild(el('span', null, c.name));
      swatches.appendChild(s);
    });

    // Контакты
    var contacts = $('#contacts');
    contacts.textContent = '';
    W.contacts.forEach(function (c) {
      var a = el('a', 'contact');
      a.href = 'tel:' + c.phone.replace(/[^+\d]/g, '');
      a.appendChild(el('span', 'contact__role', c.role));
      a.appendChild(el('span', 'contact__name', c.name));
      a.appendChild(el('span', 'contact__phone', c.phone));
      contacts.appendChild(a);
    });

    setupRsvp();
  }

  var inviteStarted = false;
  function startInvite() {
    if (inviteStarted) return;
    inviteStarted = true;
    startCountdown();
    initReveal();
  }

  function initReveal() {
    var items = $$('#screen-invite .reveal, #screen-invite .ornament');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (n) { observer.observe(n); });
  }

  function startCountdown() {
    var box = $('#countdown');
    box.textContent = '';
    var target = new Date(W.dateISO).getTime();
    var timer;

    var cells = [0, 1, 2, 3].map(function () {
      var cell = el('div', 'countdown__cell');
      var num = el('span', 'countdown__num', '00');
      var label = el('span', 'countdown__label');
      cell.appendChild(num);
      cell.appendChild(label);
      box.appendChild(cell);
      return { num: num, label: label };
    });

    function tick() {
      var diff = target - Date.now();
      if (diff <= 0) {
        box.textContent = '';
        box.appendChild(el('p', 'countdown__done', 'Этот день настал!'));
        clearInterval(timer);
        return;
      }
      var s = Math.floor(diff / 1000);
      var d = Math.floor(s / 86400);
      var h = Math.floor((s % 86400) / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      var values = [d, h, m, sec];
      var labels = [
        plural(d, ['день', 'дня', 'дней']),
        plural(h, ['час', 'часа', 'часов']),
        plural(m, ['минута', 'минуты', 'минут']),
        plural(sec, ['секунда', 'секунды', 'секунд'])
      ];
      cells.forEach(function (c, i) {
        var text = String(values[i]).padStart(2, '0');
        if (c.num.textContent !== text) c.num.textContent = text;
        c.label.textContent = labels[i];
      });
    }

    tick();
    timer = setInterval(tick, 1000);
  }

  /* ---------- Ответ гостя (RSVP) ---------- */
  function setupRsvp() {
    var rsvpForm = $('#rsvp-form');
    var statusBox = $('#rsvp-status');
    var countField = $('#field-count');
    var countSelect = $('#rsvp-count');
    var comment = $('#rsvp-comment');
    var buttons = $$('[data-answer]', rsvpForm);
    var storageKey = 'wedding-rsvp:' + guest.id;
    var demo = !(W.rsvp && W.rsvp.endpoint);

    $('#rsvp-lead').textContent =
      'Пожалуйста, сообщите нам до ' + W.rsvp.deadlineText + ', сможете ли вы разделить с нами этот день.';

    countSelect.textContent = '';
    if (guest.seats > 1) {
      for (var n = 1; n <= guest.seats; n++) {
        var option = el('option', null, String(n));
        option.value = String(n);
        if (n === guest.seats) option.selected = true;
        countSelect.appendChild(option);
      }
      countField.hidden = false;
    }

    function showStatus(answer) {
      statusBox.textContent = '';
      statusBox.appendChild(document.createTextNode(answer === 'yes'
        ? 'Спасибо! Мы очень рады и будем вас ждать.'
        : 'Спасибо, что сообщили. Нам будет вас не хватать.'));
      if (demo) {
        statusBox.appendChild(el('span', 'rsvp__demo', 'Демо-режим: ответ пока никуда не отправляется.'));
      }
    }

    try {
      var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && saved.answer) showStatus(saved.answer);
    } catch (e) { /* хранилище недоступно — не страшно */ }

    buttons.forEach(function (button) {
      button.addEventListener('click', async function () {
        var answer = button.getAttribute('data-answer');
        buttons.forEach(function (b) { b.disabled = true; });
        button.classList.add('is-busy');
        statusBox.textContent = '';

        var body = {
          guestId: guest.id,
          guest: guest.addressee,
          attending: answer === 'yes',
          count: answer === 'yes' ? Number(countSelect.value || guest.seats || 1) : 0,
          comment: comment.value.trim(),
          sentAt: new Date().toISOString()
        };

        try {
          if (!demo) {
            var res = await fetch(W.rsvp.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error('rsvp failed');
          }
          try { localStorage.setItem(storageKey, JSON.stringify({ answer: answer })); } catch (e) { /* ок */ }
          showStatus(answer);
        } catch (e) {
          statusBox.textContent = 'Не получилось отправить ответ. Попробуйте ещё раз или напишите нам.';
        } finally {
          buttons.forEach(function (b) { b.disabled = false; });
          button.classList.remove('is-busy');
        }
      });
    });
  }

  /* ---------- Старт ---------- */
  bindCommon();
  Fx.start();

  // Ссылка вида ...?code=ABCD-EFGH-JKLM открывает приглашение сразу
  var urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) {
    input.value = Crypt.normalize(urlCode).slice(0, 24).replace(/(.{4})(?=.)/g, '$1-');
    tryOpen(urlCode);
  } else if (!window.matchMedia('(pointer: coarse)').matches) {
    input.focus();
  }
})();
