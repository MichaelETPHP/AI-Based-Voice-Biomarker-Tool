'use strict';
/* API docs: base-URL injection, copy buttons, language tabs, active nav, mobile drawer. */
(() => {
  const BASE = window.location.origin;
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  };

  // 1. Fill this server's address into every example and copy target.
  $$('pre code, code.base-url').forEach((el) => { el.textContent = el.textContent.replaceAll('{{BASE}}', BASE); });
  $$('[data-copy]').forEach((el) => { el.dataset.copy = el.dataset.copy.replaceAll('{{BASE}}', BASE); });
  $$('.numbered code, .checks code').forEach((el) => { el.textContent = el.textContent.replaceAll('{{BASE}}', BASE); });

  // 1a. Syntax highlighting (Prism, self-hosted, manual mode), after {{BASE}} has been filled in.
  const PRISM_LANG = { bash: 'bash', http: 'http', json: 'json', python: 'python', javascript: 'javascript', xml: 'markup', apex: 'apex' };
  if (window.Prism) {
    $$('.code[data-lang]').forEach((block) => {
      const lang = PRISM_LANG[block.dataset.lang];
      const code = block.querySelector('pre code');
      if (!lang || !code || code.id === 'request-text') return;
      code.classList.add(`language-${lang}`);
      window.Prism.highlightElement(code);
    });
  }

  // 1b. Mobile tables render as cards: give every cell its column label.
  $$('.table-wrap table').forEach((table) => {
    const heads = $$('thead th', table).map((th) => th.textContent.trim());
    $$('tbody tr', table).forEach((tr) => {
      $$('td', tr).forEach((td, i) => { if (heads[i]) td.dataset.label = heads[i]; });
    });
  });

  // 2. Copy to clipboard
  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) { // insecure context fallback
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
  }
  $$('.code').forEach((block) => {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.innerHTML = '<i class="fa-regular fa-copy"></i><span>Copy</span>';
    btn.addEventListener('click', async () => {
      await copy(block.querySelector('code').textContent);
      btn.classList.add('done');
      btn.querySelector('span').textContent = 'Copied';
      btn.querySelector('i').className = 'fa-solid fa-check';
      setTimeout(() => {
        btn.classList.remove('done');
        btn.querySelector('span').textContent = 'Copy';
        btn.querySelector('i').className = 'fa-regular fa-copy';
      }, 1400);
    });
    block.appendChild(btn);
  });
  $$('.copy-mini').forEach((btn) => btn.addEventListener('click', async () => {
    await copy(btn.dataset.copy);
    showToast('URL copied');
  }));

  // 3. Language tabs (choice remembered across visits)
  const preferred = store.get('docs-lang') || 'curl';
  function selectTab(group, name) {
    const buttons = $$('[data-tab]', group);
    const target = buttons.some((b) => b.dataset.tab === name) ? name : buttons[0].dataset.tab;
    buttons.forEach((b) => {
      const on = b.dataset.tab === target;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $$('[data-panel]', group).forEach((p) => { p.hidden = p.dataset.panel !== target; });
  }
  $$('[data-tabs]').forEach((group) => {
    selectTab(group, preferred);
    $$('[data-tab]', group).forEach((b) => b.addEventListener('click', () => {
      store.set('docs-lang', b.dataset.tab);
      $$('[data-tabs]').forEach((g) => selectTab(g, b.dataset.tab));
    }));
  });

  // 4. Highlight the section in view
  const links = new Map($$('.nav-link').map((a) => [a.getAttribute('href').slice(1), a]));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.remove('active'));
      const a = links.get(e.target.id);
      if (a) a.classList.add('active');
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) observer.observe(s); });

  // 4b. "Get an API key" request form: opens the visitor's email app; nothing is sent to or stored on this server.
  const CONTACT = ['michaeltaye200', 'gmail.com'].join('@'); // API administrator (assembled at runtime to deter scrapers)
  $$('.contact-email').forEach((a) => { a.textContent = CONTACT; a.href = `mailto:${CONTACT}`; });

  const form = document.getElementById('key-form');
  const sent = document.getElementById('key-sent');
  const formError = document.getElementById('form-error');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const v = (k) => String(f.get(k) || '').trim();
      const problems = [];
      if (!v('name')) problems.push('your name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) problems.push('a valid work email');
      if (!v('company')) problems.push('your company');
      if (v('usecase').length < 20) problems.push('a short description of your use case (20+ characters)');
      if (!f.get('agree')) problems.push('agreement to the responsible use terms');
      if (problems.length) {
        formError.textContent = `Please add ${problems.join(', ')}.`;
        formError.hidden = false;
        formError.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      formError.hidden = true;

      const subject = `API key request: ${v('company')}`;
      const body = [
        'Hello,',
        '',
        'I would like an API key for the AI-Based Voice Biomarker Tool API.',
        '',
        `Name: ${v('name')}`,
        `Email: ${v('email')}`,
        `Company: ${v('company')}`,
        `Website: ${v('website') || '-'}`,
        `Integration platform: ${v('platform')}`,
        `Expected volume: ${v('volume')}`,
        '',
        'Use case:',
        v('usecase'),
        '',
        'I agree to obtain user consent, present results as screening signals (not a diagnosis),',
        'and follow the responsible use guidelines.',
        '',
        `Requested from: ${BASE}/developers/`,
      ].join('\n');

      document.getElementById('request-text').textContent = `To: ${CONTACT}\nSubject: ${subject}\n\n${body}`;
      form.hidden = true;
      sent.hidden = false;
      sent.scrollIntoView({ block: 'start', behavior: 'smooth' });
      window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
    document.getElementById('key-edit').addEventListener('click', () => {
      sent.hidden = true;
      form.hidden = false;
      form.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  // 5. Mobile navigation drawer
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const menuBtn = document.getElementById('menu-btn');
  function setMenu(open) {
    sidebar.classList.toggle('open', open);
    scrim.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : ''; // no background scroll behind the drawer
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  }
  menuBtn.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
  scrim.addEventListener('click', () => setMenu(false));
  $$('.nav-link').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
})();
