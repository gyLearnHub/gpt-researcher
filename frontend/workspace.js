// Presentation for the existing research workflow. No new research/chat backend.
const WorkspaceUI = (() => {
  const byId = (id) => document.getElementById(id);
  let rawReport = '';
  let reportTitle = '';
  let state = 'initial';
  let readerWidth = 0;
  let returnFocus = null;

  const toggleSettings = (open) => {
    byId('researchSettings').hidden = !open;
    byId('researchSettingsBtn').setAttribute('aria-expanded', String(open));
  };

  const toggleDownloads = (open) => {
    byId('downloadMenu').hidden = !open;
    byId('downloadMenuBtn').setAttribute('aria-expanded', String(open));
  };

  const safeReportPath = (path) => {
    if (typeof path !== 'string' || !path) return '';
    try {
      const url = new URL(path, window.location.origin + '/');
      return url.origin === window.location.origin && url.pathname.startsWith('/outputs/') ? url.href : '';
    } catch { return ''; }
  };

  const setDownloads = (links = {}) => {
    let missing = false;
    for (const [id, type] of [['downloadLinkWordTop', 'docx'], ['downloadLinkTop', 'pdf'], ['downloadLinkMdTop', 'md']]) {
      const link = byId(id);
      const path = safeReportPath(links[type]);
      link.classList.toggle('disabled', !path);
      link.setAttribute('aria-disabled', String(!path));
      link.tabIndex = path ? 0 : -1;
      if (path) link.href = path;
      else link.removeAttribute('href');
      link.title = path ? `下载 ${type.toUpperCase()} 报告` : '此格式未生成';
      missing ||= !path;
    }
    byId('downloadHint').hidden = !missing;
  };

  const resizeReader = (width) => {
    const sidebarWidth = byId('historyPanel').getBoundingClientRect().width;
    const maximum = Math.max(360, window.innerWidth - sidebarWidth - 380);
    readerWidth = Math.round(Math.min(maximum, Math.max(360, width)));
    byId('workspace').style.setProperty('--reader-width', `${readerWidth}px`);
    byId('reportResizeHandle').setAttribute('aria-valuemax', String(maximum));
    byId('reportResizeHandle').setAttribute('aria-valuenow', String(readerWidth));
  };

  const openReport = () => {
    if (!rawReport) return;
    returnFocus = document.activeElement;
    byId('reportPanel').hidden = false;
    resizeReader(readerWidth || window.innerWidth * .46);
    byId('closeReportBtn').focus();
  };

  const closeReport = () => {
    byId('reportPanel').hidden = true;
    toggleDownloads(false);
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus();
  };

  const setSidebar = (open) => {
    byId('historyPanel').hidden = !open;
    byId('historyPanelOpenBtn').hidden = open;
    if (!byId('reportPanel').hidden) resizeReader(readerWidth);
  };

  const setReport = (markdown) => {
    rawReport = markdown || '';
    const converter = new showdown.Converter({ tables: true, ghCodeBlocks: true, openLinksInNewWindow: true });
    const html = converter.makeHtml(rawReport);
    byId('reportContainer').innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
    const paragraphs = Array.from(byId('reportContainer').querySelectorAll('p'));
    const excerpt = paragraphs.map((p) => p.textContent.trim()).filter(Boolean).join(' ').slice(0, 180);
    byId('reportCardTitle').textContent = reportTitle || '研究报告';
    byId('reportCardExcerpt').textContent = excerpt || '点击打开完整研究报告。';
    const sources = new Set(Array.from(byId('reportContainer').querySelectorAll('a[href]'))
      .map((a) => a.href).filter((href) => /^https?:/.test(href)));
    byId('reportCardMeta').textContent = sources.size ? `研究报告 · ${sources.size} 个引用链接` : '研究报告';
    byId('reportCardArea').hidden = !rawReport;
    byId('reportSummary').textContent = state === 'in_progress' ? '正在撰写报告，可打开预览。' : '研究报告已整理完成，点击卡片查看全文。';
  };

  const setState = (nextState, title) => {
    state = nextState;
    byId('workspace').dataset.state = state;
    if (title !== undefined) reportTitle = title;
    byId('welcome').hidden = state !== 'initial';
    byId('researchContent').hidden = state === 'initial';
    byId('conversationTitle').textContent = reportTitle || '新建研究';
    byId('userPrompt').textContent = reportTitle;
    byId('submitButton').disabled = state === 'in_progress' || state === 'loading';
    byId('researchSettingsBtn').disabled = state === 'in_progress';
    byId('task').disabled = state === 'in_progress';
    byId('researchForm').hidden = state === 'finished';
    byId('progressLabel').textContent = ({ in_progress: '正在搜集资料', finished: '研究已完成', history: '研究已完成', loading: '正在读取报告', error: '研究未完成，请查看过程' })[state] || '';
    byId('modernSpinner').classList.toggle('spinning', ['in_progress', 'loading'].includes(state));
    if (state === 'initial' || state === 'in_progress' || state === 'loading') {
      rawReport = '';
      byId('reportContainer').replaceChildren();
      byId('reportCardArea').hidden = true;
      byId('chatMessages').replaceChildren();
      byId('chatContainer').style.display = 'none';
      byId('researchProgress').open = false;
      closeReport();
      toggleSettings(false);
      setDownloads();
    }
    if (state === 'finished' || state === 'history') {
      byId('reportSummary').textContent = '研究报告已整理完成，点击卡片查看全文。';
    }
    if (state === 'error') byId('researchProgress').open = true;
  };

  const setProgress = (data) => {
    if (state !== 'in_progress' || data.content === 'error') return;
    const text = `${data.content || ''} ${data.output || ''}`;
    byId('progressLabel').textContent = /report|writing|撰写|报告/i.test(text) ? '正在撰写报告' : /scrap|browse|search|检索|搜索|搜集/i.test(text) ? '正在搜索资料' : '正在分析资料';
  };

  const init = () => {
    byId('researchSettingsBtn').addEventListener('click', () => toggleSettings(byId('researchSettings').hidden));
    byId('closeSettingsBtn').addEventListener('click', () => { toggleSettings(false); byId('researchSettingsBtn').focus(); });
    byId('downloadMenuBtn').addEventListener('click', () => toggleDownloads(byId('downloadMenu').hidden));
    byId('downloadMenu').addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (!link) return;
      if (link.getAttribute('aria-disabled') === 'true') event.preventDefault();
      else toggleDownloads(false);
    });
    byId('reportCard').addEventListener('click', openReport);
    byId('closeReportBtn').addEventListener('click', closeReport);
    byId('historyPanelToggle').addEventListener('click', () => setSidebar(false));
    byId('historyPanelOpenBtn').addEventListener('click', () => setSidebar(true));
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.download-control')) toggleDownloads(false);
      if (!event.target.closest('#researchSettings, #researchSettingsBtn')) toggleSettings(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!byId('downloadMenu').hidden) { toggleDownloads(false); byId('downloadMenuBtn').focus(); }
      else if (!byId('researchSettings').hidden) { toggleSettings(false); byId('researchSettingsBtn').focus(); }
      else if (!byId('reportPanel').hidden) closeReport();
    });
    byId('task').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        byId('researchForm').requestSubmit();
      }
    });
    byId('researchForm').addEventListener('invalid', (event) => {
      if (event.target.closest('#researchSettings')) toggleSettings(true);
    }, true);
    const handle = byId('reportResizeHandle');
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('resizing');
    });
    handle.addEventListener('pointermove', (event) => {
      if (handle.hasPointerCapture(event.pointerId)) resizeReader(window.innerWidth - event.clientX);
    });
    handle.addEventListener('pointerup', (event) => {
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    });
    handle.addEventListener('lostpointercapture', () => document.body.classList.remove('resizing'));
    handle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      resizeReader(event.key === 'Home' ? 360 : event.key === 'End' ? window.innerWidth : readerWidth + (event.key === 'ArrowLeft' ? 32 : -32));
    });
    window.addEventListener('resize', () => { if (!byId('reportPanel').hidden) resizeReader(readerWidth); });
    setDownloads();
  };

  return { init, setState, setReport, setProgress, setDownloads, safeReportPath, openReport, getReport: () => rawReport };
})();
