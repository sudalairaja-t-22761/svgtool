/**
 * SpriteForge - Application Entry Point
 * Initializes all event handlers and bootstraps the app.
 */
(function (SF, $) {
  'use strict';

  var state = SF.state;
  var pendingUploadIconName = '';
  var pendingSingleUpload = null;
  var multiUploadSelection = [];
  var multiUploadFlow = 'multi';
  var _workspaceModalIconIndex = -1;
  var _docRightPanelHelpMarkup = '';
  var _workspaceCustomiseNode = null;
  var _workspaceCustomiseHome = null;
  var CATALYST_SPRITE_BASE = window.SF_SPRITE_URL_BASE || window.SF_CATALYST_API_BASE || '/server/spriteForgeJoin/';
  var AUTH_API_BASE = window.SF_CATALYST_API_BASE || CATALYST_SPRITE_BASE;
  var AUTH_ENABLED = !!window.SF_AUTH_ENABLED;
  var AUTH_STORAGE_KEY = window.SF_AUTH_STORAGE_KEY || 'sf_session_id';
  function _isLocalLikeHost() {
    var protocol = String(window.location.protocol || '').toLowerCase();
    var host = String(window.location.hostname || '').toLowerCase();
    if (protocol === 'file:') return true;
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    if (/\.local$/.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
    return false;
  }
  var IS_LOCAL_HOST = _isLocalLikeHost();
  var _deleteConfirmClicks = { saved: {}, library: {} };
  var _authAjaxPrefilterInstalled = false;

  function _isHostedAuthEnabled() {
    return AUTH_ENABLED;
  }

  function _getStoredSessionId() {
    try {
      return localStorage.getItem(AUTH_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function _setStoredSessionId(sessionId) {
    try {
      if (sessionId) localStorage.setItem(AUTH_STORAGE_KEY, sessionId);
      else localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) {}
  }

  function _setAuthState(sessionId, user, zohoProfile) {
    state.auth.enabled = AUTH_ENABLED;
    state.auth.isAuthenticated = !!sessionId;
    state.auth.sessionId = sessionId || '';
    state.auth.username   = (user && user.name)  || '';
    state.auth.useremail  = (user && user.email) || '';
    state.auth.userAvatar = (user && user.avatar) || '';
    state.auth.zohoProfile = zohoProfile || null;
    _setStoredSessionId(sessionId || '');
  }

  function _clearAuthState() {
    _setAuthState('', null, null);
  }

  function _handleHostedUnauthorized(message) {
    _clearAuthState();
    _updateAuthUi();
    if (typeof SF.loadSavedFolders === 'function') SF.loadSavedFolders();
    if (typeof SF.loadLibraryFolders === 'function') SF.loadLibraryFolders();
    SF.showToast(message || 'Session expired. Sign in with Zoho and try again.');
  }

  function _stripAuthQueryParams() {
    if (!window.history || !window.history.replaceState) return;
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  }

  function _setAuthButtonsDisabled(disabled) {
    $('#generateBtn, #saveToProjectBtn').prop('disabled', !!disabled);
  }

  function _updateAuthUi() {
    var hasAuth = _isHostedAuthEnabled();
    var isSignedIn = !!(state.auth && state.auth.isAuthenticated);
    var userAvatar = state.auth.userAvatar || '';

    $('#authControls').toggleClass('hidden', !hasAuth);
    $('#authLoginBtn').toggleClass('hidden', !hasAuth || isSignedIn);
    $('#authUserBox').toggleClass('hidden', !hasAuth || !isSignedIn);
    $('#authStatusPill')
      .toggleClass('hidden', !hasAuth)
      .toggleClass('is-authenticated', isSignedIn)
      .text(isSignedIn ? 'Signed in' : 'Auth required');
    console.log('state.auth', state.auth);
    $('#authUserName').text(state.auth.username  || 'Zoho User');
    $('#authUserEmail').text(state.auth.useremail || '');
    $('#authUserAvatar')
      .toggleClass('hidden', !userAvatar)
      .attr('src', userAvatar || '');

    $('body')
      .toggleClass('auth-enabled', hasAuth)
      .toggleClass('auth-signed-in', isSignedIn)
      .toggleClass('auth-required', hasAuth && !isSignedIn);

    _setAuthButtonsDisabled(hasAuth && !isSignedIn);
  }

  function _authFetch(path, options) {
    var url = String(AUTH_API_BASE || '').replace(/\/+$/, '') + '/' + String(path || '').replace(/^\/+/, '');
    var requestOptions = $.extend(true, {
      headers: {
        'Content-Type': 'application/json'
      }
    }, options || {});

    if (state.auth.sessionId) {
      requestOptions.headers['x-session-id'] = state.auth.sessionId;
    }

    return fetch(url, requestOptions).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
        if (!response.ok) {
          var error = new Error((data && data.message) || ('Request failed with status ' + response.status));
          error.response = response;
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  function _installAuthAjaxPrefilter() {
    if (_authAjaxPrefilterInstalled) return;
    _authAjaxPrefilterInstalled = true;

    $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
      var sessionId = _getStoredSessionId();
      var base = String(window.SF_CATALYST_API_BASE || AUTH_API_BASE || '').replace(/\/+$/, '');
      var requestUrl = String(options.url || '');
      if (!_isHostedAuthEnabled() || !sessionId || !base || requestUrl.indexOf(base) !== 0) return;
      jqXHR.setRequestHeader('x-session-id', sessionId);
    });
  }

  function _beginZohoLogin() {
    var origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
    return _authFetch('api/auth/zoho/url?redirect_origin=' + encodeURIComponent(origin), { method: 'GET', headers: {} }).then(function (data) {
      if (!data || !data.url) {
        throw new Error('Could not compute Zoho login URL');
      }
      window.location.href = data.url;
    });
  }

  function _validateHostedSession() {
    return _authFetch('api/auth/session', { method: 'GET', headers: {} }).then(function (data) {
      _setAuthState(data.sessionId, data.user, data.zohoProfile);
      _updateAuthUi();
      return data;
    });
  }

  function _exchangeZohoCode(code) {
    var origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
    return _authFetch('api/auth/zoho/callback', {
      method: 'POST',
      body: JSON.stringify({ code: code, redirect_origin: origin })
    }).then(function (data) {
      _setAuthState(data.sessionId, data.user, data.zohoProfile);
      _updateAuthUi();
      return data;
    });
  }

  function _logoutHostedSession() {
    return _authFetch('api/auth/logout', { method: 'POST' }).catch(function () {
      return null;
    }).then(function () {
      _clearAuthState();
      _updateAuthUi();
      if (typeof SF.loadSavedFolders === 'function') SF.loadSavedFolders();
      if (typeof SF.loadLibraryFolders === 'function') SF.loadLibraryFolders();
    });
  }

  function _bootstrapAuth() {
    state.auth.enabled = AUTH_ENABLED;
    _installAuthAjaxPrefilter();
    _updateAuthUi();

    if (!_isHostedAuthEnabled()) {
      return Promise.resolve(false);
    }

    var code = new URLSearchParams(window.location.search || '').get('code');
    var storedSessionId = _getStoredSessionId();
    if (storedSessionId) state.auth.sessionId = storedSessionId;

    if (code) {
      return _exchangeZohoCode(code).then(function (data) {
        _stripAuthQueryParams();
        return data;
      }).catch(function (error) {
        _stripAuthQueryParams();
        _clearAuthState();
        _updateAuthUi();
        SF.showToast((error && error.message) || 'Sign-in failed');
        return false;
      });
    }

    if (storedSessionId) {
      return _validateHostedSession().catch(function () {
        _clearAuthState();
        _updateAuthUi();
        return false;
      });
    }

    return Promise.resolve(false);
  }

  SF.isHostedAuthBlocked = function () {
    return _isHostedAuthEnabled() && !(state.auth && state.auth.isAuthenticated);
  };

  SF.handleHostedUnauthorized = function (message) {
    _handleHostedUnauthorized(message);
  };

  function _toastDeleteConfirm(scope, key, label) {
    var now = Date.now();
    var prev = (_deleteConfirmClicks[scope] && _deleteConfirmClicks[scope][key]) || 0;
    if (now - prev <= 4000) {
      delete _deleteConfirmClicks[scope][key];
      return true;
    }

    _deleteConfirmClicks[scope][key] = now;
    SF.showToast('Click Delete again to confirm removal of "' + label + '"');
    return false;
  }

  function _extractSvgName(openPath) {
    if (!openPath) return '';
    var input = String(openPath).trim();
    if (!input) return '';

    var plainFile = input.match(/^([^\/?#]+\.svg)(?:[?#].*)?$/i);
    if (plainFile && plainFile[1]) {
      try {
        return decodeURIComponent(plainFile[1]);
      } catch (e0) {
        return plainFile[1];
      }
    }

    var match = input.match(/\/([^\/?#]+\.svg)(?:[?#].*)?$/i);
    if (!match || !match[1]) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch (e) {
      return match[1];
    }
  }

  function _toCatalystSpriteUrl(openPath, fallbackName) {
    // Local dev should open from the local static folder served by server.py.
    if (IS_LOCAL_HOST) {
      if (openPath) return String(openPath);
      if (fallbackName) {
        var localName = String(fallbackName).trim();
        if (localName && !/\.svg$/i.test(localName)) localName += '.svg';
        if (localName) return 'saved-sprites/' + encodeURIComponent(localName);
      }
      return '';
    }

    // In hosted mode, keep explicit saved-sprites paths intact so each folder/file
    // maps to its own URL (avoid collapsing everything to sprite.svg).
    if (openPath) {
      var rawPath = String(openPath).trim();
      if (/^saved-sprites\//i.test(rawPath) || /^\//.test(rawPath) || /^https?:\/\//i.test(rawPath)) {
        return rawPath;
      }
    }

    var svgName = _extractSvgName(openPath);

    if (!svgName && fallbackName) {
      svgName = String(fallbackName).trim();
      if (svgName && !/\.svg$/i.test(svgName)) svgName += '.svg';
    }

    if (!svgName) return openPath || '';
    return CATALYST_SPRITE_BASE + '/sprite/' + encodeURIComponent(svgName);
  }

  function _openResolvedSpriteUrl(openPath, fallbackName) {
    var targetUrl = _toCatalystSpriteUrl(openPath, fallbackName);
    if (!targetUrl) {
      SF.showToast('Could not determine sprite URL');
      return false;
    }

    // Hosted sprite endpoints require auth. For direct browser tab opens, include
    // the existing session id as a query parameter so the exact SVG URL can load.
    if (_isHostedAuthEnabled() && /^https?:\/\//i.test(targetUrl)) {
      var sessionId = _getStoredSessionId();
      if (targetUrl.indexOf(String(AUTH_API_BASE || '').replace(/\/+$/, '')) === 0) {
        if (!sessionId) {
          _handleHostedUnauthorized('Session expired. Sign in with Zoho and try again.');
          return false;
        }

        var separator = targetUrl.indexOf('?') === -1 ? '?' : '&';
        targetUrl = targetUrl + separator + 'session_id=' + encodeURIComponent(sessionId);
      }
    }

    var win = window.open(targetUrl, '_blank');
    if (win) {
      try {
        if (win.location && win.location.href === 'about:blank') {
          win.location.href = targetUrl;
        }
      } catch (e) {}
      return true;
    }

    SF.showToast('Popup blocked. Please allow popups for this site.');
    return false;
  }

  function _openInlineSvg(svgContent) {
    if (!svgContent) return false;

    var win = window.open('', '_blank');
    if (!win) return false;

    try {
      win.document.open();
      win.document.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>SVG Preview</title>' +
        '<style>html,body{margin:0;padding:0;background:#fff}svg{display:block;max-width:100vw;max-height:100vh}</style>' +
        '</head><body>' + String(svgContent) + '</body></html>'
      );
      win.document.close();
      return true;
    } catch (e) {
      try { win.close(); } catch (_) {}
      return false;
    }
  }

  function _ensureWorkspaceCustomiseRefs() {
    if (_workspaceCustomiseNode && _workspaceCustomiseHome) return;
    var $node = $('#multiUploadModal .multi-upload-right').first();
    if (!$node.length) return;
    _workspaceCustomiseNode = $node;
    _workspaceCustomiseHome = $node.parent();
  }

  function _moveWorkspaceCustomiseToModal() {
    _ensureWorkspaceCustomiseRefs();
    if (!_workspaceCustomiseNode || !_workspaceCustomiseHome) return;
    if (!_workspaceCustomiseNode.parent().is(_workspaceCustomiseHome)) {
      _workspaceCustomiseHome.append(_workspaceCustomiseNode);
    }
  }

  function _captureHelpDocPanelMarkup() {
    if (_docRightPanelHelpMarkup) return;
    var $inner = $('#docRightPanel .doc-right-panel-inner').first();
    if ($inner.length) {
      _docRightPanelHelpMarkup = $inner.html();
    }
  }

  SF.configureRightPanelForGenerator = function () {
    _ensureWorkspaceCustomiseRefs();
    _captureHelpDocPanelMarkup();

    var $panel = $('#docRightPanel');
    var $inner = $panel.find('.doc-right-panel-inner').first();
    if (!$panel.length || !$inner.length || !_workspaceCustomiseNode) return;

    $inner.empty().append(_workspaceCustomiseNode);
    $panel.removeClass('hidden').addClass('addsprite-panel');
    $('.main').addClass('has-right-panel has-right-panel-wide');

    if (multiUploadFlow !== 'workspace') {
      multiUploadFlow = 'workspace';
      setMultiUploadMode('original');
      $('#multiUploadKeepNames').prop('checked', true);
    }

    renderMultiUploadSelection();
  };

  SF.configureRightPanelForHelpDoc = function () {
    _moveWorkspaceCustomiseToModal();

    var $panel = $('#docRightPanel');
    var $inner = $panel.find('.doc-right-panel-inner').first();
    if (!$panel.length || !$inner.length) return;

    _captureHelpDocPanelMarkup();
    if (_docRightPanelHelpMarkup) {
      $inner.html(_docRightPanelHelpMarkup);
    }

    $panel.removeClass('addsprite-panel');
    $panel.removeClass('hidden');
    $('.main').addClass('has-right-panel').removeClass('has-right-panel-wide');
  };

  SF.hideDocRightPanel = function () {
    _moveWorkspaceCustomiseToModal();
    $('#docRightPanel').addClass('hidden').removeClass('addsprite-panel');
    $('.main').removeClass('has-right-panel has-right-panel-wide');
  };

  function updateUploadNamingPreview() {
    var prefix = $('#uploadSetPrefix').val() || '';
    var gSuffix = $('#uploadSetGSuffix').val() || '';
    var sSuffix = $('#uploadSetSSuffix').val() || '';

    $('#uploadPreviewGId').text('iconName' + gSuffix);
    $('#uploadPreviewSymId').text(prefix + 'iconname' + sSuffix);
  }

  function updateUploadTagPreview() {
    var tagName = $('#uploadSetTagName').val() || 'crmutil-icon';
    var nameAttr = $('#uploadSetNameAttr').val() || 'icon-name';
    var classAttr = $('#uploadSetClassAttr').val() || 'icon-class';
    var extraClass = $('#uploadSetExtraClass').val() || '';
    var prefix = $('#uploadSetPrefix').val() || '';
    var sSuffix = $('#uploadSetSSuffix').val() || '';
    var classValue = prefix + 'iconname' + sSuffix + (extraClass ? ' ' + extraClass : '');
    var preview = '&lt;' + SF.escapeAttr(tagName) +
      ' ' + SF.escapeAttr(nameAttr) + '="iconname"' +
      ' ' + SF.escapeAttr(classAttr) + '="' + SF.escapeAttr(classValue) + '"' +
      '&gt;&lt;/' + SF.escapeAttr(tagName) + '&gt;';

    $('#uploadPreviewTag').html(preview);
  }

  function applyUploadModalSettings() {
    state.settings.gSuffix = $.trim($('#uploadSetGSuffix').val());
    state.settings.prefix = $.trim($('#uploadSetPrefix').val());
    state.settings.symbolSuffix = $.trim($('#uploadSetSSuffix').val());

    state.tagConfig.tagName = $.trim($('#uploadSetTagName').val()) || 'crmutil-icon';
    state.tagConfig.nameAttr = $.trim($('#uploadSetNameAttr').val()) || 'icon-name';
    state.tagConfig.classAttr = $.trim($('#uploadSetClassAttr').val()) || 'icon-class';
    state.tagConfig.extraClass = $.trim($('#uploadSetExtraClass').val());

    state.icons.forEach(function (icon) {
      if (!icon.isExisting) {
        icon.gId = SF.makeGId(icon.name);
        icon.symbolId = SF.makeSymbolId(icon.name);
      }
    });
  }

  function populateUploadModalFields() {
    $('#uploadSetGSuffix').val(state.settings.gSuffix);
    $('#uploadSetPrefix').val(state.settings.prefix);
    $('#uploadSetSSuffix').val(state.settings.symbolSuffix);
    $('#uploadSetTagName').val(state.tagConfig.tagName);
    $('#uploadSetNameAttr').val(state.tagConfig.nameAttr);
    $('#uploadSetClassAttr').val(state.tagConfig.classAttr);
    $('#uploadSetExtraClass').val(state.tagConfig.extraClass);
    updateUploadNamingPreview();
    updateUploadTagPreview();
  }

  function resetFilenameModalLayout() {
    $('#fnameSpriteGroup, #fnameCssGroup').removeClass('hidden');
    $('#fnameFolderGroup').addClass('hidden');
    $('#filenameModal .modal-header h3').html(
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
        '<polyline points="14 2 14 8 20 8"/>' +
      '</svg>' +
      'Sprite &amp; CSS Name'
    );
  }

  function previewSvgForIcon(icon) {
    var previewAttrs = SF.buildPreviewAttrs(icon);
    var previewDefs = icon.defsContent ? '<defs>' + icon.defsContent + '</defs>' : '';
    var previewStyle = icon.styleContent ? '<style>' + icon.styleContent + '</style>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
      icon.originX + ' ' + icon.originY + ' ' + icon.width + ' ' + icon.height +
      '" width="40" height="40"' + previewAttrs + '>' + previewDefs + previewStyle + icon.svgContent + '</svg>';
  }

  function buildStandaloneIconSvg(icon) {
    var rootAttrs = SF.buildPreviewAttrs(icon);
    var defs = icon.defsContent ? '<defs>' + icon.defsContent + '</defs>' : '';
    var style = icon.styleContent ? '<style>' + icon.styleContent + '</style>' : '';
    return '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
      icon.originX + ' ' + icon.originY + ' ' + icon.width + ' ' + icon.height +
      '" width="' + SF.formatDim(icon.width) + '" height="' + SF.formatDim(icon.height) + '"' + rootAttrs + '>' +
      defs + style + icon.svgContent + '</svg>';
  }

  function syncMultiUploadIconNames() {
    $('#multiUploadIconGrid .multi-upload-name-field').each(function () {
      var index = parseInt($(this).data('multi-index'), 10);
      if (isNaN(index) || !multiUploadSelection[index]) return;
      var nextName = SF.cleanFileName($.trim($(this).val())) || multiUploadSelection[index].name;
      multiUploadSelection[index].name = nextName;
      multiUploadSelection[index].gId = SF.makeGId(nextName);
      multiUploadSelection[index].symbolId = SF.makeSymbolId(nextName);
      $(this).val(nextName);
    });
  }

  function toggleMultiUploadIconSelection(index) {
    if (isNaN(index) || !multiUploadSelection[index]) return;
    multiUploadSelection[index]._multiSelected = !multiUploadSelection[index]._multiSelected;
    renderMultiUploadSelection();
  }

  function renderMultiUploadSelection() {
    var $grid = $('#multiUploadIconGrid');
    if (!$grid.length) return;
    $grid.empty();
    var keepNames = $('#multiUploadKeepNames').is(':checked');
    var selectedCount = multiUploadSelection.filter(function (icon) {
      return icon && icon._multiSelected !== false;
    }).length;

    if (!multiUploadSelection.length) {
      $grid.html('<div class="empty-state"><span>No icons selected</span></div>');
      $('#multiUploadNamingSection').addClass('hidden');
      $('#multiUploadCombineBtn').addClass('hidden');
      return;
    }

    $('#multiUploadNamingSection').toggleClass('hidden', multiUploadSelection.length <= 1);
    $('#multiUploadCombineBtn').toggleClass('hidden', !(multiUploadFlow === 'workspace' && selectedCount >= 2));

    multiUploadSelection.forEach(function (icon, index) {
      var isSelected = icon._multiSelected !== false;
      var nameControl = keepNames
        ? '<div class="multi-upload-icon-name">' + SF.escapeAttr(icon.name) + '</div>'
        : '<input type="text" class="multi-upload-name-field multi-upload-name-field--inline" data-multi-index="' + index + '" value="' + SF.escapeAttr(icon.name) + '" spellcheck="false">';

      $grid.append(
        '<div class="multi-upload-icon-card' + (isSelected ? ' is-selected' : '') + '" data-multi-index="' + index + '">' +
          '<button type="button" class="multi-upload-select-btn' + (isSelected ? ' is-selected' : '') + '" data-multi-index="' + index + '" aria-label="Toggle icon selection">' +
            (isSelected ? '&#10003;' : '') +
          '</button>' +
          '<div class="multi-upload-icon-preview">' + previewSvgForIcon(icon) + '</div>' +
          nameControl +
          '<div class="multi-upload-icon-dims">' + SF.formatDim(icon.width) + ' × ' + SF.formatDim(icon.height) + '</div>' +
        '</div>'
      );
    });
  }

  function setMultiUploadMode(mode) {
    $('#multiUploadModeBtns .doc-mode-btn').removeClass('active');
    $('#multiUploadModeBtns .doc-mode-btn[data-colormode="' + mode + '"]').addClass('active');
    $('#multiUploadSingleColorGroup, #multiUploadFillGroup, #multiUploadStrokeGroup').addClass('hidden');
    if (mode === 'single') {
      $('#multiUploadSingleColorGroup').removeClass('hidden');
    } else if (mode === 'multi') {
      $('#multiUploadFillGroup, #multiUploadStrokeGroup').removeClass('hidden');
    }
  }

  function applyColorsToMultiSelection() {
    var mode = $('#multiUploadModeBtns .doc-mode-btn.active').data('colormode') || 'original';
    var targetIcons = multiUploadSelection.filter(function (icon) {
      return icon && icon._multiSelected !== false;
    });

    if (!targetIcons.length) {
      SF.showToast('Select at least one icon to customise');
      return;
    }

    targetIcons.forEach(function (icon) {
      if (mode === 'original') {
        icon.rootFill = icon.originalRootFill;
        icon.rootStroke = icon.originalRootStroke;
        icon.colorMode = icon.originalColorMode;
        if (icon.originalSvgContent) icon.svgContent = icon.originalSvgContent;
        return;
      }

      if (!icon.originalSvgContent) icon.originalSvgContent = icon.svgContent;

      if (mode === 'single') {
        var single = $('#multiUploadSingleColor').val();
        if (icon.originalColorMode === 'stroke') {
          icon.colorMode = 'stroke';
          icon.rootStroke = single;
        } else {
          icon.colorMode = 'fill';
          icon.rootFill = single;
        }
      } else {
        icon.colorMode = 'fill';
        icon.rootFill = $('#multiUploadFill').val();
        icon.rootStroke = $('#multiUploadStroke').val();
      }

      SF.rebuildIconColors(icon);
    });

    SF.renderIconList();
    if (state.page === 'helpdoc') SF.renderHelpDoc();
    renderMultiUploadSelection();
    SF.showToast('Customise applied to ' + targetIcons.length + ' icon' + (targetIcons.length > 1 ? 's' : ''));
  }

  function _buildCombinedIconFromSelection(selectedIcons) {
    if (!selectedIcons || selectedIcons.length < 2) return null;

    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    selectedIcons.forEach(function (icon) {
      var x0 = Number(icon.originX) || 0;
      var y0 = Number(icon.originY) || 0;
      var w = Number(icon.width) || 24;
      var h = Number(icon.height) || 24;
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x0 + w);
      maxY = Math.max(maxY, y0 + h);
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;

    var width = Math.max(1, Math.ceil(maxX - minX));
    var height = Math.max(1, Math.ceil(maxY - minY));

    var defsParts = [];
    var styleParts = [];
    var bodyParts = [];

    selectedIcons.forEach(function (icon) {
      var tx = (Number(icon.originX) || 0) - minX;
      var ty = (Number(icon.originY) || 0) - minY;
      var previewAttrs = SF.buildPreviewAttrs(icon);

      if (icon.defsContent) defsParts.push(icon.defsContent);
      if (icon.styleContent) styleParts.push(icon.styleContent);

      bodyParts.push(
        '<g transform="translate(' + SF.formatDim(tx) + ' ' + SF.formatDim(ty) + ')"' + previewAttrs + '>' +
          icon.svgContent +
        '</g>'
      );
    });

    var baseName = 'combined_' + selectedIcons.slice(0, 2).map(function (icon) {
      return SF.cleanFileName(icon.name || 'icon') || 'icon';
    }).join('_');
    if (selectedIcons.length > 2) {
      baseName += '_' + selectedIcons.length;
    }
    baseName = (SF.cleanFileName(baseName) || 'combined_icon').slice(0, 56);

    var candidate = baseName;
    var suffix = 2;
    while ((state.icons || []).some(function (icon) {
      return icon && icon.name === candidate;
    })) {
      candidate = baseName + '_' + suffix;
      suffix += 1;
    }

    var svg =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '">' +
      (defsParts.length ? '<defs>' + defsParts.join('\n') + '</defs>' : '') +
      (styleParts.length ? '<style>' + styleParts.join('\n') + '</style>' : '') +
      bodyParts.join('\n') +
      '</svg>';

    var parsed = SF.parseSVGFile(svg, candidate + '.svg');
    if (!parsed) return null;
    parsed.name = candidate;
    parsed.gId = SF.makeGId(candidate);
    parsed.symbolId = SF.makeSymbolId(candidate);
    return parsed;
  }

  function openMultiUploadModal(icons, flow) {
    multiUploadSelection = Array.isArray(icons) ? icons.slice() : [];
    multiUploadSelection.forEach(function (icon) {
      if (!icon) return;
      icon._multiSelected = true;
    });
    multiUploadFlow = flow || 'multi';
    setMultiUploadMode('original');
    $('#multiUploadKeepNames').prop('checked', true);
    if (multiUploadFlow === 'single') {
      $('#multiUploadGenerateBtn').text('Continue');
    } else if (multiUploadFlow === 'workspace') {
      if (typeof SF.configureRightPanelForGenerator === 'function') {
        SF.configureRightPanelForGenerator();
      }
      $('#multiUploadGenerateBtn').text('Done');
      renderMultiUploadSelection();
      return;
    } else {
      $('#multiUploadGenerateBtn').text('Generate Sprite');
    }

    _moveWorkspaceCustomiseToModal();
    renderMultiUploadSelection();
    $('#multiUploadModal').removeClass('hidden');
  }

  function removeIconsFromWorkspace(iconsToRemove) {
    var removeIds = (iconsToRemove || []).map(function (icon) {
      return icon && icon.id;
    }).filter(Boolean);

    if (!removeIds.length) return;

    state.icons = state.icons.filter(function (icon) {
      return removeIds.indexOf(icon.id) === -1;
    });

    SF.renderIconList();
    if (!state.icons.length) {
      state.generatedSVG = '';
      state.generatedCSS = '';
      $('#outputSection').addClass('hidden');
      $('#spriteStatus').text('').attr('class', 'upload-status');
      $('#cssStatus').text('').attr('class', 'upload-status');
    }
  }

  function setGeneratorMode(mode) {
    state.mode = mode;

    $('.sidebar-link[data-mode]').removeClass('active');
    $('.sidebar-link[data-mode="' + mode + '"]').addClass('active');

    if (mode === 'existing') {
      $('#existingSection').removeClass('hidden');
      $('#pageTitle').text('Update Existing Sprite');
      $('#pageBreadcrumb').text('Update Sprite');
    } else {
      $('#existingSection').addClass('hidden');
      $('#pageTitle').text('Create Sprite');
      $('#pageBreadcrumb').text('Create Sprite');
    }

    $('#sidebar').removeClass('open');

    if (state.page !== 'generator') {
      SF.switchPage('generator');
    }
  }

  function init() {
    var authReady = _bootstrapAuth();

    $('#authLoginBtn').on('click', function () {
      _beginZohoLogin().catch(function (error) {
        SF.showToast((error && error.message) || 'Could not start Zoho sign-in');
      });
    });

    $('#authLogoutBtn').on('click', function () {
      _logoutHostedSession();
    });

    // ---- Mode Tabs (sidebar navigation) ----
    $('.sidebar-link[data-mode]').on('click', function () {
      setGeneratorMode($(this).data('mode'));
    });

    // ---- Theme Toggle ----
    $('#themeToggle').on('click', function () {
      var $html = $('html');
      var current = $html.attr('data-theme') || 'light';
      var next = current === 'light' ? 'dark' : 'light';
      $html.attr('data-theme', next);
      $('.theme-label').text(next === 'light' ? 'Light' : 'Dark');
      try { localStorage.setItem('spriteforge-theme', next); } catch(e) {}
    });

    // Restore saved theme
    try {
      var saved = localStorage.getItem('spriteforge-theme');
      if (saved === 'dark') {
        $('html').attr('data-theme', 'dark');
        $('.theme-label').text('Dark');
      }
    } catch(e) {}

    // ---- Mobile Sidebar Toggle ----
    $('#sidebarToggle').on('click', function () {
      $('#sidebar').toggleClass('open');
    });

    // ---- Panel Accordion Toggle ----
    $(document).on('click', '.panel-header', function (e) {
      // Don't toggle if clicking on buttons/inputs inside panel-actions, or tab headers
      if ($(e.target).closest('.panel-actions, .panel-header-tabs, button, input, select, a').length) return;
      var $header = $(this);
      // Skip tabbed panel headers
      if ($header.hasClass('panel-header-tabs')) return;
      $header.closest('.panel').toggleClass('collapsed');
    });

    // ---- Most Used Icons Page ----
    $('#mostUsedBtn').on('click', function () {
      SF.switchPage('mostused');
    });

    // ---- SVG to WebFont Page ----
    $('#webfontBtn').on('click', function () {
      SF.switchPage('webfont');
    });

    $('#requestIconNavBtn').on('click', function () {
      SF.switchPage('requesticon');
    });

    $(document).on('click', '#clearUsageBtn', function () {
      SF.clearIconUsage();
      SF.renderMostUsedIcons();
    });

    // ---- Settings Modal ----
    $('#settingsBtn').on('click', function () {
      $('#setSpacing').val(state.settings.spacing);
      $('#setRowGap').val(state.settings.rowGap);
      $('#setPadding').val(state.settings.padding);
      $('#setIconsPerRow').val(state.settings.iconsPerRow);
      $('#setMaxSpriteWidth').val(state.settings.maxSpriteWidth);
      $('#setGSuffix').val(state.settings.gSuffix);
      $('#setPrefix').val(state.settings.prefix);
      $('#setSSuffix').val(state.settings.symbolSuffix);
      // Tag config
      $('#setTagName').val(state.tagConfig.tagName);
      $('#setNameAttr').val(state.tagConfig.nameAttr);
      $('#setClassAttr').val(state.tagConfig.classAttr);
      $('#setExtraClass').val(state.tagConfig.extraClass);
      SF.updateNamingPreview();
      SF.updateTagPreview();

      // Populate SVGO settings
      $('#svgoEnabled').prop('checked', state.svgo.enabled);
      $('#svgoFloatPrecision').val(state.svgo.floatPrecision);
      var $passList = $('#svgoPassList');
      $passList.empty();
      SF.svgoPasses.forEach(function (p) {
        var checked = state.svgo.passes[p.key] ? ' checked' : '';
        $passList.append(
          '<label class="svgo-pass-item">' +
            '<input type="checkbox" class="svgo-pass-check" data-pass="' + p.key + '"' + checked + '>' +
            '<span>' + p.label + '</span>' +
          '</label>'
        );
      });
      SF.updateSvgoUI();

      $('#settingsModal').removeClass('hidden');
    });

    $('#closeSettingsBtn, #cancelSettingsBtn').on('click', function () {
      $('#settingsModal').addClass('hidden');
    });

    $('#settingsModal').on('click', function (e) {
      if ($(e.target).hasClass('modal-overlay')) {
        $(this).addClass('hidden');
      }
    });

    $('#saveSettingsBtn').on('click', function () {
      state.settings.spacing = parseInt($('#setSpacing').val(), 10) || 0;
      state.settings.rowGap = parseInt($('#setRowGap').val(), 10) || 0;
      state.settings.padding = parseInt($('#setPadding').val(), 10) || 0;
      state.settings.iconsPerRow = parseInt($('#setIconsPerRow').val(), 10) || 0;
      state.settings.maxSpriteWidth = parseInt($('#setMaxSpriteWidth').val(), 10) || 0;
      state.settings.gSuffix = $('#setGSuffix').val();
      state.settings.prefix = $('#setPrefix').val();
      state.settings.symbolSuffix = $('#setSSuffix').val();

      // Save tag config
      state.tagConfig.tagName = $.trim($('#setTagName').val()) || 'crmutil-icon';
      state.tagConfig.nameAttr = $.trim($('#setNameAttr').val()) || 'icon-name';
      state.tagConfig.classAttr = $.trim($('#setClassAttr').val()) || 'icon-class';
      state.tagConfig.extraClass = $.trim($('#setExtraClass').val());

      // Save SVGO settings
      state.svgo.enabled = $('#svgoEnabled').is(':checked');
      state.svgo.floatPrecision = parseInt($('#svgoFloatPrecision').val(), 10) || 3;
      $('#svgoPassList .svgo-pass-check').each(function () {
        state.svgo.passes[$(this).data('pass')] = $(this).is(':checked');
      });

      state.icons.forEach(function (icon) {
        if (!icon.isExisting) {
          icon.gId = SF.makeGId(icon.name);
          icon.symbolId = SF.makeSymbolId(icon.name);
        }
      });

      SF.renderIconList();
      $('#settingsModal').addClass('hidden');
    });

    $('#setGSuffix, #setPrefix, #setSSuffix').on('input', SF.updateNamingPreview);
    $('#setTagName, #setNameAttr, #setClassAttr, #setExtraClass').on('input', SF.updateTagPreview);

    // ---- SVGO toggle UI ----
    $(document).on('change', '#svgoEnabled', function () {
      SF.updateSvgoUI();
    });

    // ---- Figma Import ----
    $('#figmaBtn').on('click', function () {
      SF.openFigmaModal();
    });

    // ---- Duplicate Icon Modal ----
    $('#dupKeepAllBtn').on('click', function () {
      var $modal = $('#duplicateModal');
      var onResult = $modal.data('onResult');
      $modal.addClass('hidden');
      if (typeof onResult === 'function') onResult('keepall');
    });

    $('#dupConfirmBtn').on('click', function () {
      var $modal = $('#duplicateModal');
      var onResult = $modal.data('onResult');
      $modal.addClass('hidden');
      if (typeof onResult === 'function') onResult('selected');
    });

    $('#dupCloseBtn, #dupCancelBtn').on('click', function () {
      $('#duplicateModal').addClass('hidden');
    });

    $('#duplicateModal .modal-overlay-bg').on('click', function () {
      $('#duplicateModal').addClass('hidden');
    });

    // Toggle visual feedback when checking/unchecking duplicate items
    $(document).on('change', '.dup-check', function () {
      var $item = $(this).closest('.dup-group-item');
      if ($(this).is(':checked')) {
        $item.removeClass('unchecked');
      } else {
        $item.addClass('unchecked');
      }
    });

    $('#figmaCloseBtn, #figmaCancelBtn').on('click', function () {
      SF.closeFigmaModal();
    });

    $('#figmaModal .modal-overlay-bg').on('click', function () {
      SF.closeFigmaModal();
    });

    $('#figmaLoadBtn').on('click', function () {
      var fs = SF.figmaState;
      var token = $.trim($('#figmaToken').val());
      var url = $.trim($('#figmaUrl').val());

      if (!token) { SF.showToast('Please enter a Figma token'); return; }
      if (!url) { SF.showToast('Please enter a Figma file URL'); return; }

      var key = SF.parseFigmaUrl(url);
      if (!key) { SF.showToast('Invalid Figma URL'); return; }

      fs.token = token;
      fs.fileKey = key;
      try { localStorage.setItem('sf_figma_token', token); } catch (e) {}

      $('#figmaFileInfo').show();
      SF.figmaFetchComponents();
    });

    $('#figmaSearch').on('input', function () {
      SF.figmaState.search = $(this).val().toLowerCase();
      SF.renderFigmaGrid();
    });

    $(document).on('click', '.figma-card:not(.already-added)', function () {
      var id = $(this).attr('data-figma-id');
      if (SF.figmaState.selected[id]) {
        delete SF.figmaState.selected[id];
        $(this).removeClass('selected');
      } else {
        SF.figmaState.selected[id] = true;
        $(this).addClass('selected');
      }
      // Update the parent row checkbox state
      var $row = $(this).closest('.figma-row-icons');
      var $header = $row.prev('.figma-row-header');
      if ($header.length) {
        var allChecked = $row.find('.figma-card:not(.already-added)').length ===
                         $row.find('.figma-card.selected:not(.already-added)').length;
        $header.find('.figma-row-checkbox').prop('checked', allChecked);
      }
      SF.updateFigmaSelCount();
    });

    // Row-level select all / deselect all checkbox
    $(document).on('change', '.figma-row-checkbox', function () {
      var checked = $(this).is(':checked');
      var $header = $(this).closest('.figma-row-header');
      var $rowIcons = $header.next('.figma-row-icons');
      $rowIcons.find('.figma-card:not(.already-added)').each(function () {
        var id = $(this).attr('data-figma-id');
        if (checked) {
          SF.figmaState.selected[id] = true;
          $(this).addClass('selected');
        } else {
          delete SF.figmaState.selected[id];
          $(this).removeClass('selected');
        }
      });
      SF.updateFigmaSelCount();
    });

    $('#figmaSelAll').on('click', function () {
      var search = SF.figmaState.search;
      SF.figmaState.components.forEach(function (c) {
        if (!search || (c.name + ' ' + c.containingFrame + ' ' + c.description).toLowerCase().indexOf(search) !== -1) {
          SF.figmaState.selected[c.id] = true;
        }
      });
      SF.renderFigmaGrid();
    });

    $('#figmaSelNone').on('click', function () {
      SF.figmaState.selected = {};
      SF.renderFigmaGrid();
    });

    $(document).on('click', '.figma-filter-tab', function () {
      var filter = $(this).data('filter');
      SF.figmaState.filter = filter;
      $('.figma-filter-tab').removeClass('active');
      $(this).addClass('active');
      SF.renderFigmaGrid();
    });

    $('#figmaImportBtn').on('click', function () {
      SF.figmaImportSelected();
    });

    $('#figmaAddToLibraryBtn').on('click', function () {
      if (typeof SF.openFigmaLibraryNamesModal === 'function') {
        SF.openFigmaLibraryNamesModal();
      }
    });

    $('#figmaLibraryNamesCloseBtn, #figmaLibraryNamesCancelBtn').on('click', function () {
      if (typeof SF.closeFigmaLibraryNamesModal === 'function') {
        SF.closeFigmaLibraryNamesModal();
      }
    });

    $('#figmaLibraryNamesModal .modal-overlay-bg').on('click', function () {
      if (typeof SF.closeFigmaLibraryNamesModal === 'function') {
        SF.closeFigmaLibraryNamesModal();
      }
    });

    $('#figmaLibraryNamesConfirmBtn').on('click', function () {
      if (typeof SF.figmaAddSelectedToLibrary !== 'function') return;
      var namesById = (typeof SF.collectFigmaLibraryNames === 'function')
        ? SF.collectFigmaLibraryNames()
        : {};
      SF.figmaAddSelectedToLibrary(namesById);
    });

    // ---- File Upload Zones ----
    $(document).on('click', '#uploadIconsBtn, #libUploadIconsBtn', function (e) {
      e.preventDefault();
      e.stopPropagation();
      pendingUploadIconName = '';
      $('#uploadIconName').val('');

      if (!$('#uploadIconModal').length) {
        SF.showToast('Upload modal is still loading. Please try again.');
        return;
      }

      populateUploadModalFields();
      $('#uploadIconModal').removeClass('hidden');
      setTimeout(function () {
        $('#uploadIconName').trigger('focus');
      }, 80);
    });

    $(document).on('click', '#uploadIconCancelBtn, #uploadIconCloseBtn', function () {
      $('#uploadIconModal').addClass('hidden');
    });

    $(document).on('click', '#uploadIconModal .modal-overlay-bg', function () {
      $('#uploadIconModal').addClass('hidden');
    });

    $(document).on('click', '#uploadIconModal .modal', function (e) {
      e.stopPropagation();
    });

    $(document).on('click', '#uploadIconConfirmBtn', function () {
      var iconName = $.trim($('#uploadIconName').val());
      if (!iconName) {
        SF.showToast('Please enter an icon name');
        return;
      }

      applyUploadModalSettings();

      pendingUploadIconName = iconName.replace(/[^a-zA-Z0-9_.-]/g, '-');

      // Use a fresh picker created from the same user gesture for reliable file selection.
      var picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = '.svg,image/svg+xml';
      picker.multiple = true;
      picker.style.display = 'none';
      document.body.appendChild(picker);

      picker.addEventListener('change', function () {
        var files = picker.files ? Array.from(picker.files) : [];
        var svgFiles = files.filter(function (f) {
          return /\.svg$/i.test(f.name || '');
        });

        if (svgFiles.length === 1) {
          SF.handleSVGFiles(svgFiles, {
            overrideName: pendingUploadIconName,
            skipAutoSave: true,
            onComplete: function (addedIcons) {
              if (addedIcons && addedIcons.length) {
                openMultiUploadModal(addedIcons, 'single');
              }
            }
          });
          $('#uploadIconModal').addClass('hidden');
        } else if (svgFiles.length > 1) {
          SF.handleSVGFiles(svgFiles, {
            onComplete: function (addedIcons) {
              if (addedIcons && addedIcons.length) {
                openMultiUploadModal(addedIcons, 'multi');
              }
            }
          });
          $('#uploadIconModal').addClass('hidden');
        } else if (files.length > 0) {
          SF.showToast('Please choose SVG files only');
        }

        pendingUploadIconName = '';
        document.body.removeChild(picker);
      }, { once: true });

      picker.click();
    });

    $(document).on('keydown', '#uploadIconName', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#uploadIconConfirmBtn').click();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        $('#uploadIconCancelBtn').click();
      }
    });

    $(document).on('input', '#uploadSetGSuffix, #uploadSetPrefix, #uploadSetSSuffix', function () {
      updateUploadNamingPreview();
      updateUploadTagPreview();
    });

    $(document).on('input', '#uploadSetTagName, #uploadSetNameAttr, #uploadSetClassAttr, #uploadSetExtraClass', updateUploadTagPreview);

    $(document).on('change', '#uploadIconFileInput', function () {
      if (this.files && this.files[0]) {
        var files = Array.from(this.files).filter(function (f) {
          return /\.svg$/i.test(f.name || '');
        });
        if (files.length > 1) {
          SF.handleSVGFiles(files, {
            onComplete: function (addedIcons) {
              openMultiUploadModal(addedIcons || [], 'multi');
            }
          });
          $('#uploadIconModal').addClass('hidden');
        }
      }
      pendingUploadIconName = '';
      this.value = '';
    });

    SF.setupDropZone('#svgDropZone', function (files) {
      SF.handleSVGFiles(files);
    });

    SF.setupDropZone('#spriteDropZone', function (files) {
      if (files.length > 0) SF.handleSpriteFile(files[0]);
    });

    SF.setupDropZone('#cssDropZone', function (files) {
      if (files.length > 0) SF.handleCSSFile(files[0]);
    });

    function refreshGeneratedOutput() {
      var svgCode = SF.generateSVGSprite();
      var cssCode = SF.generateCSS();
      var rawSvg = svgCode;

      svgCode = SF.optimizeSVG(svgCode);
      state.generatedSVG = svgCode;

      if (state.svgo.enabled) {
        var stats = SF.svgoStats(rawSvg, svgCode);
        $('#svgoStatsBar').removeClass('hidden')
          .html(
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
            ' SVGO: ' + SF.formatBytes(stats.original) + ' → ' + SF.formatBytes(stats.optimized) +
            ' <strong>(−' + stats.pct + '%)</strong>'
          );
      } else {
        $('#svgoStatsBar').addClass('hidden');
      }

      var dims = SF.calculateLayout();
      $('#spritePreview').html(SF.buildSpritePreview(dims));
      $('#svgCode').text(svgCode);
      $('#cssCode').text(cssCode);
      $('#outputSection').removeClass('hidden');
      SF.renderHelpDoc();
    }

    function ensureClearAllModal() {
      if ($('#clearAllModal').length) return;
      $('body').append(
        '<div class="modal-overlay hidden" id="clearAllModal">' +
          '<div class="modal-overlay-bg"></div>' +
          '<div class="modal modal-sm">' +
            '<div class="modal-header">' +
              '<h3>' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                  '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
                  '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
                '</svg>' +
                'Clear All Icons' +
              '</h3>' +
              '<button class="modal-close" id="clearAllCloseBtn">&times;</button>' +
            '</div>' +
            '<div class="modal-body">' +
              '<p style="margin:0;color:var(--text-secondary);">Remove all icons from this section?</p>' +
            '</div>' +
            '<div class="modal-footer">' +
              '<button class="btn btn-ghost" id="clearAllCancelBtn">Cancel</button>' +
              '<button class="btn btn-primary" id="clearAllConfirmBtn">Clear All</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    function closeClearAllModal() {
      $('#clearAllModal').addClass('hidden');
    }

    function openClearAllModal() {
      ensureClearAllModal();
      $('#clearAllModal').removeClass('hidden');
    }

    // ---- Icon Name Editing ----
    $(document).on('change', '.icon-name-input', function () {
      var index = parseInt($(this).attr('data-index'), 10);
      var newName = $.trim($(this).val());

      if (!newName) {
        alert('Icon name cannot be empty');
        $(this).val(state.icons[index].name);
        return;
      }

      if (index >= 0 && index < state.icons.length) {
        var duplicate = state.icons.some(function (icon, i) {
          return i !== index && icon.name === newName;
        });

        if (duplicate) {
          alert('An icon with this name already exists');
          $(this).val(state.icons[index].name);
          return;
        }

        state.icons[index].name = newName;
        if (!state.icons[index].isExisting) {
          state.icons[index].gId = SF.makeGId(newName);
          state.icons[index].symbolId = SF.makeSymbolId(newName);
        }
        SF.renderIconList();
        if (state.generatedSVG || state.generatedCSS || !$('#outputSection').hasClass('hidden')) {
          refreshGeneratedOutput();
        }
      }
    });

    // ---- Delete Icon ----
    $(document).on('click', '.icon-card-delete', function (e) {
      e.stopPropagation();
      var index = parseInt($(this).attr('data-index'), 10);
      if (index >= 0 && index < state.icons.length) {
        state.icons.splice(index, 1);
        SF.renderIconList();
      }
    });

    // ---- Workspace Icon Customise Modal ----
    $(document).on('click', '.icon-card', function (e) {
      if ($(e.target).closest('.icon-card-delete, .icon-name-input, .icon-card-drag, .icon-usage-copy').length) return;
      var index = parseInt($(this).attr('data-index'), 10);
      if (isNaN(index) || index < 0 || index >= state.icons.length) return;
      _workspaceModalIconIndex = index;
      openMultiUploadModal([state.icons[index]], 'workspace');
    });

    // ---- Clear All ----
    $('#clearAllBtn').on('click', function () {
      if (state.icons.length > 0) openClearAllModal();
    });

    $(document).on('click', '#clearAllCloseBtn, #clearAllCancelBtn', function () {
      closeClearAllModal();
    });

    $(document).on('click', '#clearAllModal .modal-overlay-bg', function () {
      closeClearAllModal();
    });

    $(document).on('click', '#clearAllConfirmBtn', function () {
      state.icons = [];
      SF.renderIconList();
      $('#outputSection').addClass('hidden');
      $('#spriteStatus').text('').attr('class', 'upload-status');
      $('#cssStatus').text('').attr('class', 'upload-status');
      closeClearAllModal();
    });

    // ---- Generate Sprite ----
    function doGenerate() {
      // Auto-rename any remaining same-name icons so sprite output is valid
      var usedNames = {};
      state.icons.forEach(function (icon) {
        if (usedNames[icon.name]) {
          var base = icon.name;
          var c = 2;
          while (usedNames[base + '_' + c]) c++;
          icon.name = base + '_' + c;
        }
        icon.gId = SF.makeGId(icon.name);
        icon.symbolId = SF.makeSymbolId(icon.name);
        usedNames[icon.name] = true;
      });

      var svgCode = SF.generateSVGSprite();
      var cssCode = window.sfCssPreference !== false ? SF.generateCSS() : '';

      // Apply SVGO optimization
      var rawSvg = svgCode;
      svgCode = SF.optimizeSVG(svgCode);
      state.generatedSVG = svgCode;
      state.generatedCSS = cssCode;

      // Show optimization stats if SVGO is enabled
      if (state.svgo.enabled) {
        var stats = SF.svgoStats(rawSvg, svgCode);
        $('#svgoStatsBar').removeClass('hidden')
          .html(
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
            ' SVGO: ' + SF.formatBytes(stats.original) + ' → ' + SF.formatBytes(stats.optimized) +
            ' <strong>(−' + stats.pct + '%)</strong>'
          );
      } else {
        $('#svgoStatsBar').addClass('hidden');
      }

      // Track icon usage
      var names = state.icons.map(function (ic) { return ic.name; });
      SF.recordIconUsage(names);
      SF.renderMostUsedIcons();

      var dims = SF.calculateLayout();
      var previewHtml = SF.buildSpritePreview(dims);
      $('#spritePreview').html(previewHtml);

      $('#svgCode').text(svgCode);
      $('#cssCode').text(cssCode);

      $('#outputSection').removeClass('hidden');

      // Hide/show CSS elements based on preference
      if (window.sfCssPreference === false) {
        // CSS not needed - hide CSS tab and button
        $('.code-tab[data-out="css"]').addClass('hidden');
        $('#copyCssBtn').addClass('hidden');
        $('#cssCode').addClass('hidden');
      } else {
        // CSS needed - show all tabs
        $('.code-tab[data-out="css"]').removeClass('hidden');
        $('#copyCssBtn').removeClass('hidden');
      }

      $('.code-tab').removeClass('active');
      $('.code-tab[data-out="svg"]').addClass('active');
      $('#svgCode').removeClass('hidden');
      $('#copySvgBtn').removeClass('hidden');

      SF.renderIconList();

      setTimeout(function () {
        $('#outputSection')[0].scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }

    /**
     * Check for duplicate icon names before generating.
     * If duplicates found, show the resolution modal; otherwise proceed.
     * @param {function} generateFn - the function to call to generate
     */
    function checkDuplicatesAndGenerate(generateFn) {
      SF.findAllDuplicates().then(function (dupGroups) {
        if (Object.keys(dupGroups).length > 0) {
          SF.showDuplicateModal(dupGroups, function (choice) {
            if (choice === 'keepall') {
              generateFn();
            } else if (choice === 'selected') {
              var toRemove = SF.getDupUncheckedIndices();
              toRemove.sort(function (a, b) { return b - a; });
              toRemove.forEach(function (idx) {
                state.icons.splice(idx, 1);
              });
              SF.renderIconList();
              generateFn();
            }
          });
        } else {
          generateFn();
        }
      }).catch(function () {
        // If duplicate detection fails, proceed anyway
        generateFn();
      });
    }

    $('#generateBtn').on('click', function () {
      if (state.icons.length === 0) {
        alert('Please add at least one icon before generating.');
        return;
      }

      if (state.mode === 'existing') {
        checkDuplicatesAndGenerate(doGenerate);
      } else {
        // New mode: check dups first, show CSS preference, then ask for names
        checkDuplicatesAndGenerate(function () {
          var $cssModal = $('#cssPreferenceModal');
          window.sfCssPreferenceCallback = function () {
            var $modal = $('#filenameModal');
            resetFilenameModalLayout();
            $modal.data('purpose', 'generate');
            $('#fnameSprite').val(state.newSpriteBaseName || 'sprite');
            $('#fnameCss').val(state.newCssBaseName || 'sprite');
            // Hide CSS name input if CSS not needed
            if (window.sfCssPreference === false) {
              $('#fnameCssGroup').addClass('hidden');
            } else {
              $('#fnameCssGroup').removeClass('hidden');
            }
            $modal.removeClass('hidden');
            setTimeout(function () {
              $('#fnameSprite').trigger('focus').trigger('select');
            }, 80);
          };
          if ($cssModal.length) {
            $('#generateCssCheckbox').prop('checked', true);
            $cssModal.removeClass('hidden');
          } else {
            window.sfCssPreference = true;
            window.sfCssPreferenceCallback();
          }
        });
      }
    });

    // ---- Output Tabs ----
    $(document).on('click', '.code-tab', function () {
      var tab = $(this).data('out');
      $('.code-tab').removeClass('active');
      $(this).addClass('active');

      if (tab === 'svg') {
        $('#svgCode').removeClass('hidden');
        $('#cssCode').addClass('hidden');
        $('#copySvgBtn').removeClass('hidden');
        $('#copyCssBtn').addClass('hidden');
      } else {
        $('#svgCode').addClass('hidden');
        $('#cssCode').removeClass('hidden');
        $('#copySvgBtn').addClass('hidden');
        $('#copyCssBtn').removeClass('hidden');
      }
    });

    // ---- Downloads ----
    $('#downloadSvgBtn').on('click', function () {
      if (!state.generatedSVG) return;
      var $modal = $('#filenameModal');
      resetFilenameModalLayout();
      $modal.data('purpose', 'download');
      $modal.data('downloadType', 'svg');
      $('#fnameSprite').val(state.newSpriteBaseName || state.sourceSpriteName || 'sprite');
      $('#fnameCss').val(state.newCssBaseName || state.sourceCssName || 'sprite');
      $modal.removeClass('hidden');
      setTimeout(function () {
        $('#fnameSprite').trigger('focus').trigger('select');
      }, 80);
    });

    $('#downloadCssBtn').on('click', function () {
      if (!state.generatedCSS) return;
      var $modal = $('#filenameModal');
      resetFilenameModalLayout();
      $modal.data('purpose', 'download');
      $modal.data('downloadType', 'css');
      $('#fnameSprite').val(state.newSpriteBaseName || state.sourceSpriteName || 'sprite');
      $('#fnameCss').val(state.newCssBaseName || state.sourceCssName || 'sprite');
      $modal.removeClass('hidden');
      setTimeout(function () {
        $('#fnameCss').trigger('focus').trigger('select');
      }, 80);
    });

    // ---- Download as Folder ----
    $('#downloadFolderBtn').on('click', function () {
      if (!state.generatedSVG || !state.generatedCSS) return;
      var $modal = $('#filenameModal');
      resetFilenameModalLayout();
      $modal.data('purpose', 'download');
      $modal.data('downloadType', 'folder');
      $('#fnameSprite').val(state.newSpriteBaseName || state.sourceSpriteName || 'sprite');
      $('#fnameCss').val(state.newCssBaseName || state.sourceCssName || 'sprite');
      $('#fnameFolder').val(state.newSpriteBaseName || state.sourceSpriteName || 'sprite-icons');
      $('#fnameFolderGroup').removeClass('hidden');
      $modal.removeClass('hidden');
      setTimeout(function () {
        $('#fnameFolder').trigger('focus').trigger('select');
      }, 80);
    });

    // Filename prompt modal handlers
    $('#fnameCancel, #fnameCloseBtn').on('click', function () {
      $('#filenameModal').addClass('hidden');
      resetFilenameModalLayout();
      pendingSingleUpload = null;
    });
    $('#filenameModal .modal-overlay-bg').on('click', function () {
      $('#filenameModal').addClass('hidden');
      resetFilenameModalLayout();
      pendingSingleUpload = null;
    });
    $('#fnameConfirm').on('click', function () {
      var spriteName = $.trim($('#fnameSprite').val()) || 'sprite';
      spriteName = spriteName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      var cssName = $.trim($('#fnameCss').val()) || 'sprite';
      cssName = cssName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      state.newSpriteBaseName = spriteName;
      state.newCssBaseName = cssName;
      $('#filenameModal').addClass('hidden');

      var purpose = $('#filenameModal').data('purpose');
      if (purpose === 'generate') {
        resetFilenameModalLayout();
        doGenerate();
      } else if (purpose === 'saveproject') {
        var folderName = $.trim($('#fnameFolder').val()) || 'sprite-icons';
        folderName = folderName.replace(/[^a-zA-Z0-9_.-]/g, '_');
        var ext = state.sourceCssExt || 'css';
        var shouldIncludeCss = window.sfCssPreference !== false && !!state.generatedCSS;
        
        // For Add Sprite flow, check if CSS is needed
        if (!shouldIncludeCss) {
          SF.saveToProject(folderName, spriteName + '.svg', null);
        } else {
          SF.saveToProject(folderName, spriteName + '.svg', cssName + '.' + ext);
        }
        
        resetFilenameModalLayout();
      } else if (purpose === 'singleuploadfolder') {
        if (pendingSingleUpload) {
          var savedSingleIcon = pendingSingleUpload;
          SF.saveSingleIconToLibrary(
            savedSingleIcon.name,
            buildStandaloneIconSvg(savedSingleIcon),
            {
              onSuccess: function () {
                removeIconsFromWorkspace([savedSingleIcon]);
              }
            }
          );
        }
        pendingSingleUpload = null;
        resetFilenameModalLayout();
      } else {
        var downloadType = $('#filenameModal').data('downloadType');
        if (downloadType === 'folder') {
          var folderName = $.trim($('#fnameFolder').val()) || 'sprite-icons';
          folderName = folderName.replace(/[^a-zA-Z0-9_.-]/g, '_');
          var ext = state.sourceCssExt || 'css';
          SF.downloadAsFolder(folderName, spriteName + '.svg', cssName + '.' + ext);
          resetFilenameModalLayout();
        } else if (downloadType === 'svg') {
          SF.downloadFile(state.generatedSVG, spriteName + '.svg', 'image/svg+xml');
        } else {
          var ext = state.sourceCssExt || 'css';
          SF.downloadFile(state.generatedCSS, cssName + '.' + ext, 'text/css');
        } 
      }
    });

    // ---- Multi Upload Modal ----
    $(document).on('click', '#multiUploadCloseBtn, #multiUploadDoneBtn', function () {
      $('#multiUploadModal').addClass('hidden');
      multiUploadSelection = [];
      pendingSingleUpload = null;
      _workspaceModalIconIndex = -1;
    });

    $(document).on('click', '#multiUploadModal .modal-overlay-bg', function () {
      $('#multiUploadModal').addClass('hidden');
      multiUploadSelection = [];
      pendingSingleUpload = null;
      _workspaceModalIconIndex = -1;
    });

    $(document).on('change', '#multiUploadKeepNames', function () {
      renderMultiUploadSelection();
    });

    $(document).on('change', '.multi-upload-name-field', function () {
      syncMultiUploadIconNames();
      renderMultiUploadSelection();
      SF.renderIconList();
    });

    $(document).on('click', '.multi-upload-icon-card', function (e) {
      if ($(e.target).closest('.multi-upload-name-field, .multi-upload-select-btn').length) return;
      toggleMultiUploadIconSelection(parseInt($(this).data('multi-index'), 10));
    });

    $(document).on('click', '.multi-upload-select-btn', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMultiUploadIconSelection(parseInt($(this).data('multi-index'), 10));
    });

    $(document).on('click', '#multiUploadModeBtns .doc-mode-btn', function () {
      setMultiUploadMode($(this).data('colormode') || 'original');
    });

    $(document).on('input', '#multiUploadSingleColor', function () {
      $('#multiUploadSingleColorHex').val($(this).val());
    });

    $(document).on('change', '#multiUploadSingleColorHex', function () {
      var v = $.trim($(this).val());
      if (/^#[0-9a-fA-F]{6}$/.test(v)) $('#multiUploadSingleColor').val(v);
    });

    $(document).on('input', '#multiUploadFill', function () {
      $('#multiUploadFillHex').val($(this).val());
    });

    $(document).on('change', '#multiUploadFillHex', function () {
      var v = $.trim($(this).val());
      if (/^#[0-9a-fA-F]{6}$/.test(v)) $('#multiUploadFill').val(v);
    });

    $(document).on('input', '#multiUploadStroke', function () {
      $('#multiUploadStrokeHex').val($(this).val());
    });

    $(document).on('change', '#multiUploadStrokeHex', function () {
      var v = $.trim($(this).val());
      if (/^#[0-9a-fA-F]{6}$/.test(v)) $('#multiUploadStroke').val(v);
    });

    $(document).on('click', '#multiUploadApplyBtn', function () {
      applyColorsToMultiSelection();
    });

    $(document).on('click', '#multiUploadCombineBtn', function () {
      var selectedIcons = multiUploadSelection.filter(function (icon) {
        return icon && icon._multiSelected !== false;
      });

      if (selectedIcons.length < 2) {
        SF.showToast('Select at least 2 icons to combine');
        return;
      }

      var combinedIcon = _buildCombinedIconFromSelection(selectedIcons);
      if (!combinedIcon) {
        SF.showToast('Could not combine selected icons');
        return;
      }

      var selectedIds = {};
      selectedIcons.forEach(function (icon) {
        if (icon && icon.id) selectedIds[icon.id] = true;
      });

      var inserted = false;
      var nextIcons = [];
      (state.icons || []).forEach(function (icon) {
        if (icon && selectedIds[icon.id]) {
          if (!inserted) {
            nextIcons.push(combinedIcon);
            inserted = true;
          }
          return;
        }
        nextIcons.push(icon);
      });

      if (!inserted) {
        nextIcons.push(combinedIcon);
      }

      state.icons = nextIcons;
      multiUploadSelection = [combinedIcon];

      SF.renderIconList();
      if (state.generatedSVG || state.generatedCSS || !$('#outputSection').hasClass('hidden')) {
        refreshGeneratedOutput();
      }
      renderMultiUploadSelection();
      SF.showToast('Combined ' + selectedIcons.length + ' icons into one');
    });

    $(document).on('click', '#multiUploadGenerateBtn', function () {
      syncMultiUploadIconNames();
      applyUploadModalSettings();
      if (multiUploadFlow === 'workspace') {
        if (typeof SF.configureRightPanelForGenerator === 'function') {
          SF.configureRightPanelForGenerator();
        }
        multiUploadSelection = [];
        pendingSingleUpload = null;
        _workspaceModalIconIndex = -1;
        renderMultiUploadSelection();
        return;
      }
      $('#multiUploadModal').addClass('hidden');
      if (multiUploadFlow === 'single') {
        pendingSingleUpload = multiUploadSelection[0] || null;
        if (pendingSingleUpload) {
          var savedSingleIcon = pendingSingleUpload;
          SF.saveSingleIconToLibrary(
            savedSingleIcon.name,
            buildStandaloneIconSvg(savedSingleIcon),
            {
              onSuccess: function () {
                removeIconsFromWorkspace([savedSingleIcon]);
              }
            }
          );
        }
        pendingSingleUpload = null;
        multiUploadSelection = [];
      } else {
        var iconsToSave = (multiUploadSelection || []).slice();
        if (!iconsToSave.length) {
          multiUploadSelection = [];
          SF.showToast('No icons selected to save');
          return;
        }

        // Show CSS preference modal for Add Sprite flow
        var $cssModal = $('#cssPreferenceModal');
        window.sfCssPreferenceCallback = function () {
          doGenerate();

          // Preserve original flow: prompt for sprite/css/folder names before saving.
          var baseSeed = SF.cleanFileName((iconsToSave[0] && iconsToSave[0].name) || 'sprite') || 'sprite';
          var $modal = $('#filenameModal');
          resetFilenameModalLayout();
          $modal.data('purpose', 'saveproject');
          $('#fnameSprite').val(state.newSpriteBaseName || baseSeed);
          $('#fnameCss').val(state.newCssBaseName || baseSeed);
          $('#fnameFolder').val((state.newSpriteBaseName || baseSeed) + '-icons');
          $('#fnameFolderGroup').removeClass('hidden');
          
          // Hide CSS group if CSS is not needed
          if (window.sfCssPreference === false) {
            $('#fnameCssGroup').addClass('hidden');
          } else {
            $('#fnameCssGroup').removeClass('hidden');
          }
          
          $modal.removeClass('hidden');
          setTimeout(function () {
            $('#fnameFolder').trigger('focus').trigger('select');
          }, 80);

          multiUploadSelection = [];
          pendingSingleUpload = null;
        };
        
        if ($cssModal.length) {
          $cssModal.removeClass('hidden');
          // Set default to checked
          $('#generateCssCheckbox').prop('checked', true);
        } else {
          // Fallback if modal not found
          window.sfCssPreference = true;
          window.sfCssPreferenceCallback();
        }
      }
    });
    // Allow Enter key inside inputs
    $('#fnameSprite, #fnameCss, #fnameFolder').on('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('#fnameConfirm').click(); }
      if (e.key === 'Escape') { e.preventDefault(); $('#fnameCancel').click(); }
    });

    // ---- Copy to Clipboard ----
    $('#copySvgBtn').on('click', function () {
      if (!state.generatedSVG) return;
      SF.copyToClipboard(state.generatedSVG, $(this));
    });

    $('#copyCssBtn').on('click', function () {
      if (!state.generatedCSS) return;
      SF.copyToClipboard(state.generatedCSS, $(this));
    });

    // ---- Keyboard shortcut: Escape closes modal ----
    $(document).on('keydown', function (e) {
      if (e.key === 'Escape') {
        $('#settingsModal').addClass('hidden');
      }
    });

    // ---- Usage tag copy ----
    $(document).on('click', '.icon-usage-copy, .doc-card-copy', function (e) {
      e.stopPropagation();
      var tag = $(this).data('tag');
      if (tag) SF.copyToClipboard(tag, $(this));
    });

    // ---- Save to Project ----
    $('#saveToProjectBtn').on('click', function () {
      // debugger;
      if (!state.generatedSVG) return;
      var $modal = $('#filenameModal');
      resetFilenameModalLayout();
      $modal.data('purpose', 'saveproject');
      $('#fnameSprite').val(state.newSpriteBaseName || state.sourceSpriteName || 'sprite');
      $('#fnameCss').val(state.newCssBaseName || state.sourceCssName || 'sprite');
      $('#fnameFolder').val(state.newSpriteBaseName || state.sourceSpriteName || 'sprite-icons');
      $('#fnameFolderGroup').removeClass('hidden');
      if (window.sfCssPreference === false || !state.generatedCSS) {
        $('#fnameCssGroup').addClass('hidden');
      }
      $modal.removeClass('hidden');
      setTimeout(function () {
        $('#fnameFolder').trigger('focus').trigger('select');
      }, 80);
    });

    // ---- Help Doc Page ----
    $('#helpDocBtn').on('click', function () {
      SF.switchPage('helpdoc');
    });

    // ---- Saved Sprites Page ----
    $('#savedSpritesBtn').on('click', function () {
      SF.switchPage('savedsprites');
    });

    // ---- Saved WebFonts Page ----
    $('#savedWebfontsBtn').on('click', function () {
      SF.switchPage('savedwebfonts');
      SF.loadSavedWebFonts();
    });

    // Saved folders: delete
    $(document).on('click', '.saved-delete-btn', function () {
      var name = $(this).data('folder');
      if (!name) return;
      if (!_toastDeleteConfirm('saved', String(name), String(name))) return;
      if (name) {
        SF.deleteSavedFolder(name);
        if (typeof SF.loadLibraryFolders === 'function') SF.loadLibraryFolders();
      }
    });

    // Saved folders: view (open files in new tabs)
    $(document).on('click', '.saved-open-btn', function () {
      var openPath = $(this).data('openPath');
      var name = $(this).data('folder');
      var isLs = $(this).data('ls');

      if (!isLs && openPath) {
        _openResolvedSpriteUrl(openPath, '');
        return;
      }

      // localStorage entry: find SVG content and open as data URI
      var lsAll = typeof SF !== 'undefined' && SF.lsFolders ? SF.lsFolders.get() : [];
      var lsFolder = null;
      for (var i = 0; i < lsAll.length; i++) {
        if (lsAll[i].name === name && lsAll[i]._ls) { lsFolder = lsAll[i]; break; }
      }
      if (lsFolder) {
        var svgContent = lsFolder._svgContent || lsFolder.previewSvg || '';
        var lsSvgFile = '';
        if (Array.isArray(lsFolder.files)) {
          for (var j = 0; j < lsFolder.files.length; j++) {
            var f = lsFolder.files[j];
            var n = (f && f.name) ? String(f.name) : '';
            if (/\.svg$/i.test(n)) {
              lsSvgFile = n;
              break;
            }
          }
        }

        // In hosted mode, prefer the real sprite URL format over inline about:blank preview.
        if (!IS_LOCAL_HOST && lsSvgFile) {
          var lsOpenPath = 'saved-sprites/' + encodeURIComponent(lsFolder.name || '') + '/' + encodeURIComponent(lsSvgFile);
          if (_openResolvedSpriteUrl(lsOpenPath, '')) {
            return;
          }
        }

        if (!svgContent && lsFolder._icons) {
          var firstKey = Object.keys(lsFolder._icons)[0];
          if (firstKey) svgContent = lsFolder._icons[firstKey];
        }
        if (svgContent) {
          if (!_openInlineSvg(svgContent)) {
            SF.showToast('Popup blocked. Please allow popups for this site.');
          }
          return;
        }
      }

      if (openPath) {
        _openResolvedSpriteUrl(openPath, '');
      } else {
        SF.showToast('No preview available for this item');
      }
    });

    // Saved folders: download SVG + CSS bundle
    $(document).on('click', '.saved-download-btn', function () {
      var name = $(this).data('folder');
      if (!name || typeof SF.downloadSavedBundle !== 'function') return;
      SF.downloadSavedBundle(name);
    });

    // Saved folders: refresh
    $(document).on('click', '#refreshSavedBtn', function () {
      SF.loadSavedFolders();
    });

    // ---- Icon Library Page ----
    $('#iconLibraryBtn').on('click', function () {
      SF.switchPage('iconlibrary');
    });

    // Library sprite upload (drop zone)
    (function () {
      var $zone = $('#libSpriteDropZone');
      var $input = $zone.find('.file-input');

      $zone.on('click', function () { $input.trigger('click'); });
      $input.on('click', function (e) { e.stopPropagation(); });
      $input.on('change', function () {
        if (this.files && this.files[0]) SF.handleLibrarySpriteFile(this.files[0]);
      });

      $zone.on('dragover', function (e) {
        e.preventDefault();
        $zone.addClass('drag-over');
      }).on('dragleave drop', function () {
        $zone.removeClass('drag-over');
      }).on('drop', function (e) {
        e.preventDefault();
        var files = e.originalEvent.dataTransfer.files;
        if (files && files[0]) SF.handleLibrarySpriteFile(files[0]);
      });
    })();

    // Library search
    $('#libSearch').on('input', function () {
      SF.libState.search = $.trim($(this).val()).toLowerCase();
      SF.renderLibraryGrid();
    });

    // Library tile size selector
    $(document).on('click', '.lib-size-btn', function () {
      var size = $(this).data('size');
      if (!size) return;
      
      // Update active button
      $('.lib-size-btn').removeClass('active');
      $(this).addClass('active');
      
      // Update grid class
      var $grid = $('#libGrid');
      $grid.removeClass('lib-grid-small lib-grid-medium lib-grid-large');
      $grid.addClass('lib-grid-' + size);
      
      // Save preference to localStorage
      try { localStorage.setItem('sf_lib_tile_size', size); } catch (e) {}
    });

    $(document).on('change', '#libSelectAllVisible', function () {
      if (typeof SF.setLibrarySelectionForVisible !== 'function') return;
      SF.setLibrarySelectionForVisible($(this).is(':checked'));
    });

    $(document).on('click', '.library-select-toggle', function (e) {
      e.stopPropagation();
    });

    $(document).on('change', '.library-select-checkbox', function (e) {
      e.stopPropagation();
      var iconId = $(this).data('iconId');
      if (!iconId || typeof SF.toggleLibrarySelection !== 'function') return;
      SF.toggleLibrarySelection(iconId, $(this).is(':checked'));
    });

    $(document).on('click', '.lib-select-card', function (e) {
      if ($(e.target).closest('.saved-folder-actions, .library-select-toggle').length) return;
      var iconId = $(this).data('iconId');
      if (!iconId || typeof SF.toggleLibrarySelection !== 'function') return;
      SF.toggleLibrarySelection(iconId);
    });

    $(document).on('click', '#libAddSelectedBtn', function () {
      if (typeof SF.addSelectedLibraryIconsToSprite !== 'function') return;
      SF.addSelectedLibraryIconsToSprite(function (ok) {
        if (ok) SF.switchPage('generator');
      });
    });

    // Library: open icon preview
    $(document).on('click', '.library-open-btn', function () {
      var iconId = $(this).data('iconId');
      var openPath = $(this).data('openPath');

      if (openPath) {
        _openResolvedSpriteUrl(openPath, '');
        return;
      }

      var icon = (SF.libState.icons || []).find(function (entry) {
        return entry && entry.id === iconId;
      });
      if (icon && icon.svgContent) {
        if (!_openInlineSvg(icon.svgContent)) {
          SF.showToast('Popup blocked. Please allow popups for this site.');
        }
        return;
      }

      SF.showToast('No preview available for this icon');
    });

    // Library: add selected icon to current sprite workspace
    $(document).on('click', '.library-add-btn', function () {
      var iconId = $(this).data('iconId');
      if (!iconId || typeof SF.addLibraryIconToSprite !== 'function') return;
      SF.addLibraryIconToSprite(iconId, function (ok) {
        if (ok) SF.switchPage('generator');
      });
    });

    // Library: delete icon
    $(document).on('click', '.library-delete-btn', function () {
      if ($(this).is(':disabled')) return;
      var iconId = $(this).data('iconId');
      var iconName = $(this).data('iconName') || 'this icon';
      if (!iconId) return;
      if (!_toastDeleteConfirm('library', String(iconId), String(iconName))) return;
      SF.deleteLibraryIcon(iconId);
    });

    // ---- Doc Search ----
    $('#docSearch').on('input', function () {
      state.doc.search = $.trim($(this).val()).toLowerCase();
      SF.renderHelpDoc();
    });

    // ---- Doc Scale ----
    $('#docScale').on('input', function () {
      state.doc.scale = parseInt($(this).val(), 10);
      $('#docScaleValue').text(state.doc.scale + 'px');
      SF.renderHelpDoc();
    });

    function syncDocCustomiseDisabledState() {
      var hasSelectedIcon =
        state.doc.selectedIconIndex !== null &&
        typeof state.doc.selectedIconIndex !== 'undefined' &&
        !!state.icons[state.doc.selectedIconIndex];
      var disableCustomise = state.doc.colorScope === 'selected' && !hasSelectedIcon;
      var $panel = $('#docRightPanel');

      $panel.toggleClass('is-customise-disabled', disableCustomise);
      $panel.attr('aria-disabled', disableCustomise ? 'true' : 'false');

      $panel
        .find('button, input, select, textarea')
        .not('.doc-scope-btn')
        .prop('disabled', disableCustomise);
    }

    // ---- Doc Color Scope Toggle ----
    $(document).on('click', '.doc-scope-btn', function () {
      var scope = $(this).data('scope');
      state.doc.colorScope = scope;
      $('.doc-scope-btn').removeClass('active');
      $(this).addClass('active');

      if (scope === 'all') {
        $('#docAllIconsSection').removeClass('hidden');
        $('#docSelectedSection').addClass('hidden');
        state.doc.selectedIconIndex = null;
        $('.doc-card').removeClass('doc-card-selected');
      } else {
        $('#docAllIconsSection').addClass('hidden');
        $('#docSelectedSection').removeClass('hidden');
        SF.updateSelectedIconPanel();
      }
      syncDocCustomiseDisabledState();
      SF.renderHelpDoc();
    });

    // ---- Doc Card Click (select icon) ----
    $(document).on('click', '.doc-card', function (e) {
      // Don't select if clicking copy button
      if ($(e.target).closest('.doc-card-copy').length) return;
      if (state.doc.colorScope !== 'selected') return;

      var idx = parseInt($(this).data('doc-index'), 10);
      if (isNaN(idx)) return;

      state.doc.selectedIconIndex = idx;
      $('.doc-card').removeClass('doc-card-selected');
      $(this).addClass('doc-card-selected');
      SF.updateSelectedIconPanel();
      syncDocCustomiseDisabledState();
    });

    // ---- Doc Color Mode ----
    $(document).on('click', '.doc-mode-btn', function () {
      var mode = $(this).data('colormode');
      state.doc.colorMode = mode;
      $('.doc-mode-btn').removeClass('active');
      $(this).addClass('active');

      if (mode === 'single') {
        $('#docSingleColorGroup').removeClass('hidden');
        $('.doc-color-multi').addClass('hidden');
      } else if (mode === 'multi') {
        $('#docSingleColorGroup').addClass('hidden');
        $('.doc-color-multi').removeClass('hidden');
      } else {
        $('#docSingleColorGroup').addClass('hidden');
        $('.doc-color-multi').addClass('hidden');
      }
      SF.renderHelpDoc();
    });

    syncDocCustomiseDisabledState();

    // ---- Doc Single Color ----
    $('#docSingleColor').on('input', function () {
      state.doc.singleColor = $(this).val();
      $('#docSingleColorHex').val(state.doc.singleColor);
      SF.renderHelpDoc();
    });
    $('#docSingleColorHex').on('change', function () {
      var v = $.trim($(this).val());
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        state.doc.singleColor = v;
        $('#docSingleColor').val(v);
        SF.renderHelpDoc();
      }
    });

    // ---- Doc Multi Colors ----
    $('#docMultiFill').on('input', function () {
      state.doc.multiFill = $(this).val();
      $('#docMultiFillHex').val(state.doc.multiFill);
      SF.renderHelpDoc();
    });
    $('#docMultiFillHex').on('change', function () {
      var v = $.trim($(this).val());
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        state.doc.multiFill = v;
        $('#docMultiFill').val(v);
        SF.renderHelpDoc();
      }
    });
    $('#docMultiStroke').on('input', function () {
      state.doc.multiStroke = $(this).val();
      $('#docMultiStrokeHex').val(state.doc.multiStroke);
      SF.renderHelpDoc();
    });
    $('#docMultiStrokeHex').on('change', function () {
      var v = $.trim($(this).val());
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        state.doc.multiStroke = v;
        $('#docMultiStroke').val(v);
        SF.renderHelpDoc();
      }
    });

    // ---- Apply to All Icons Button ----
    $('#docApplyAllBtn').on('click', function () {
      var mode = state.doc.colorMode;
      if (mode === 'original') {
        state.icons.forEach(function (icon) {
          icon.rootFill = icon.originalRootFill;
          icon.rootStroke = icon.originalRootStroke;
          icon.colorMode = icon.originalColorMode;
          if (icon.originalSvgContent) icon.svgContent = icon.originalSvgContent;
        });
      } else if (mode === 'single') {
        var c = state.doc.singleColor;
        state.icons.forEach(function (icon) {
          if (!icon.originalSvgContent) icon.originalSvgContent = icon.svgContent;
          if (icon.originalColorMode === 'stroke') {
            icon.colorMode = 'stroke';
            icon.rootStroke = c;
          } else {
            icon.colorMode = 'fill';
            icon.rootFill = c;
          }
          SF.rebuildIconColors(icon);
        });
      } else if (mode === 'multi') {
        state.icons.forEach(function (icon) {
          if (!icon.originalSvgContent) icon.originalSvgContent = icon.svgContent;
          icon.colorMode = 'fill';
          icon.rootFill = state.doc.multiFill;
          icon.rootStroke = state.doc.multiStroke;
          SF.rebuildIconColors(icon);
        });
      }
      SF.renderIconList();
      SF.renderHelpDoc();
      SF.showToast('Colors applied to all icons');
    });

    // ---- Selected Icon: Fill Color ----
    $('#docIconFill').on('input', function () {
      var v = $(this).val();
      $('#docIconFillHex').val(v);
      SF.applySelectedIconColor('fill', v);
    });
    $('#docIconFillHex').on('change', function () {
      var v = $.trim($(this).val());
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        $('#docIconFill').val(v);
        SF.applySelectedIconColor('fill', v);
      }
    });
    $('#docIconFillReset').on('click', function () {
      var idx = state.doc.selectedIconIndex;
      if (idx === null || !state.icons[idx]) return;
      var icon = state.icons[idx];
      icon.rootFill = icon.originalRootFill;
      icon.colorMode = icon.originalColorMode;
      SF.rebuildIconColors(icon);
      SF.updateSelectedIconPanel();
      SF.renderIconList();
      SF.renderHelpDoc();
    });

    // ---- Selected Icon: Stroke Color ----
    $('#docIconStroke').on('input', function () {
      var v = $(this).val();
      $('#docIconStrokeHex').val(v);
      SF.applySelectedIconColor('stroke', v);
    });
    $('#docIconStrokeHex').on('change', function () {
      var v = $.trim($(this).val());
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        $('#docIconStroke').val(v);
        SF.applySelectedIconColor('stroke', v);
      }
    });
    $('#docIconStrokeReset').on('click', function () {
      var idx = state.doc.selectedIconIndex;
      if (idx === null || !state.icons[idx]) return;
      var icon = state.icons[idx];
      icon.rootStroke = icon.originalRootStroke;
      icon.colorMode = icon.originalColorMode;
      SF.rebuildIconColors(icon);
      SF.updateSelectedIconPanel();
      SF.renderIconList();
      SF.renderHelpDoc();
    });

    // ---- Per-Path Color Pickers ----
    $(document).on('input', '.doc-path-color-input', function () {
      var $el = $(this);
      var pathIdx = parseInt($el.data('path-index'), 10);
      var type = $el.data('color-type');
      var color = $el.val();
      $el.closest('.doc-path-color-group').find('.doc-path-color-hex').val(color);
      SF.applyPathColor(pathIdx, type, color);
    });
    $(document).on('change', '.doc-path-color-hex', function () {
      var $el = $(this);
      var v = $.trim($el.val());
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
      var pathIdx = parseInt($el.data('path-index'), 10);
      var type = $el.data('color-type');
      $el.closest('.doc-path-color-group').find('.doc-path-color-input').val(v);
      SF.applyPathColor(pathIdx, type, v);
    });

    // ---- Doc Background ----
    $(document).on('click', '.doc-bg-btn', function () {
      var bg = $(this).data('bg');
      state.doc.bg = bg;
      $('.doc-bg-btn').removeClass('active');
      $(this).addClass('active');
      SF.renderHelpDoc();
    });

    // ---- Doc Copy All Tags ----
    $('#docCopyAllBtn').on('click', function () {
      if (state.icons.length === 0) return;
      var allTags = state.icons.map(function (icon) {
        return SF.buildUsageTag(icon);
      }).join('\n');
      SF.copyToClipboard(allTags, $(this));
    });

    // ---- Doc Export HTML ----
    $('#docDownloadHtmlBtn').on('click', function () {
      if (state.icons.length === 0) return;
      SF.downloadFile(SF.generateHelpDocHTML(), 'icon-reference.html', 'text/html');
    });

    authReady.finally(function () {
      // Initialise icon library safely so unrelated workflows still work
      if (typeof SF.initBuiltInLibrary === 'function') {
        SF.initBuiltInLibrary();
      }
      if (typeof SF.renderLibraryGrid === 'function') {
        SF.renderLibraryGrid();
      }
      if (typeof SF.loadSavedFolders === 'function') {
        SF.loadSavedFolders();
      }
      if (typeof SF.loadSavedWebFonts === 'function') {
        SF.loadSavedWebFonts();
      }

      // Restore tile size preference
      (function () {
        var savedSize = null;
        try { savedSize = localStorage.getItem('sf_lib_tile_size'); } catch (e) {}
        if (savedSize && (savedSize === 'small' || savedSize === 'medium' || savedSize === 'large')) {
          var $grid = $('#libGrid');
          if ($grid.length) {
            $grid.removeClass('lib-grid-small lib-grid-medium lib-grid-large');
            $grid.addClass('lib-grid-' + savedSize);
            $('.lib-size-btn').removeClass('active');
            $('.lib-size-btn[data-size="' + savedSize + '"]').addClass('active');
          }
        }
      })();

      // Initial render
      SF.renderIconList();

      if (state.page === 'generator' && typeof SF.configureRightPanelForGenerator === 'function') {
        SF.configureRightPanelForGenerator();
      }
    });
  }

  // ---- Start the app (wait for component templates to load) ----
  $(document).ready(function () {
    Promise.all(window._componentPromises || []).then(init);
  });

})(window.SpriteForge, jQuery);
