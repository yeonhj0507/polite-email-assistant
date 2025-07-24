// contentScript.js

/**
 * Gmail Polite Rewrite Extension
 * - Compose 창 감지
 * - 버튼 삽입
 * - Space/Enter 키 입력 시마다 To/Subject/Body 자동 전송
 * - Background → suggestions 수신 → 팝업 표시 → 클릭 시 본문 교체
 */

let _lastSentBody = '';  // 마지막으로 전송된 본문 비교용

/**
 * 1) Gmail 본문 에디터 div를 찾습니다.
 *    - contenteditable="true"
 *    - 클래스 'editable', role="textbox", aria-label 키워드 등 활용
 */
function findGmailBodyDiv() {
  const all = Array.from(document.querySelectorAll('div[contenteditable="true"]'));

  // 1) 클래스 'editable' 우선
  let el = all.find(e => e.classList.contains('editable'));
  if (el) return el;

  // 2) role="textbox" 우선
  el = all.find(e => e.getAttribute('role') === 'textbox');
  if (el) return el;

  // 3) aria-label에 '메일 본문' 또는 'Message Body' 포함
  el = all.find(e => /(메일 본문|Message Body)/i.test(e.getAttribute('aria-label') || ''));
  if (el) return el;

  // 4) fallback: 마지막 요소
  return all.length ? all[all.length - 1] : null;
}

/**
 * 2) Compose 창 MutationObserver
 */
const composeObserver = new MutationObserver(muts => {
  for (const m of muts) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.getAttribute('role') === 'dialog') {
        // 렌더 지연 대응: 500ms 뒤에 본문, 필드 탐지
        setTimeout(() => {
          const bodyDiv = findGmailBodyDiv();
          if (!bodyDiv) {
            console.warn('❌ Compose body not found');
            return;
          }
          console.log('✅ bodyDiv found:', bodyDiv);

          const toField   = document.querySelector('[aria-label="To"]') 
                            || node.querySelector('[aria-label="받는 사람"]');
          const subjField = node.querySelector('input[name="subjectbox"]');

          injectSuggestionButton(node, toField, subjField);
          enableAutoOnKey(bodyDiv, toField, subjField);
        }, 500);
      }
    }
  }
});
composeObserver.observe(document.body, { childList: true, subtree: true });

/**
 * 3) 버튼 삽입 함수
 */
function injectSuggestionButton(composeNode, toField, subjectField) {
  if (composeNode.querySelector('#polite-rewrite-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'polite-rewrite-btn';
  btn.textContent = '✨ Polite';
  btn.style.cssText = `
    position: absolute; top: 8px; right: 8px;
    background: #1a73e8; color: #fff; border: none;
    border-radius: 4px; padding: 4px 8px;
    font-size: 12px; cursor: pointer; z-index: 1000;
  `;

  btn.onclick = () => {
    const bodyDiv = findGmailBodyDiv();
    const toList  = extractRecipients(toField);
    const subject = subjectField?.value.trim() ?? '';
    const body    = bodyDiv?.innerText.trim() ?? '';

    console.log('▶ Manual send content:', { to: toList, subject, body });
    chrome.runtime.sendMessage(
      { type: 'emailContent', to: toList, subject, body },
      resp => {
        if (chrome.runtime.lastError) {
          console.error('sendMessage error:', chrome.runtime.lastError);
        } else {
          console.log('◀ Background replied:', resp);
        }
      }
    );
  };

  composeNode.style.position = composeNode.style.position || 'relative';
  composeNode.appendChild(btn);
}

/**
 * 4) Space/Enter 키 입력 시마다 자동 전송
 */
function enableAutoOnKey(bodyDiv, toField, subjectField) {
  bodyDiv.addEventListener('keyup', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;

    const toList  = extractRecipients(toField);
    const subject = subjectField?.value.trim() ?? '';
    const body    = bodyDiv.innerText.trim();

    if (!body || body === _lastSentBody) return;
    _lastSentBody = body;

    console.log('▶ Key-triggered send:', { to: toList, subject, body });
    chrome.runtime.sendMessage(
      { type: 'emailContent', to: toList, subject, body },
      resp => {
        if (chrome.runtime.lastError) {
          console.error('sendMessage error:', chrome.runtime.lastError);
        } else {
          console.log('◀ Background replied:', resp);
        }
      }
    );
  });
}

/**
 * 5) recipient 추출
 */
function extractRecipients(toField) {
  if (!toField) return [];
  const set = new Set();

  toField.querySelectorAll('input, textarea').forEach(el => {
    const v = el.value.trim();
    if (v) set.add(v);
  });
  toField.querySelectorAll('span[email]').forEach(chip => {
    const mail = chip.getAttribute('email');
    if (mail) set.add(mail);
  });

  return Array.from(set);
}

/**
 * 6) Background → suggestions 수신
 */
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'suggestions' && Array.isArray(msg.suggestions)) {
    displaySuggestions(msg.suggestions);
  } else if (msg.type === 'error') {
    alert('AI Error: ' + msg.error);
  }
});

/**
 * 7) 팝업 표시 + 클릭 적용
 */
function displaySuggestions(suggestions) {
  document.querySelector('#polite-popup')?.remove();

  const bodyDiv = findGmailBodyDiv();
  if (!bodyDiv) {
    alert('본문 영역을 찾을 수 없어 제안 적용이 불가합니다.');
    return;
  }

  const popup = document.createElement('div');
  popup.id = 'polite-popup';
  popup.style.cssText = `
    position: fixed; bottom: 40px; right: 40px;
    max-width: 360px; background: #fff;
    border: 1px solid #888; border-radius: 6px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    padding: 8px; font-size: 13px; z-index: 10000;
  `;

  const title = document.createElement('div');
  title.textContent = '💡 제안 (클릭하면 적용)';
  title.style.cssText = 'font-weight:bold; margin-bottom:6px;';
  popup.appendChild(title);

  suggestions.forEach(text => {
    const item = document.createElement('div');
    item.textContent = text;
    item.style.cssText = `
      margin:4px 0; padding:6px;
      background:#f1f3ff; border-radius:4px;
      cursor:pointer;
    `;
    item.onclick = () => {
      console.log('Applying to:', bodyDiv, text);
      bodyDiv.innerText = text;
      popup.remove();
    };
    popup.appendChild(item);
  });

  const closeBtn = document.createElement('div');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    position:absolute; top:4px; right:6px;
    cursor:pointer; font-weight:bold;
  `;
  closeBtn.onclick = () => popup.remove();
  popup.appendChild(closeBtn);

  document.body.appendChild(popup);
}
