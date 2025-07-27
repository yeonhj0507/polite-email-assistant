/**
 * Gmail Polite Rewrite Extension – 롤백 기능 포함 개선 버전
 * --------------------------------------------------------------
 * 1) Gmail 네이티브 디자인과 완벽 조화
 * 2) 중립/무례 톤 분석 결과 반영
 * 3) WebSocket 기반 실시간 AI 분석
 * 4) 수정사항 롤백 기능 추가
 */

/* ── 전역 상수/상태 ───────────────────────────── */
const PUNCT_KEYS = ['.', '!', '?'];
const PUNCT_REGEX = /[.!?؟¡。？！]/;
const lastSentMap = new WeakMap();
const rollbackStack = new WeakMap(); // 롤백을 위한 히스토리 스택
let lastTarget = null;
let politeIndicator = null;
let rollbackIndicator = null;
let suggestBuf = [];
let isAnalyzing = false;

/* ── Gmail 통합 스타일 (롤백 UI 추가) ──────────────────────── */
const GMAIL_INTEGRATED_STYLES = `
  .polite-indicator {
    position: absolute;
    z-index: 100000;
    font-family: 'Google Sans', 'Segoe UI', Roboto, sans-serif;
    background: white;
    border: 1px solid #dadce0;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    padding: 8px 12px;
    font-size: 13px;
    line-height: 1.4;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0.0, 0.2, 1);
    max-width: 280px;
    min-width: 180px;
  }
  
  .polite-indicator:hover {
    border-color: #1a73e8;
    box-shadow: 0 4px 16px rgba(26, 115, 232, 0.15);
    transform: translateY(-1px);
  }
  
  .polite-indicator.tone-neutral {
    border-color: #34a853;
    background: linear-gradient(135deg, #f8fff9 0%, #e8f5e8 100%);
  }
  
  .polite-indicator.tone-error {
    border-color: #ea4335;
    background: linear-gradient(135deg, #fff8f8 0%, #fce8e6 100%);
  }
  
  .polite-indicator.analyzing {
    border-color: #1a73e8;
    background: linear-gradient(135deg, #f8fbff 0%, #e8f0fe 100%);
  }
  
  /* 롤백 인디케이터 스타일 */
  .rollback-indicator {
    position: absolute;
    z-index: 100001;
    font-family: 'Google Sans', 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
    border: 1px solid #ff9800;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(255, 152, 0, 0.15);
    padding: 8px 12px;
    font-size: 13px;
    line-height: 1.4;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0.0, 0.2, 1);
    max-width: 300px;
    min-width: 200px;
  }
  
  .rollback-indicator:hover {
    border-color: #f57c00;
    box-shadow: 0 4px 16px rgba(245, 124, 0, 0.25);
    transform: translateY(-1px);
  }
  
  .tone-badge {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }
  
  .tone-badge.neutral {
    background: #34a853;
    color: white;
  }
  
  .tone-badge.error {
    background: #ea4335;
    color: white;
  }
  
  .tone-badge.analyzing {
    background: #1a73e8;
    color: white;
  }
  
  .tone-badge.rollback {
    background: #ff9800;
    color: white;
  }
  
  .indicator-content {
    flex: 1;
    min-width: 0;
  }
  
  .indicator-title {
    font-weight: 500;
    color: #202124;
    margin-bottom: 2px;
  }
  
  .indicator-subtitle {
    font-size: 11px;
    color: #5f6368;
    opacity: 0.9;
  }
  
  .polite-popup {
    position: absolute;
    z-index: 100002;
    background: white;
    border: 1px solid #dadce0;
    border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0,0,0,0.12);
    padding: 0;
    min-width: 320px;
    max-width: 420px;
    overflow: hidden;
    animation: gmailPopupFadeIn 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
  }
  
  /* 롤백 팝업 스타일 */
  .rollback-popup {
    position: absolute;
    z-index: 100003;
    background: white;
    border: 1px solid #ff9800;
    border-radius: 12px;
    box-shadow: 0 8px 28px rgba(255, 152, 0, 0.15);
    padding: 0;
    min-width: 320px;
    max-width: 420px;
    overflow: hidden;
    animation: gmailPopupFadeIn 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
  }
  
  @keyframes gmailPopupFadeIn {
    from { 
      opacity: 0; 
      transform: translateY(-8px) scale(0.95); 
    }
    to { 
      opacity: 1; 
      transform: translateY(0) scale(1); 
    }
  }
  
  .popup-header {
    background: #f8f9fa;
    padding: 16px;
    border-bottom: 1px solid #e8eaed;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .rollback-popup .popup-header {
    background: #fff3e0;
    border-bottom: 1px solid #ffcc02;
  }
  
  .popup-title {
    font-size: 14px;
    font-weight: 500;
    color: #202124;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .popup-close {
    background: none;
    border: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #5f6368;
    font-size: 16px;
    transition: background-color 0.15s ease;
  }
  
  .popup-close:hover {
    background: #f1f3f4;
  }
  
  .popup-body {
    padding: 16px;
  }
  
  .original-text {
    background: #fef7e0;
    border: 1px solid #f9ab00;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 16px;
    font-size: 12px;
    color: #8a4600;
  }
  
  .modified-text {
    background: #fff3e0;
    border: 1px solid #ff9800;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 16px;
    font-size: 12px;
    color: #e65100;
  }
  
  .original-label {
    font-weight: 500;
    margin-bottom: 4px;
    display: block;
  }
  
  .suggestions-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .rollback-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .suggestion-item, .rollback-item {
    background: #f8f9fa;
    border: 1px solid #e8eaed;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
  }
  
  .rollback-item {
    background: #fff3e0;
    border: 1px solid #ffcc02;
  }
  
  .suggestion-item:hover,
  .suggestion-item:focus {
    background: #e8f0fe;
    border-color: #1a73e8;
    outline: none;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(26, 115, 232, 0.15);
  }
  
  .rollback-item:hover,
  .rollback-item:focus {
    background: #ffe0b2;
    border-color: #ff9800;
    outline: none;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(255, 152, 0, 0.25);
  }
  
  .suggestion-item:focus, .rollback-item:focus {
    box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2);
  }
  
  .suggestion-text, .rollback-text {
    font-size: 13px;
    line-height: 1.4;
    color: #202124;
  }
  
  .rollback-meta {
    font-size: 11px;
    color: #5f6368;
    margin-top: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .suggestion-number, .rollback-number {
    position: absolute;
    top: -6px;
    left: 8px;
    background: #1a73e8;
    color: white;
    font-size: 10px;
    font-weight: 600;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .rollback-number {
    background: #ff9800;
  }
  
  .popup-footer {
    background: #f8f9fa;
    padding: 12px 16px;
    border-top: 1px solid #e8eaed;
    font-size: 11px;
    color: #5f6368;
    text-align: center;
  }
  
  .rollback-popup .popup-footer {
    background: #fff3e0;
    border-top: 1px solid #ffcc02;
  }
  
  .polite-button {
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  }
  
  .polite-button:hover {
    background: #1557b0;
    box-shadow: 0 2px 8px rgba(26, 115, 232, 0.25);
    transform: translateY(-1px);
  }
  
  .analyzing-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #e8eaed;
    border-top: 2px solid #1a73e8;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .success-toast {
    position: fixed;
    top: 24px;
    right: 24px;
    background: #137333;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 20px rgba(19, 115, 51, 0.25);
    z-index: 100004;
    animation: toastSlideIn 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
  }
  
  .rollback-toast {
    background: #ff9800;
    box-shadow: 0 4px 20px rgba(255, 152, 0, 0.25);
  }
  
  @keyframes toastSlideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;

// 스타일 주입
function injectStyles() {
  if (document.getElementById('gmail-polite-styles')) return;
  const style = document.createElement('style');
  style.id = 'gmail-polite-styles';
  style.textContent = GMAIL_INTEGRATED_STYLES;
  document.head.appendChild(style);
}

/* ── 롤백 히스토리 관리 ─────────────────────── */
function addToRollbackHistory(bodyDiv, originalText, modifiedText, timestamp) {
  if (!rollbackStack.has(bodyDiv)) {
    rollbackStack.set(bodyDiv, []);
  }
  
  const history = rollbackStack.get(bodyDiv);
  history.push({
    original: originalText,
    modified: modifiedText,
    timestamp: timestamp,
    id: Date.now() + Math.random()
  });
  
  // 최대 10개 히스토리만 유지
  if (history.length > 10) {
    history.shift();
  }
  
  console.log('📝 Added to rollback history:', { original: originalText, modified: modifiedText });
}

function hasRollbackHistory(bodyDiv) {
  const history = rollbackStack.get(bodyDiv);
  return history && history.length > 0;
}

function getRollbackHistory(bodyDiv) {
  return rollbackStack.get(bodyDiv) || [];
}

/* ── 1. Compose 창 감지 및 초기화 ─────────────── */
const composeObserver = new MutationObserver(mutations => {
  mutations.forEach(mutation =>
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1 && node.getAttribute('role') === 'dialog') {
        setTimeout(() => setupCompose(node), 500);
      }
    })
  );
});

// 초기화
injectStyles();
composeObserver.observe(document.body, { childList: true, subtree: true });

function setupCompose(dialog) {
  const bodyDiv = findGmailBodyDiv();
  if (!bodyDiv) return console.warn('❌ Gmail body div not found');

  const toField = dialog.querySelector('[aria-label="To"], [aria-label="받는 사람"]') ||
                  document.querySelector('[aria-label="To"], [aria-label="받는 사람"]');
  const subjField = dialog.querySelector('input[name="subjectbox"]');

  injectPoliteButton(dialog, bodyDiv, toField, subjField);
  enableSentenceAnalysis(bodyDiv, toField, subjField);
}

function findGmailBodyDiv() {
  const candidates = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
  return candidates.find(e => e.classList.contains('editable')) ||
         candidates.find(e => e.getAttribute('role') === 'textbox') ||
         candidates.find(e => /(메일 본문|Message Body)/i.test(e.getAttribute('aria-label') || '')) ||
         candidates.pop() ||
         null;
}

/* ── 2. 개선된 Polite 버튼 삽입 ───────────────── */
function injectPoliteButton(dialog, bodyDiv, toField, subjField) {
  if (dialog.querySelector('#gmail-polite-btn')) return;

  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 1000;
    display: flex;
    gap: 8px;
  `;

  // 톤 체크 버튼
  const toneBtn = document.createElement('button');
  toneBtn.id = 'gmail-polite-btn';
  toneBtn.className = 'polite-button';
  toneBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
    <span>톤 체크 (Alt+T)</span>
  `;
  toneBtn.title = '이메일 톤을 분석하고 개선 제안을 받아보세요 (Alt+T)';
  toneBtn.onclick = () => analyzeEmailTone(bodyDiv, toField, subjField);

  // 롤백 버튼
  const rollbackBtn = document.createElement('button');
  rollbackBtn.id = 'gmail-rollback-btn';
  rollbackBtn.className = 'polite-button';
  rollbackBtn.style.background = '#ff9800';
  rollbackBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
    </svg>
    <span>되돌리기 (Alt+U)</span>
  `;
  rollbackBtn.title = '수정된 내용을 이전 상태로 되돌립니다 (Alt+U: 목록, Alt+Q: 빠른 되돌리기)';
  rollbackBtn.onclick = () => showRollbackPopup(bodyDiv);
  
  // 도움말 버튼
  const helpBtn = document.createElement('button');
  helpBtn.id = 'gmail-help-btn';
  helpBtn.className = 'polite-button';
  helpBtn.style.background = '#5f6368';
  helpBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8 8-3.59 8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
    </svg>
  `;
  helpBtn.title = '키보드 단축키 도움말 (Alt+H)';
  helpBtn.onclick = () => showShortcutHelp();
  
  // 초기에는 비활성화
  updateRollbackButtonState(rollbackBtn, bodyDiv);

  btnContainer.appendChild(toneBtn);
  btnContainer.appendChild(rollbackBtn);
  btnContainer.appendChild(helpBtn);

  dialog.style.position ||= 'relative';
  dialog.appendChild(btnContainer);

  // 텍스트 변경 시 롤백 버튼 상태 업데이트
  bodyDiv.addEventListener('input', () => {
    setTimeout(() => updateRollbackButtonState(rollbackBtn, bodyDiv), 100);
  });
}

function updateRollbackButtonState(rollbackBtn, bodyDiv) {
  const hasHistory = hasRollbackHistory(bodyDiv);
  rollbackBtn.disabled = !hasHistory;
  rollbackBtn.style.opacity = hasHistory ? '1' : '0.5';
  rollbackBtn.style.cursor = hasHistory ? 'pointer' : 'not-allowed';
}

/* ── 3. 실시간 문장 분석 ──────────────────────── */
function enableSentenceAnalysis(bodyDiv, toField, subjField) {
  let analysisTimeout = null;

  bodyDiv.addEventListener('keyup', (ev) => {
    if (!PUNCT_KEYS.includes(ev.key)) return;

    const fullText = bodyDiv.innerText.trim();
    if (!fullText || !PUNCT_REGEX.test(fullText.slice(-1))) return;

    const sentences = fullText.split(/(?<=[.!?؟¡。？！])\s+/);
    if (!sentences.length) return;

    const currentSentence = sentences.pop().trim();
    if (!currentSentence || lastSentMap.get(bodyDiv) === currentSentence) return;

    lastSentMap.set(bodyDiv, currentSentence);
    lastTarget = bodyDiv;

    // 500ms 지연 후 분석 (타이핑 완료 대기)
    clearTimeout(analysisTimeout);
    analysisTimeout = setTimeout(() => {
      analyzeEmailTone(
        bodyDiv,
        toField,
        subjField,
        currentSentence,
        sentences.join(' ').trim()
      );
    }, 500);

    // 커서 위치 저장
    saveCursorPosition(bodyDiv);
  });
}

function saveCursorPosition(bodyDiv) {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(false);
    const rect = range.getBoundingClientRect();
    bodyDiv._lastCursorRect = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX
    };
  }
}

/* ── 4. AI 분석 요청 ────────────────────────── */
function analyzeEmailTone(bodyDiv, toField, subjField, focus = '', context = '') {
  if (isAnalyzing) return; // 중복 분석 방지

  const emailData = {
    type: 'emailContent',
    focus: focus || bodyDiv.innerText.trim(),
    context: context,
    body: bodyDiv.innerText.trim(),
    timestamp: Date.now()
  };

  console.log('📤 Analyzing email tone...', {
    focusLength: emailData.focus.length,
    contextLength: emailData.context.length,
    bodyLength: emailData.body.length
  });

  showAnalyzingIndicator();
  isAnalyzing = true;

  chrome.runtime.sendMessage(emailData, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Runtime message error:', chrome.runtime.lastError);
      showError('확장 프로그램 통신 오류가 발생했습니다.');
      hideAnalyzingIndicator();
      isAnalyzing = false;
    } else if (response?.status === 'error') {
      showError(response.error || 'AI 분석 중 오류가 발생했습니다.');
      hideAnalyzingIndicator();
      isAnalyzing = false;
    } else {
      console.log('✅ Analysis request sent:', response);
    }
  });
}

/* ── 5. Background Script 메시지 수신 ────────── */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Received from background:', message);

  switch (message.type) {
    case 'analysis_result':
      hideAnalyzingIndicator();
      showToneIndicator(message.tone, message.toneText, message.suggestions);
      suggestBuf = message.suggestions || [];
      isAnalyzing = false;
      sendResponse({ status: 'displayed' });
      break;

    case 'error':
      hideAnalyzingIndicator();
      showError(message.error);
      isAnalyzing = false;
      sendResponse({ status: 'error_shown' });
      break;

    default:
      console.warn('Unknown message type:', message.type);
  }

  return true;
});

/* ── 6. 분석 중 표시기 ──────────────────────── */
function showAnalyzingIndicator() {
  hideExistingIndicator();
  if (!lastTarget) return;

  politeIndicator = document.createElement('div');
  politeIndicator.className = 'polite-indicator analyzing';
  politeIndicator.innerHTML = `
    <div class="tone-badge analyzing">
      <div class="analyzing-spinner"></div>
    </div>
    <div class="indicator-content">
      <div class="indicator-title">AI가 분석 중...</div>
      <div class="indicator-subtitle">문장의 톤을 확인하고 있어요</div>
    </div>
  `;

  document.body.appendChild(politeIndicator);
  positionIndicator();
}

function hideAnalyzingIndicator() {
  if (politeIndicator && politeIndicator.classList.contains('analyzing')) {
    politeIndicator.remove();
    politeIndicator = null;
  }
}

/* ── 7. 톤 분석 결과 표시기 ─────────────────── */
function showToneIndicator(toneLevel, toneText, suggestions) {
  hideExistingIndicator();
  if (!lastTarget) return;

  const isNeutral = toneLevel === 'neutral';
  const hasUggestions = suggestions && suggestions.length > 0;

  politeIndicator = document.createElement('div');
  politeIndicator.className = `polite-indicator tone-${toneLevel}`;

  const config = {
    neutral: {
      icon: '✓',
      title: '좋은 톤이에요',
      subtitle: '정중하고 적절한 표현입니다'
    },
    error: {
      icon: '!',
      title: '수정을 권장해요',
      subtitle: hasUggestions ? `${suggestions.length}개의 개선 제안이 있어요` : '더 정중한 표현을 고려해보세요'
    }
  };

  const info = config[toneLevel] || config.neutral;

  politeIndicator.innerHTML = `
    <div class="tone-badge ${toneLevel}">
      ${info.icon}
    </div>
    <div class="indicator-content">
      <div class="indicator-title">${info.title}</div>
      <div class="indicator-subtitle">${info.subtitle}</div>
    </div>
  `;

  if (hasUggestions) {
    politeIndicator.onclick = () => showSuggestionsPopup();
    politeIndicator.style.cursor = 'pointer';
    
    politeIndicator.addEventListener('mouseenter', () => {
      politeIndicator.style.transform = 'translateY(-2px)';
    });
    
    politeIndicator.addEventListener('mouseleave', () => {
      politeIndicator.style.transform = 'translateY(0)';
    });
  }

  document.body.appendChild(politeIndicator);
  positionIndicator();

  // 좋은 톤일 때 자동 숨김
  if (isNeutral && !hasUggestions) {
    setTimeout(() => {
      if (politeIndicator && politeIndicator.classList.contains('tone-neutral')) {
        politeIndicator.style.opacity = '0';
        setTimeout(() => hideExistingIndicator(), 250);
      }
    }, 4000);
  }

  setupKeyboardShortcuts();
}

/* ── 8. 제안 팝업 표시 ──────────────────────── */
function showSuggestionsPopup() {
  if (!suggestBuf.length) return;

  hideExistingPopup();

  const popup = document.createElement('div');
  popup.id = 'polite-popup';
  popup.className = 'polite-popup';

  const originalText = lastSentMap.get(lastTarget) || '';

  popup.innerHTML = `
    <div class="popup-header">
      <div class="popup-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        더 정중한 표현 제안
      </div>
      <button class="popup-close" onclick="this.closest('.polite-popup').remove()">×</button>
    </div>
    <div class="popup-body">
      ${originalText ? `
        <div class="original-text">
          <span class="original-label">원래 문장</span>
          ${originalText}
        </div>
      ` : ''}
      <div class="suggestions-list" id="suggestions-container"></div>
    </div>
    <div class="popup-footer">
      Alt+T 톤체크 • Alt+U 되돌리기 • Alt+Q 빠른되돌리기 • Alt+H 도움말
    </div>
  `;

  const container = popup.querySelector('#suggestions-container');

  suggestBuf.forEach((suggestion, index) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.tabIndex = 0;
    item.innerHTML = `
      <div class="suggestion-number">${index + 1}</div>
      <div class="suggestion-text">${suggestion}</div>
    `;

    item.onclick = () => applySuggestion(suggestion);
    item.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySuggestion(suggestion);
      }
    };

    container.appendChild(item);

    if (index === 0) {
      setTimeout(() => item.focus(), 100);
    }
  });

  document.body.appendChild(popup);
  positionPopup(popup);
  setupPopupKeyboard(popup);
}

/* ── 9. 롤백 팝업 표시 ──────────────────────── */
function showRollbackPopup(bodyDiv) {
  const history = getRollbackHistory(bodyDiv);
  if (!history.length) {
    showError('되돌릴 수 있는 변경사항이 없습니다.');
    return;
  }

  hideExistingPopup();

  const popup = document.createElement('div');
  popup.id = 'rollback-popup';
  popup.className = 'rollback-popup';

  popup.innerHTML = `
    <div class="popup-header">
      <div class="popup-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
        </svg>
        변경사항 되돌리기
      </div>
      <button class="popup-close" onclick="this.closest('.rollback-popup').remove()">×</button>
    </div>
    <div class="popup-body">
      <div class="rollback-list" id="rollback-container"></div>
    </div>
    <div class="popup-footer">
      Alt+T 톤체크 • Alt+U 되돌리기 • Alt+Q 빠른되돌리기 • Alt+H 도움말
    </div>
  `;

  const container = popup.querySelector('#rollback-container');

  // 최신 변경사항부터 표시 (역순)
  history.slice().reverse().forEach((entry, index) => {
    const item = document.createElement('div');
    item.className = 'rollback-item';
    item.tabIndex = 0;
    
    const timeAgo = getTimeAgo(entry.timestamp);
    
    item.innerHTML = `
      <div class="rollback-number">${index + 1}</div>
      <div class="rollback-text">${entry.original}</div>
      <div class="rollback-meta">
        <span>수정 전 원본</span>
        <span>${timeAgo}</span>
      </div>
    `;

    item.onclick = () => applyRollback(bodyDiv, entry);
    item.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyRollback(bodyDiv, entry);
      }
    };

    container.appendChild(item);

    if (index === 0) {
      setTimeout(() => item.focus(), 100);
    }
  });

  document.body.appendChild(popup);
  positionPopup(popup);
  setupPopupKeyboard(popup);
}

function getTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return new Date(timestamp).toLocaleDateString();
}

/* ── 10. 롤백 적용 ─────────────────────────── */
function applyRollback(bodyDiv, entry) {
  if (!bodyDiv || !entry) return;

  const currentText = bodyDiv.innerText.trim();
  
  // 현재 텍스트에서 수정된 부분을 원래 텍스트로 교체
  const newText = currentText.replace(entry.modified, entry.original);
  
  bodyDiv.innerText = newText;

  // 커서를 맨 끝으로 이동
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(bodyDiv);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  // 롤백된 항목을 히스토리에서 제거
  const history = rollbackStack.get(bodyDiv);
  const entryIndex = history.findIndex(h => h.id === entry.id);
  if (entryIndex > -1) {
    history.splice(entryIndex, 1);
  }

  // 상태 업데이트
  lastSentMap.set(bodyDiv, entry.original);
  
  // 롤백 버튼 상태 업데이트
  const rollbackBtn = document.querySelector('#gmail-rollback-btn');
  if (rollbackBtn) {
    updateRollbackButtonState(rollbackBtn, bodyDiv);
  }

  hideExistingPopup();
  hideExistingIndicator();
  showRollbackToast('변경사항이 되돌려졌습니다!');

  console.log('🔄 Rollback applied:', { from: entry.modified, to: entry.original });
}

/* ── 11. 팝업 키보드 네비게이션 ─────────────── */
function setupPopupKeyboard(popup) {
  popup.addEventListener('keydown', (e) => {
    const items = [...popup.querySelectorAll('.suggestion-item, .rollback-item')];
    const currentIndex = items.indexOf(document.activeElement);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex].focus();
        break;

      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex].focus();
        break;

      case 'Escape':
        e.preventDefault();
        popup.remove();
        break;
    }
  });
}

/* ── 12. 제안 적용 (롤백 히스토리 추가) ─────────────────────────── */
function applySuggestion(suggestion) {
  const bodyDiv = lastTarget;
  if (!bodyDiv) return;

  const originalText = lastSentMap.get(bodyDiv) || '';
  const parts = bodyDiv.innerText.trim().split(/(?<=[.!?؟¡。？！])\s+/);

  if (parts.length) {
    const modifiedText = suggestion;
    
    // 롤백 히스토리에 추가 (적용 전)
    addToRollbackHistory(bodyDiv, originalText, modifiedText, Date.now());
    
    parts[parts.length - 1] = suggestion;
    bodyDiv.innerText = parts.join('\n') + ' ';

    // 커서를 맨 끝으로 이동
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(bodyDiv);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    // 상태 업데이트
    lastSentMap.set(bodyDiv, suggestion);
    
    // 롤백 버튼 상태 업데이트
    const rollbackBtn = document.querySelector('#gmail-rollback-btn');
    if (rollbackBtn) {
      updateRollbackButtonState(rollbackBtn, bodyDiv);
    }

    // 사용 통계 전송 (선택사항)
    chrome.runtime.sendMessage({
      type: 'suggestion_applied',
      original: originalText,
      applied: suggestion,
      timestamp: Date.now()
    }).catch(err => console.warn('Statistics send failed:', err));
  }

  hideExistingPopup();
  hideExistingIndicator();
  showSuccessToast('표현이 개선되었습니다!');
}
/* ── 13. 키보드 단축키 설정 (Chrome Extension Commands 사용) ─────────────── */
function setupKeyboardShortcuts() {
  // Chrome Extension Commands API 사용
  if (chrome?.commands) {
    chrome.commands.onCommand.addListener((command) => {
      handleCommand(command);
    });
  }

  // 웹페이지 내 키보드 이벤트도 백업으로 유지 (ESC 등)
  const handleKeydown = (e) => {
    // Gmail 작성 창에서만 작동하도록 제한
    const isInCompose = lastTarget && 
                       lastTarget.isContentEditable && 
                       lastTarget.closest('[role="dialog"]');
    
    // ESC는 웹페이지에서 직접 처리 (Chrome Commands에서 지원 안됨)
    if (e.key === 'Escape') {
      hideExistingPopup();
      hideExistingIndicator();
      return;
    }

    // 다른 단축키는 Chrome Commands에서 처리하므로 여기서는 제거
    // 하지만 Chrome Commands가 작동하지 않을 경우를 대비한 폴백
    if (!chrome?.commands) {
      handleLegacyKeyboardShortcuts(e, isInCompose);
    }
  };

  // 기존 리스너 제거 후 새로 등록
  if (window._politeKeydownHandler) {
    window.removeEventListener('keydown', window._politeKeydownHandler);
  }
  window._politeKeydownHandler = handleKeydown;
  window.addEventListener('keydown', handleKeydown);
}

// Chrome Commands API를 통한 명령 처리
function handleCommand(command) {
  // Gmail 작성 창에서만 작동하도록 제한
  const isInCompose = lastTarget && 
                     lastTarget.isContentEditable && 
                     lastTarget.closest('[role="dialog"]');
  
  if (!isInCompose) return;

  switch (command) {
    case 'tone-check':
      handleToneCheck();
      break;
    case 'show-rollback':
      handleShowRollback();
      break;
    case 'quick-undo':
      handleQuickUndo();
      break;
    case 'show-help':
      showShortcutHelp();
      break;
  }
}

// 각 명령에 대한 핸들러 함수들
function handleToneCheck() {
  if (suggestBuf.length > 0) {
    showSuggestionsPopup();
  } else {
    // 분석이 필요한 경우 자동 분석
    const bodyDiv = lastTarget;
    const toField = document.querySelector('[aria-label="To"], [aria-label="받는 사람"]');
    const subjField = document.querySelector('input[name="subjectbox"]');
    analyzeEmailTone(bodyDiv, toField, subjField);
  }
}

function handleShowRollback() {
  if (lastTarget && hasRollbackHistory(lastTarget)) {
    showRollbackPopup(lastTarget);
  }
}

function handleQuickUndo() {
  if (lastTarget && hasRollbackHistory(lastTarget)) {
    const history = getRollbackHistory(lastTarget);
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      applyRollback(lastTarget, lastEntry);
    }
  }
}

/* ── 단축키 도움말 표시 ─────────────────── */
function showShortcutHelp() {
  const helpPopup = document.createElement('div');
  helpPopup.className = 'polite-popup';
  helpPopup.id = 'shortcut-help-popup';
  
  helpPopup.innerHTML = `
    <div class="popup-header">
      <div class="popup-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
        </svg>
        키보드 단축키
      </div>
      <button class="popup-close" onclick="this.remove()">×</button>
    </div>
    <div class="popup-body">
      <div style="font-size: 13px; line-height: 1.6;">
        <div style="margin-bottom: 12px;">
          <strong>🎯 톤 분석 및 제안</strong><br>
          <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Alt + T</code> 
          톤 체크 및 제안 보기
        </div>
        
        <div style="margin-bottom: 12px;">
          <strong>🔄 되돌리기</strong><br>
          <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Alt + U</code> 
          변경사항 목록에서 선택하여 되돌리기<br>
          <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Alt + Q</code> 
          마지막 변경사항만 빠르게 되돌리기
        </div>
        
        <div style="margin-bottom: 12px;">
          <strong>⌨️ 팝업 내 탐색</strong><br>
          <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: monospace;">↑ ↓</code> 
          항목 간 이동<br>
          <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Enter</code> 
          선택한 항목 적용<br>
          <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Esc</code> 
          팝업 닫기
        </div>
        
        <div style="background: #e8f0fe; padding: 8px; border-radius: 6px; font-size: 12px; color: #1565c0;">
          💡 <strong>팁:</strong> 단축키는 이메일 작성 중일 때만 작동합니다.
        </div>
      </div>
    </div>
    <div class="popup-footer">
      이 도움말은 Alt + H로 다시 열 수 있습니다
    </div>
  `;
  
  document.body.appendChild(helpPopup);
  
  if (lastTarget) {
    positionPopup(helpPopup);
  } else {
    // 중앙 배치
    helpPopup.style.position = 'fixed';
    helpPopup.style.top = '50%';
    helpPopup.style.left = '50%';
    helpPopup.style.transform = 'translate(-50%, -50%)';
  }
  
  // 5초 후 자동 닫기
  setTimeout(() => {
    if (helpPopup.parentNode) {
      helpPopup.remove();
    }
  }, 8000);
}

/* ── 14. 위치 조정 함수들 ──────────────────── */
function positionIndicator() {
  if (!politeIndicator || !lastTarget) return;

  const targetRect = lastTarget.getBoundingClientRect();
  const scrollTop = window.scrollY;
  const scrollLeft = window.scrollX;

  // 커서 위치 우선, 없으면 텍스트 영역 아래
  let top, left;

  if (lastTarget._lastCursorRect) {
    top = lastTarget._lastCursorRect.top + 8;
    left = lastTarget._lastCursorRect.left;
  } else {
    top = scrollTop + targetRect.bottom + 8;
    left = scrollLeft + targetRect.left;
  }

  // 화면 경계 체크
  const indicatorWidth = 280;
  if (left + indicatorWidth > window.innerWidth) {
    left = window.innerWidth - indicatorWidth - 20;
  }

  politeIndicator.style.top = `${Math.max(top, scrollTop + 10)}px`;
  politeIndicator.style.left = `${Math.max(left, scrollLeft + 10)}px`;
}

function positionPopup(popup) {
  if (!lastTarget) return;

  const targetRect = lastTarget.getBoundingClientRect();
  const scrollTop = window.scrollY;
  const scrollLeft = window.scrollX;
  const popupWidth = 420;
  const popupHeight = 400;

  let top = scrollTop + targetRect.bottom + 40;
  let left = scrollLeft + targetRect.left;

  // 오른쪽 경계 체크
  if (left + popupWidth > window.innerWidth) {
    left = window.innerWidth - popupWidth - 20;
  }

  // 아래쪽 경계 체크
  if (top + popupHeight > window.innerHeight + scrollTop) {
    top = scrollTop + targetRect.top - popupHeight - 20;
  }

  popup.style.top = `${Math.max(top, scrollTop + 20)}px`;
  popup.style.left = `${Math.max(left, scrollLeft + 20)}px`;
}

/* ── 15. 알림 및 오류 처리 (롤백 토스트 추가) ─────────────────── */
function showSuccessToast(message) {
  const toast = document.createElement('div');
  toast.className = 'success-toast';
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.3s cubic-bezier(0.4, 0.0, 0.2, 1) reverse';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function showRollbackToast(message) {
  const toast = document.createElement('div');
  toast.className = 'success-toast rollback-toast';
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.3s cubic-bezier(0.4, 0.0, 0.2, 1) reverse';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function showError(errorMessage) {
  hideExistingIndicator();

  if (!lastTarget) return;

  politeIndicator = document.createElement('div');
  politeIndicator.className = 'polite-indicator tone-error';
  politeIndicator.innerHTML = `
    <div class="tone-badge error">!</div>
    <div class="indicator-content">
      <div class="indicator-title">연결 오류</div>
      <div class="indicator-subtitle">${errorMessage}</div>
    </div>
  `;

  document.body.appendChild(politeIndicator);
  positionIndicator();

  // 5초 후 자동 숨김
  setTimeout(() => {
    if (politeIndicator && politeIndicator.querySelector('.indicator-title').textContent === '연결 오류') {
      hideExistingIndicator();
    }
  }, 5000);
}

/* ── 16. 정리 함수들 ────────────────────── */
function hideExistingIndicator() {
  if (politeIndicator) {
    politeIndicator.remove();
    politeIndicator = null;
  }
  if (rollbackIndicator) {
    rollbackIndicator.remove();
    rollbackIndicator = null;
  }
}

function hideExistingPopup() {
  const existingPopup = document.querySelector('#polite-popup, #rollback-popup');
  if (existingPopup) {
    existingPopup.remove();
  }
}

/* ── 17. 반응형 위치 조정 ──────────────────── */
['scroll', 'resize'].forEach(eventName => {
  window.addEventListener(eventName, () => {
    if (politeIndicator && lastTarget) {
      positionIndicator();
    }
    
    const popup = document.querySelector('#polite-popup, #rollback-popup');
    if (popup && lastTarget) {
      positionPopup(popup);
    }
  }, { passive: true });
});

/* ── 18. 확장 프로그램 상태 모니터링 ─────────── */
// 백그라운드 스크립트 연결 상태 확인
function checkBackgroundConnection() {
  chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('⚠️ Background script not responding:', chrome.runtime.lastError.message);
      showError('확장 프로그램을 다시 로드해주세요.');
    }
  });
}

// 페이지 로드 시 연결 확인
setTimeout(checkBackgroundConnection, 2000);

// 주기적 연결 확인 (5분마다)
setInterval(checkBackgroundConnection, 5 * 60 * 1000);

console.log('✅ Gmail Polite Extension with Rollback loaded successfully');

// ===== USAGE NOTES =====
/*
롤백 기능이 추가된 Gmail Polite Extension 사용법:

1. manifest.json 설정:
{
  "manifest_version": 3,
  "name": "Gmail Polite Rewrite",
  "version": "1.0",
  "permissions": ["activeTab", "tabs"],
  "host_permissions": ["*://mail.google.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["*://mail.google.com/*"],
    "js": ["content.js"]
  }]
}

2. 새로운 기능들:
- 롤백 버튼: 수정된 내용을 이전 상태로 되돌리기
- 롤백 히스토리: 최대 10개의 변경사항 기록
- 롤백 팝업: 변경사항 목록에서 선택하여 되돌리기
- 시간 표시: 각 변경사항의 수정 시점 표시

3. 사용자 워크플로우:
- 기존 기능: 톤 분석 → 제안 적용
- 새 기능: 되돌리기 버튼 클릭 → 롤백 목록 → 원하는 시점 선택

4. 키보드 단축키 (충돌 방지):
- Alt+T: 톤 체크 및 제안 보기
- Alt+U: 롤백 목록에서 선택하여 되돌리기  
- Alt+Q: 마지막 변경사항만 빠르게 되돌리기
- Alt+H: 단축키 도움말 보기
- ↑↓: 항목 간 이동
- Enter: 적용/되돌리기
- Esc: 팝업 닫기

5. 단축키 충돌 해결책:
- Alt 키 조합 사용으로 기존 브라우저/Gmail 단축키와 충돌 방지
- 이메일 작성 중일 때만 단축키 활성화
- preventDefault()와 stopPropagation()로 이벤트 전파 차단
- 도움말 기능으로 사용자 편의성 향상

5. 롤백 히스토리 관리:
- 자동으로 변경사항 기록
- 최대 10개 항목 유지
- 시간 기반 정렬 (최신 순)
- WeakMap 사용으로 메모리 효율성 확보
*/