/**
 * Agentex Floating Panel — Content Script v4.1
 * 
 * Panda icon, fixed model selector, panel scaling, dark mode,
 * model sync via storage listener, sidebar/settings buttons.
 */

(function () {
    'use strict';
    if (document.getElementById('agentex-floating-root')) return;

    // ── SVG Icons ──
    const ICONS = {
        generate: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>',
        settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
        close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
        copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
        file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>',
        clipboard: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
        sidebar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
        bug: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3 3 0 016 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6zM12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M17.47 9c1.93-.2 3.53-1.9 3.53-4M6 13H2M22 13h-4M6 17H2M22 17h-4"/></svg>',
    };

    const ICON_URL = chrome.runtime.getURL('icons/icon48.png');

    // ── Panel HTML ──
    const PANEL_HTML = `
<div id="ax-panel" class="ax-panel ax-collapsed">
  <button id="ax-toggle" class="ax-toggle" title="Agentex"><img src="${ICON_URL}" alt="Agentex"></button>

  <div class="ax-body" id="ax-body">
    <div class="ax-header">
      <div class="ax-title"><img src="${ICON_URL}" alt="">Agentex</div>
      <div class="ax-actions">
        <span class="ax-status" id="ax-status">
          <span class="ax-dot" id="ax-dot"></span>
          <span id="ax-status-text">Ready</span>
        </span>
        <button class="ax-icon-btn" id="ax-sidebar-btn" title="Open Sidebar">${ICONS.sidebar}</button>
        <button class="ax-icon-btn" id="ax-settings-btn" title="Settings">${ICONS.settings}</button>
        <button class="ax-icon-btn" id="ax-close" title="Close">${ICONS.close}</button>
      </div>
    </div>

    <div class="ax-section">
      <label class="ax-label">${ICONS.clipboard} Job Description</label>
      <textarea id="ax-jd" class="ax-textarea" placeholder="Paste the job description here..." rows="5"></textarea>
    </div>

    <div class="ax-model-row">
      <select id="ax-model" class="ax-model-select"></select>
    </div>

    <div class="ax-gen-area">
      <button id="ax-generate" class="ax-btn-gen" disabled>
        <span id="ax-gen-icon">${ICONS.generate}</span>
        <span id="ax-gen-text">Generate Tailored Resume</span>
      </button>
      <div class="ax-progress" id="ax-progress" style="display:none">
        <div class="ax-progress-track"><div class="ax-progress-fill" id="ax-progress-fill"></div></div>
        <span class="ax-progress-text" id="ax-progress-text"></span>
      </div>
    </div>

    <div class="ax-output" id="ax-output" style="display:none">
      <div class="ax-output-header">
        <div class="ax-tabs">
          <button class="ax-tab active" data-tab="raw">LaTeX</button>
          <button class="ax-tab" data-tab="pdf">PDF</button>
          <button class="ax-tab" data-tab="diff">Compare</button>
        </div>
        <div class="ax-dl-actions">
          <button class="ax-icon-btn" id="ax-dl-tex" title="Download .tex">${ICONS.file}</button>
          <button class="ax-icon-btn" id="ax-dl-pdf" title="Download PDF">${ICONS.download}</button>
          <button class="ax-icon-btn" id="ax-copy" title="Copy LaTeX">${ICONS.copy}</button>
          <button class="ax-btn-recompile" id="ax-recompile" title="Recompile edited LaTeX" style="display:none">Recompile</button>
        </div>
      </div>
      <div class="ax-tab-pane" id="ax-pane-raw"><textarea class="ax-code ax-code-edit" id="ax-code" spellcheck="false"></textarea></div>
      <div class="ax-tab-pane" id="ax-pane-pdf" style="display:none"><div id="ax-pdf-viewer"><p class="ax-empty">Switch to PDF tab after generating</p></div></div>
      <div class="ax-tab-pane" id="ax-pane-diff" style="display:none"><div id="ax-diff"><p class="ax-empty">Generate to see comparison</p></div></div>
    </div>

    <div class="ax-toasts" id="ax-toasts"></div>
    <div class="ax-resize-handle" id="ax-resize"></div>
  </div>
</div>`;

    // ── Inject ──
    const root = document.createElement('div');
    root.id = 'agentex-floating-root';
    const shadow = root.attachShadow({ mode: 'open' });

    // Load font
    if (!document.querySelector('link[href*="Source+Sans+Pro"]')) {
        const fl = document.createElement('link');
        fl.rel = 'stylesheet';
        fl.href = 'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@300;400;600;700&display=swap';
        document.head.appendChild(fl);
    }
    const sf = document.createElement('link');
    sf.rel = 'stylesheet';
    sf.href = 'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@300;400;600;700&display=swap';
    shadow.appendChild(sf);

    const sl = document.createElement('link');
    sl.rel = 'stylesheet';
    sl.href = chrome.runtime.getURL('content-panel.css');
    shadow.appendChild(sl);

    const c = document.createElement('div');
    c.innerHTML = PANEL_HTML;
    shadow.appendChild(c);
    document.body.appendChild(root);

    // ── Start hidden — only show when enabled from side panel ──
    root.style.display = 'none';
    let panelEnabled = false;

    // ── State ──
    let state = {
        expanded: false, generating: false,
        tailoredLatex: null, originalLatex: null,
        jd: '', hasApiKey: false, hasResume: false,
        provider: 'gemini', modelId: 'gemini-2.5-flash', darkMode: false,
    };

    const $ = s => shadow.querySelector(s);
    const panel = $('#ax-panel');
    const body = $('#ax-body');
    const jdInput = $('#ax-jd');
    const genBtn = $('#ax-generate');
    const genIcon = $('#ax-gen-icon');
    const genText = $('#ax-gen-text');
    const progressDiv = $('#ax-progress');
    const progressFill = $('#ax-progress-fill');
    const progressText = $('#ax-progress-text');
    const outputDiv = $('#ax-output');
    const codeEl = $('#ax-code');
    const recompileBtn = $('#ax-recompile');
    const dot = $('#ax-dot');
    const statusText = $('#ax-status-text');
    const modelSelect = $('#ax-model');

    // ── Dark mode ──
    async function loadTheme() {
        try {
            const d = await chrome.storage.local.get(['darkMode']);
            state.darkMode = d.darkMode ?? window.matchMedia('(prefers-color-scheme: dark)').matches;
            panel.classList.toggle('ax-dark', state.darkMode);
        } catch { }
    }

    // ── Position state (transform-based for GPU-accelerated 60fps) ──
    // We track position as {x, y} in viewport coords (top-left of panel).
    // CSS `transform: translate(x, y)` is used instead of left/top for smooth rendering.
    const _pos = { x: 0, y: 0 };
    const ICON_SIZE = 48;
    const EDGE_MARGIN = 32;

    function _initPosition() {
        // Start at bottom-right
        _pos.x = window.innerWidth - ICON_SIZE - EDGE_MARGIN;
        _pos.y = window.innerHeight - ICON_SIZE - EDGE_MARGIN;
        _applyPosition();
    }

    function _applyPosition(animate = false) {
        if (animate) {
            panel.classList.add('ax-snapping');
        } else {
            panel.classList.remove('ax-snapping');
        }
        panel.style.transform = `translate(${_pos.x}px, ${_pos.y}px)`;
    }

    function _clamp() {
        const isCollapsed = panel.classList.contains('ax-collapsed');
        const pw = isCollapsed ? ICON_SIZE : body.offsetWidth || 420;
        const ph = isCollapsed ? ICON_SIZE : body.offsetHeight || 400;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        _pos.x = Math.max(EDGE_MARGIN, Math.min(vw - pw - EDGE_MARGIN, _pos.x));
        _pos.y = Math.max(EDGE_MARGIN, Math.min(vh - ph - EDGE_MARGIN, _pos.y));
    }

    function _snapToEdge(animate = true) {
        const isCollapsed = panel.classList.contains('ax-collapsed');
        const vw = window.innerWidth;
        const elW = isCollapsed ? ICON_SIZE : (body.offsetWidth || 420);
        const centerX = _pos.x + elW / 2;
        // Snap to nearest horizontal edge
        if (centerX < vw / 2) {
            _pos.x = EDGE_MARGIN;
        } else {
            _pos.x = vw - elW - EDGE_MARGIN;
        }
        _clamp();
        _applyPosition(animate);
        // Remove animation class after transition
        if (animate) {
            const onEnd = () => { panel.classList.remove('ax-snapping'); panel.removeEventListener('transitionend', onEnd); };
            panel.addEventListener('transitionend', onEnd);
        }
    }

    // ── Drag & Resize ──
    const _drag = { active: false, startX: 0, startY: 0, origX: 0, origY: 0, moved: false };
    const _resize = { active: false, startX: 0, startY: 0, bodyW: 0, bodyH: 0 };

    function _startDrag(e) {
        _drag.active = true;
        _drag.moved = false;
        _drag.startX = e.clientX;
        _drag.startY = e.clientY;
        _drag.origX = _pos.x;
        _drag.origY = _pos.y;
        panel.classList.add('ax-dragging');
        panel.classList.remove('ax-snapping');
        e.preventDefault();
    }

    // Toggle: supports drag with click fallback
    $('#ax-toggle').addEventListener('mousedown', _startDrag);
    $('#ax-toggle').addEventListener('click', () => {
        if (_drag.moved) { _drag.moved = false; return; }
        state.expanded = true;
        panel.classList.remove('ax-collapsed');
        // Reposition so expanded panel stays in viewport
        _clamp();
        _applyPosition(true);
        refreshStatus();
    });

    $('#ax-close').addEventListener('click', () => {
        state.expanded = false;
        panel.classList.add('ax-collapsed');
        // Snap icon back to edge
        setTimeout(() => _snapToEdge(true), 10);
    });

    // Header drag (expanded panel)
    shadow.querySelector('.ax-header').addEventListener('mousedown', (e) => {
        if (e.target.closest('.ax-actions')) return;
        _startDrag(e);
    });

    // Resize handle
    $('#ax-resize').addEventListener('mousedown', (e) => {
        _resize.active = true;
        _resize.startX = e.clientX;
        _resize.startY = e.clientY;
        _resize.bodyW = body.offsetWidth;
        _resize.bodyH = body.offsetHeight;
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
        if (_drag.active) {
            const dx = e.clientX - _drag.startX;
            const dy = e.clientY - _drag.startY;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) _drag.moved = true;
            _pos.x = _drag.origX + dx;
            _pos.y = _drag.origY + dy;
            _clamp();
            _applyPosition(false);
        }
        if (_resize.active) {
            const dx = e.clientX - _resize.startX;
            const dy = e.clientY - _resize.startY;
            body.style.width = Math.max(320, Math.min(800, _resize.bodyW + dx)) + 'px';
            body.style.maxHeight = Math.max(300, Math.min(window.innerHeight * 0.9, _resize.bodyH + dy)) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (_drag.active) {
            _drag.active = false;
            panel.classList.remove('ax-dragging');
            // Snap to nearest edge (both icon and expanded panel)
            _snapToEdge(true);
        }
        _resize.active = false;
    });

    // Keep panel in bounds on window resize
    window.addEventListener('resize', () => {
        _clamp();
        if (panel.classList.contains('ax-collapsed')) {
            _snapToEdge(false);
        }
        _applyPosition(false);
    });

    // ── Helper: safe sendMessage with stale-context recovery ──
    function safeSendMessage(msg) {
        return new Promise((resolve, reject) => {
            try {
                if (!chrome.runtime?.id) {
                    reject(new Error('Extension context invalidated'));
                    return;
                }
                chrome.runtime.sendMessage(msg, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    function handleExtensionError() {
        showToast(`Extension was reloaded. Refreshing page to reconnect...`, 'warning', 3000);
        setTimeout(() => location.reload(), 2000);
    }

    // ── Sidebar → open side panel (main view) ──
    $('#ax-sidebar-btn').addEventListener('click', () => {
        safeSendMessage({ type: 'OPEN_SIDE_PANEL', view: 'main' }).then(res => {
            if (res?.error) showToast(res.error, 'error');
        }).catch(() => {
            handleExtensionError();
        });
    });

    // ── Settings → open side panel (settings view) ──
    $('#ax-settings-btn').addEventListener('click', () => {
        safeSendMessage({ type: 'OPEN_SIDE_PANEL', view: 'settings' }).then(res => {
            if (res?.error) showToast(res.error, 'error');
        }).catch(() => {
            handleExtensionError();
        });
    });

    // ── Model selector — build from config message ──
    async function populateModels() {
        try {
            const models = await chrome.runtime.sendMessage({ type: 'GET_MODELS' });
            modelSelect.innerHTML = '';

            if (models?.gemini?.length) {
                const g = document.createElement('optgroup');
                g.label = 'Gemini';
                for (const m of models.gemini) {
                    const o = document.createElement('option');
                    o.value = `gemini:${m.id}`;
                    o.textContent = m.name;
                    g.appendChild(o);
                }
                modelSelect.appendChild(g);
            }

            if (models?.claude?.length) {
                const cl = document.createElement('optgroup');
                cl.label = 'Claude';
                for (const m of models.claude) {
                    const o = document.createElement('option');
                    o.value = `claude:${m.id}`;
                    o.textContent = m.name;
                    cl.appendChild(o);
                }
                modelSelect.appendChild(cl);
            }

            if (models?.groq?.length) {
                const g = document.createElement('optgroup');
                g.label = 'Groq';
                for (const m of models.groq) {
                    const o = document.createElement('option');
                    o.value = `groq:${m.id}`;
                    o.textContent = m.name;
                    g.appendChild(o);
                }
                modelSelect.appendChild(g);
            }

            if (models?.openrouter?.length) {
                const or = document.createElement('optgroup');
                or.label = 'OpenRouter';
                for (const m of models.openrouter) {
                    const o = document.createElement('option');
                    o.value = `openrouter:${m.id}`;
                    o.textContent = m.name;
                    or.appendChild(o);
                }
                const customOpt = document.createElement('option');
                customOpt.value = 'openrouter:custom';
                customOpt.textContent = 'Custom Model...';
                or.appendChild(customOpt);
                modelSelect.appendChild(or);
            }

            // Restore
            const stored = await chrome.storage.local.get(['selectedModel']);
            if (stored.selectedModel) {
                modelSelect.value = stored.selectedModel;
            }
        } catch (e) {
            modelSelect.innerHTML = '<option value="gemini:gemini-2.5-flash">Gemini 2.5 Flash</option>';
        }
    }

    modelSelect.addEventListener('change', () => {
        const idx = modelSelect.value.indexOf(':');
        const provider = modelSelect.value.substring(0, idx);
        let modelId = modelSelect.value.substring(idx + 1);

        if (provider === 'openrouter' && modelId === 'custom') {
            const customId = prompt("Enter custom OpenRouter model ID (e.g. microsoft/wizardlm-2-8x22b):");
            if (customId && customId.trim() !== '') {
                modelId = customId.trim();
                let existingOpt = Array.from(modelSelect.options).find(o => o.value === `openrouter:${modelId}`);
                if (!existingOpt) {
                    existingOpt = document.createElement('option');
                    existingOpt.value = `openrouter:${modelId}`;
                    existingOpt.textContent = modelId + ' (Custom)';
                    const orGroup = modelSelect.querySelector('optgroup[label="OpenRouter"]');
                    if (orGroup) {
                        orGroup.insertBefore(existingOpt, orGroup.lastElementChild);
                    } else {
                        modelSelect.appendChild(existingOpt);
                    }
                }
                modelSelect.value = existingOpt.value;
            } else {
                chrome.storage.local.get(['selectedModel'], (data) => {
                    if (data.selectedModel) modelSelect.value = data.selectedModel;
                });
                return;
            }
        }

        state.provider = provider;
        state.modelId = modelId;
        chrome.runtime.sendMessage({ type: 'SET_MODEL', provider, modelId }).catch(() => { });
    });

    // ── Storage sync — react to model changes from sidebar ──
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.selectedModel) {
            const newVal = changes.selectedModel.newValue;
            if (newVal && modelSelect.value !== newVal) {
                let restoredVal = newVal;
                const idx = newVal.indexOf(':');
                const p = newVal.substring(0, idx);
                const m = newVal.substring(idx + 1);

                if (p === 'openrouter') {
                    const hasOption = Array.from(modelSelect.options).some(opt => opt.value === newVal);
                    if (!hasOption && m !== 'custom') {
                        let existingOpt = document.createElement('option');
                        existingOpt.value = newVal;
                        existingOpt.textContent = m + ' (Custom)';
                        const orGroup = modelSelect.querySelector('optgroup[label="OpenRouter"]');
                        if (orGroup) {
                            orGroup.insertBefore(existingOpt, orGroup.lastElementChild);
                        }
                    }
                }

                modelSelect.value = restoredVal;
                state.provider = p;
                state.modelId = m;
            }
        }
        if (changes.darkMode) {
            state.darkMode = changes.darkMode.newValue;
            panel.classList.toggle('ax-dark', state.darkMode);
        }
        if (changes.resumeLatex || changes.geminiApiKey || changes.claudeApiKey) {
            refreshStatus();
        }
    });

    // ── JD Input ──
    let saveTimer = null;
    jdInput.addEventListener('input', () => {
        state.jd = jdInput.value;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'SAVE_JD', jd: jdInput.value });
        }, 500);
        updateGenBtn();
    });

    // ── Generate ──
    genBtn.addEventListener('click', async () => {
        if (state.generating) return;
        const jd = jdInput.value.trim();
        if (!jd) { showToast('Paste a job description first.', 'warning'); return; }

        state.generating = true;
        updateGenBtn();
        showProgress('Starting...');

        try {
            const result = await chrome.runtime.sendMessage({
                type: 'GENERATE_RESUME', jobDescription: jd
            });
            if (result.error) throw new Error(result.error);

            state.tailoredLatex = result.tailoredLatex;
            showOutput(result.tailoredLatex);
            body.classList.add('ax-expanded');
            // Re-clamp so expanded panel stays in viewport
            setTimeout(() => { _clamp(); _applyPosition(true); }, 50);
            showToast('Resume tailored successfully.', 'success');
        } catch (error) {
            showToast(error.message || 'Generation failed.', 'error');
        } finally {
            state.generating = false;
            updateGenBtn();
            hideProgress();
        }
    });

    // ── Tabs ──
    shadow.querySelectorAll('.ax-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            shadow.querySelectorAll('.ax-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const id = tab.dataset.tab;
            shadow.querySelectorAll('.ax-tab-pane').forEach(p => p.style.display = 'none');
            $(`#ax-pane-${id}`).style.display = 'block';
            if (id === 'pdf' && state.tailoredLatex) compilePdf(state.tailoredLatex);
        });
    });

    // ── Downloads ──
    async function getDownloadName() {
        try {
            const d = await chrome.storage.local.get(['downloadName']);
            const raw = (d.downloadName || '').trim();
            return raw || 'tailored-resume';
        } catch { return 'tailored-resume'; }
    }

    $('#ax-dl-tex')?.addEventListener('click', async () => {
        if (!state.tailoredLatex) { showToast('No resume to download.', 'warning'); return; }
        const name = await getDownloadName();
        dlFile(state.tailoredLatex, `${name}.tex`, 'text/plain');
        showToast('LaTeX file downloaded.', 'success');
    });

    $('#ax-dl-pdf')?.addEventListener('click', async () => {
        if (!state.tailoredLatex) { showToast('No resume to download.', 'warning'); return; }
        showToast('Compiling PDF...', 'info');
        try {
            const r = await chrome.runtime.sendMessage({ type: 'COMPILE_PDF', latex: state.tailoredLatex });
            if (r.error) throw new Error(r.error);
            const blob = b64ToBlob(r.pdfBase64, 'application/pdf');
            const name = await getDownloadName();
            dlBlob(blob, `${name}.pdf`);
            showToast('PDF downloaded.', 'success');
        } catch (e) {
            showToast('PDF failed: ' + e.message, 'error');
        }
    });

    $('#ax-copy')?.addEventListener('click', () => {
        if (!state.tailoredLatex) return;
        navigator.clipboard.writeText(state.tailoredLatex);
        showToast('Copied to clipboard.', 'success');
    });

    // ── Editable LaTeX — track changes, show recompile ──
    let _lastGeneratedLatex = null;
    codeEl.addEventListener('input', () => {
        const edited = codeEl.value;
        // Keep state in sync so downloads/copy always use latest edits
        state.tailoredLatex = edited;
        const changed = edited !== _lastGeneratedLatex;
        recompileBtn.style.display = changed ? 'inline-flex' : 'none';
    });

    recompileBtn.addEventListener('click', async () => {
        const edited = codeEl.value.trim();
        if (!edited) { showToast('LaTeX is empty.', 'warning'); return; }
        state.tailoredLatex = edited;
        recompileBtn.style.display = 'none';
        showToast('Compiling updated PDF...', 'info');
        // Switch to PDF tab and compile
        shadow.querySelectorAll('.ax-tab').forEach(t => t.classList.remove('active'));
        const pdfTab = shadow.querySelector('.ax-tab[data-tab="pdf"]');
        if (pdfTab) pdfTab.classList.add('active');
        shadow.querySelectorAll('.ax-tab-pane').forEach(p => p.style.display = 'none');
        $('#ax-pane-pdf').style.display = 'block';
        await compilePdf(edited);
    });

    // ── Status ──
    async function refreshStatus() {
        try {
            const s = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
            state.hasApiKey = s.hasApiKey;
            state.hasResume = s.hasResume || s.hasStructuredResume;
            state.originalLatex = s.originalLatex;
            state.provider = s.provider || 'gemini';
            state.modelId = s.modelId || 'gemini-2.5-flash';

            if (s.jd && !jdInput.value) { jdInput.value = s.jd; state.jd = s.jd; }

            const modelName = s.modelName || state.modelId;
            statusText.textContent = state.hasApiKey ? modelName : 'No API key';
            dot.className = 'ax-dot ' + (state.hasApiKey ? 'ax-dot-ok' : 'ax-dot-err');

            updateGenBtn();
        } catch (e) {
            statusText.textContent = 'Error';
            dot.className = 'ax-dot ax-dot-err';
        }
    }

    function updateGenBtn() {
        const ok = !state.generating && state.hasApiKey && state.hasResume && jdInput.value.trim().length > 10;
        genBtn.disabled = !ok;

        if (state.generating) {
            genIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';
            genText.textContent = 'Generating...';
        } else if (!state.hasResume) {
            genIcon.innerHTML = ICONS.file;
            genText.textContent = 'Upload resume in sidebar';
        } else if (!state.hasApiKey) {
            genIcon.innerHTML = ICONS.settings;
            genText.textContent = 'Add API key in settings';
        } else {
            genIcon.innerHTML = ICONS.generate;
            genText.textContent = 'Generate Tailored Resume';
        }
    }

    // ── Output ──
    function showOutput(latex) {
        outputDiv.style.display = 'block';
        codeEl.value = latex;
        _lastGeneratedLatex = latex;
        recompileBtn.style.display = 'none';
        const diffEl = $('#ax-diff');
        if (state.originalLatex) {
            const oLen = state.originalLatex.length, nLen = latex.length;
            const pct = ((nLen - oLen) / oLen * 100).toFixed(1);
            diffEl.innerHTML = `<div class="ax-diff-stats">
        <div><span class="ax-stat-label">Original</span><span class="ax-stat-val">${oLen} chars</span></div>
        <div><span class="ax-stat-label">Tailored</span><span class="ax-stat-val">${nLen} chars</span></div>
        <div><span class="ax-stat-label">Change</span><span class="ax-stat-val">${pct > 0 ? '+' : ''}${pct}%</span></div>
      </div>`;
        }
    }

    async function compilePdf(latex) {
        const v = $('#ax-pdf-viewer');
        v.innerHTML = '<p class="ax-empty">Compiling PDF...</p>';
        try {
            const r = await chrome.runtime.sendMessage({ type: 'COMPILE_PDF', latex });
            if (r.error) throw new Error(r.error);
            const blob = b64ToBlob(r.pdfBase64, 'application/pdf');
            const url = URL.createObjectURL(blob);
            v.innerHTML = `<iframe src="${url}#zoom=FitH" class="ax-pdf-frame"></iframe>`;
        } catch (e) {
            v.innerHTML = `<p class="ax-empty ax-error">Failed: ${e.message}</p>`;
        }
    }

    // ── Progress ──
    let _dotsTimer = null, _dotsCount = 0;

    function showProgress(t) {
        progressDiv.style.display = 'flex';
        progressText.dataset.base = t;
        progressText.textContent = t;
        progressFill.style.width = '20%';
        progressFill.classList.add('ax-live');
        dot.classList.add('ax-dot-pulse');
        clearInterval(_dotsTimer);
        _dotsCount = 0;
        _dotsTimer = setInterval(() => {
            _dotsCount = (_dotsCount + 1) % 4;
            progressText.textContent = (progressText.dataset.base || '') + '.'.repeat(_dotsCount);
        }, 500);
    }

    function hideProgress() {
        progressDiv.style.display = 'none';
        progressFill.style.width = '0%';
        progressFill.classList.remove('ax-live');
        dot.classList.remove('ax-dot-pulse');
        clearInterval(_dotsTimer);
        _dotsTimer = null;
    }

    chrome.runtime.onMessage.addListener(msg => {
        if (msg.type === 'GENERATION_PROGRESS') {
            progressText.dataset.base = msg.message;
            _dotsCount = 0;
            const w = { validate: '15%', inventory: '25%', prompt: '40%', generate: '60%', clean: '75%', retry: '80%', done: '100%', error: '100%', fallback: '55%' };
            progressFill.style.width = w[msg.stage] || '50%';
        }

        // ── Panel visibility control (per-tab, from side panel via background) ──
        if (msg.type === 'ENABLE_PANEL') {
            panelEnabled = true;
            root.style.display = '';
            _initPosition();
            loadTheme();
            console.log('[Agentex] Panel enabled on this tab');
        }
        if (msg.type === 'DISABLE_PANEL') {
            panelEnabled = false;
            root.style.display = 'none';
            // Collapse panel when hiding so it starts collapsed when re-enabled
            state.expanded = false;
            panel.classList.add('ax-collapsed');
            console.log('[Agentex] Panel disabled on this tab');
        }
    });

    // ── Toasts ──
    function showToast(message, type = 'info', duration = 4000) {
        const toasts = $('#ax-toasts');
        const t = document.createElement('div');
        t.className = `ax-toast ax-toast-${type}`;
        t.textContent = message;
        const cb = document.createElement('button');
        cb.className = 'ax-toast-close';
        cb.innerHTML = ICONS.close;
        cb.onclick = () => t.remove();
        t.appendChild(cb);
        toasts.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duration);
    }

    // ── Utils ──
    function dlFile(c, n, m) { dlBlob(new Blob([c], { type: m }), n); }
    function dlBlob(b, n) { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = n; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); }
    function b64ToBlob(b, m) { const bin = atob(b); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: m }); }

    // ── Init ──
    // Panel starts hidden — position & theme are set when ENABLE_PANEL is received.
    // Only populate models and refresh status (background comms) eagerly.
    populateModels();
    setTimeout(() => refreshStatus(), 500);
    console.log('[Agentex] Panel injected (hidden until enabled from sidebar)');
})();
