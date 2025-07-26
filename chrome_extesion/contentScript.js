/**
 * Gmail Polite Rewrite Extension – sentence-level trigger (fixed)
 * --------------------------------------------------------------
 * 1) Compose 창 감지 → 버튼 삽입
 * 2) 완결 문장(온점·느낌표·물음표)마다 focus/context 전송
 * 3) 팝업 클릭 시 focus 부분만 교체
 */

/* ── 전역 상수/상태 ───────────────────────────── */
const PUNCT_KEYS  = ['.', '!', '?'];
const PUNCT_REGEX = /[.!?؟¡。？！]/;
const lastSentMap = new WeakMap();   // bodyDiv → 마지막 focus
let   lastTarget  = null;            // 팝업 적용 대상 div

/* ── 1. Compose 창 MutationObserver ───────────── */
const composeObserver = new MutationObserver(muts => {
  muts.forEach(m =>
    m.addedNodes.forEach(node => {
      if (node.nodeType === 1 && node.getAttribute('role') === 'dialog') {
        setTimeout(() => setupCompose(node), 500);  // 렌더 지연
      }
    }),
  );
});
composeObserver.observe(document.body, { childList: true, subtree: true });

/* ── 2. Compose 창 초기화 ─────────────────────── */
function setupCompose(dialog) {
  const bodyDiv = findGmailBodyDiv();
  if (!bodyDiv) return console.warn('❌ bodyDiv not found');

  const toField =
    dialog.querySelector('[aria-label="To"]') ||
    document.querySelector('[aria-label="To"]') ||    // 영문 UI
    dialog.querySelector('[aria-label="받는 사람"]');   // 한글 UI

  const subjField = dialog.querySelector('input[name="subjectbox"]');

  injectButton(dialog, toField, subjField, bodyDiv);
  enableSentenceTrigger(bodyDiv, toField, subjField);
}

/* ── 3. 본문 div 탐색 (항상 전역) ──────────────── */
function findGmailBodyDiv() {
  const all = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
  return (
    all.find(e => e.classList.contains('editable')) ||
    all.find(e => e.getAttribute('role') === 'textbox') ||
    all.find(e =>
      /(메일 본문|Message Body)/i.test(e.getAttribute('aria-label') || ''),
    ) ||
    all.pop() ||
    null
  );
}

/* ── 4. ✨ Polite 버튼 삽입 ───────────────────── */
function injectButton(dialog, toField, subjField, bodyDiv) {
  if (dialog.querySelector('#polite-rewrite-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'polite-rewrite-btn';
  btn.textContent = '✨ Polite';
  btn.style.cssText = `
    position:absolute; top:8px; right:8px; z-index:1000;
    background:#1a73e8; color:#fff; border:none; border-radius:4px;
    padding:4px 8px; font-size:12px; cursor:pointer;
  `;
  btn.onclick = () => sendEmail(bodyDiv, toField, subjField);

  dialog.style.position ||= 'relative';
  dialog.appendChild(btn);
}

/* ── 5. keyup → 완결 문장 감지 ───────────────── */
function enableSentenceTrigger(bodyDiv, toField, subjField) {
  bodyDiv.addEventListener('keyup', ev => {
    if (!PUNCT_KEYS.includes(ev.key)) return;

    const full = bodyDiv.innerText.trim();
    if (!full || !PUNCT_REGEX.test(full.slice(-1))) return;

    const sentences = full.split(/(?<=[.!?؟¡。？！])\s+/);
    if (!sentences.length) return;

    const focus = sentences.pop().trim();
    if (!focus || lastSentMap.get(bodyDiv) === focus) return;

    lastSentMap.set(bodyDiv, focus);
    lastTarget = bodyDiv;

    sendEmail(
      bodyDiv,
      toField,
      subjField,
      focus,
      sentences.join(' ').trim(),
    );
  });
}

/* ── 6. background로 메시지 전송 ──────────────── */
function sendEmail(bodyDiv, toField, subjField, focus = '', context = '') {
  chrome.runtime.sendMessage(
    {
      type: 'emailContent',
      to: extractRecipients(toField),
      subject: subjField?.value.trim() ?? '',
      body: bodyDiv.innerText.trim(),
      focus,
      context,
    },
    resp => {
      if (chrome.runtime.lastError) {
        console.error('sendMessage error:', chrome.runtime.lastError);
      } else {
        console.log('◀ background replied:', resp);
      }
    },
  );
}

/* ── 7. 받는 사람 추출 ───────────────────────── */
function extractRecipients(toField) {
  if (!toField) return [];
  const set = new Set();
  toField
    .querySelectorAll('input, textarea')
    .forEach(el => el.value.trim() && set.add(el.value.trim()));
  toField
    .querySelectorAll('span[email]')
    .forEach(chip => chip.getAttribute('email') && set.add(chip.getAttribute('email')));
  return [...set];
}

/* ── 8. background → suggestions 수신 ────────── */
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'suggestions' && Array.isArray(msg.suggestions)) {
    showPopup(msg.suggestions);
  } else if (msg.type === 'error') {
    alert('AI Error: ' + msg.error);
  }
});

/* ── 9. 팝업 표시 & focus 치환 ────────────────── */
function showPopup(list) {
  document.querySelector('#polite-popup')?.remove();
  const bodyDiv = lastTarget || findGmailBodyDiv();
  if (!bodyDiv) return alert('본문 영역을 찾지 못했습니다.');

  const popup = document.createElement('div');
  popup.id = 'polite-popup';
  popup.style.cssText = `
    position:fixed; bottom:40px; right:40px; max-width:360px; z-index:10000;
    background:#fff; border:1px solid #888; border-radius:6px;
    padding:8px; font-size:13px; box-shadow:0 2px 6px rgba(0,0,0,.2);
  `;
  popup.innerHTML =
    '<div style="font-weight:bold;margin-bottom:6px">💡 제안 (클릭하면 적용)</div>';

  list.forEach(text => {
    const item = document.createElement('div');
    item.textContent = text;
    item.style.cssText =
      'margin:4px 0; padding:6px; background:#f1f3ff; border-radius:4px; cursor:pointer;';
    item.onclick = () => {
      const full = bodyDiv.innerText.trim();
      const parts = full.split(/(?<=[.!?؟¡。？！])\s+/);
      if (parts.length) {
        parts[parts.length - 1] = text;
        bodyDiv.innerText = parts.join(' ') + ' ';
      }
      popup.remove();
    };
    popup.appendChild(item);
  });

  const close = document.createElement('div');
  close.textContent = '✕';
  close.style.cssText =
    'position:absolute; top:4px; right:6px; cursor:pointer; font-weight:bold;';
  close.onclick = () => popup.remove();
  popup.appendChild(close);

  document.body.appendChild(popup);
}