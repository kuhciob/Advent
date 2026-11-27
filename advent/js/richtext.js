/* Безпечний рендер тексту комірок (без innerHTML — лише DOM-вузли й textContent).
   Розмітка (див. tools/advent_import.py):
     **жирний**  __курсив__  ||прихований||  [текст](url)  {winner}
     [[copy:КОД]]  [[copy:ТЕКСТ|Підпис]]     — кнопка копіювання
     окремим рядком: [[button:Підпис|url]] — велика кнопка;  ![опис](url) — зображення
     рядки з «•», «-», «—», «1.» — списки; порожній рядок — новий абзац
   Публічний API: window.AdventText.render(text, container, {winner, onCopy}) */
(function () {
  'use strict';

  var INLINE = [
    { type: 'copy', re: /\[\[copy:([^\]|]+?)(?:\|([^\]]+?))?\]\]/ },
    { type: 'link', re: /\[([^\]]+?)\]\(([^)\s]+)\)/ },
    { type: 'bold', re: /\*\*([^*]+?)\*\*/ },
    { type: 'italic', re: /__([^_]+?)__/ },
    { type: 'spoiler', re: /\|\|(.+?)\|\|/ },
    { type: 'winner', re: /\{winner\}/ },
    { type: 'url', re: /https?:\/\/[^\s<>()«»"]+[^\s<>()«»".,;:!?)]/ },
    { type: 'handle', re: /(^|[\s(])@([A-Za-z][A-Za-z0-9_]{4,31})\b/ }
  ];

  function safeUrl(url) {
    url = String(url || '').trim();
    if (/^(https?:|tg:|mailto:)/i.test(url)) return url;
    if (/^(\.\.?\/|\/|#)/.test(url)) return url;
    if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(url)) return 'https://' + url;
    return null;
  }

  // Посилання на Google Drive → пряме посилання на картинку
  function imageUrl(url) {
    var m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
    return safeUrl(url);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function makeLink(href, external) {
    var a = el('a', 'rt-link');
    a.href = href;
    if (external !== false && /^https?:|^tg:/i.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  function inline(text, parent, opts) {
    while (text) {
      var best = null;
      for (var i = 0; i < INLINE.length; i++) {
        if (opts.inLink && /^(link|url|handle|copy)$/.test(INLINE[i].type)) continue;
        var m = INLINE[i].re.exec(text);
        if (m && (!best || m.index < best.m.index)) best = { t: INLINE[i].type, m: m };
      }
      if (!best) { parent.appendChild(document.createTextNode(text)); return; }
      var m2 = best.m;
      var start = m2.index;
      var whole = m2[0];
      if (best.t === 'handle') { start += m2[1].length; whole = whole.slice(m2[1].length); }
      if (start > 0) parent.appendChild(document.createTextNode(text.slice(0, start)));
      text = text.slice(start + whole.length);

      var node;
      switch (best.t) {
        case 'bold': node = el('strong'); inline(m2[1], node, opts); break;
        case 'italic': node = el('em'); inline(m2[1], node, opts); break;
        case 'spoiler': node = spoiler(m2[1], opts); break;
        case 'winner':
          node = opts.winner ? el('strong', 'rt-winner', opts.winner) : el('span', 'rt-winner is-pending', 'ім’я оголосимо згодом');
          break;
        case 'copy': node = copyBtn(m2[1].trim(), m2[2], opts); break;
        case 'link':
          var href = safeUrl(m2[2]);
          if (!href) { node = document.createTextNode(m2[0]); break; }
          node = makeLink(href);
          inline(m2[1], node, { winner: opts.winner, onCopy: opts.onCopy, inLink: true });
          break;
        case 'url':
          node = makeLink(m2[0]); node.textContent = m2[0].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''); break;
        case 'handle':
          node = makeLink('https://t.me/' + m2[2]); node.textContent = '@' + m2[2]; break;
      }
      parent.appendChild(node);
    }
  }

  function spoiler(inner, opts) {
    var s = el('span', 'spoiler');
    s.setAttribute('role', 'button');
    s.setAttribute('tabindex', '0');
    s.setAttribute('aria-label', 'Прихований текст. Натисни, щоб показати');
    var content = el('span', 'spoiler-text');
    content.setAttribute('aria-hidden', 'true');
    inline(inner, content, opts);
    s.appendChild(content);
    function reveal(e) {
      if (s.classList.contains('is-revealed')) return;
      if (e) { e.preventDefault(); e.stopPropagation(); }
      s.classList.add('is-revealed');
      s.removeAttribute('role');
      s.removeAttribute('tabindex');
      s.removeAttribute('aria-label');
      content.removeAttribute('aria-hidden');
    }
    s.addEventListener('click', reveal, true);
    s.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') reveal(e); });
    return s;
  }

  function copyBtn(value, label, opts) {
    var b = el('button', label ? 'rt-copy rt-copy--labeled' : 'rt-copy');
    b.type = 'button';
    if (label) {
      b.appendChild(el('span', 'rt-copy-icon', '⧉'));
      b.appendChild(el('span', null, label.trim()));
      b.setAttribute('aria-label', label.trim());
    } else {
      b.appendChild(el('span', 'rt-copy-code', value));
      b.appendChild(el('span', 'rt-copy-icon', '⧉'));
      b.setAttribute('aria-label', 'Скопіювати ' + value);
    }
    b.addEventListener('click', function () { if (opts.onCopy) opts.onCopy(value, b); });
    return b;
  }

  var LIST_RE = /^\s*(?:([•\-—–])|(\d{1,2})[.)])\s*(.*)$/;

  function render(text, container, opts) {
    opts = opts || {};
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var para = null, list = null, listOrdered = false;

    function closeAll() { para = null; list = null; }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (!line.trim()) { closeAll(); return; }

      var img = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (img) {
        closeAll();
        var src = imageUrl(img[2]);
        if (!src) return;
        var fig = el('figure', 'rt-figure');
        var im = el('img');
        im.src = src; im.alt = img[1] || ''; im.loading = 'lazy'; im.decoding = 'async';
        fig.appendChild(im);
        container.appendChild(fig);
        return;
      }

      var btn = line.trim().match(/^\[\[button:([^|\]]+)\|([^\]]+)\]\]$/);
      if (btn) {
        closeAll();
        var href = safeUrl(btn[2]);
        if (!href) return;
        var a = makeLink(href);
        a.className = 'btn btn-primary rt-button';
        a.appendChild(el('span', null, btn[1].trim()));
        var wrap = el('p', 'rt-actions');
        wrap.appendChild(a);
        container.appendChild(wrap);
        return;
      }

      // Окремий рядок лише з кнопкою копіювання — по центру, як дія
      if (/^\s*\[\[copy:[^\]]+\]\]\s*$/.test(line)) {
        closeAll();
        var p0 = el('p', 'rt-actions');
        inline(line.trim(), p0, opts);
        container.appendChild(p0);
        return;
      }

      var li = line.match(LIST_RE);
      // «— » на початку рядка — пункт списку; але «-30%» чи «—текст» без пробілу в звичайному тексті теж пункт
      if (li && li[3]) {
        var ordered = !!li[2];
        if (!list || listOrdered !== ordered) {
          list = el(ordered ? 'ol' : 'ul', 'rt-list');
          if (ordered) list.start = parseInt(li[2], 10);
          listOrdered = ordered;
          container.appendChild(list);
        }
        para = null;
        var item = el('li');
        inline(li[3], item, opts);
        list.appendChild(item);
        return;
      }

      if (list && /^\s/.test(raw) && list.lastChild) {
        // продовження пункту списку з відступом
        list.lastChild.appendChild(el('br'));
        inline(line.trim(), list.lastChild, opts);
        return;
      }
      list = null;
      if (!para) {
        para = el('p', 'rt-p');
        container.appendChild(para);
      } else {
        para.appendChild(el('br'));
      }
      inline(line.trim(), para, opts);
    });
  }

  window.AdventText = { render: render, imageUrl: imageUrl };
})();
