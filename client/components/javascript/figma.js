/**
 * SpriteForge - Figma Integration
 * Import icons directly from a Figma file via the Figma REST API.
 *
 * Flow:
 *  1. User enters a Personal Access Token + Figma file URL
 *  2. We fetch the file's components (icons) from the Figma API
 *  3. User previews and selects which icons to import
 *  4. We export the selected nodes as SVG via the Figma Images API
 *  5. The SVGs are parsed and added to the sprite just like uploaded files
 */
(function (SF, $) {
  'use strict';

  var state = SF.state;
  var API_BASE = 'https://api.figma.com/v1';

  /** Figma-specific state */
  SF.figmaState = {
    token: localStorage.getItem('sf_figma_token') || '',
    fileKey: '',
    fileName: '',
    components: [],   // { id, name, description, containingFrame }
    selected: {},     // { nodeId: true }
    search: '',
    filter: 'all',    // 'all' | 'new' | 'existing'
    loading: false,
    error: ''
  };

  // ── Helpers ────────────────────────────────────────────

  /** Extract the file key from a Figma URL */
  SF.parseFigmaUrl = function (url) {
    // Formats:
    //   https://www.figma.com/file/FILEKEY/FileName
    //   https://www.figma.com/design/FILEKEY/FileName
    //   Just a raw key
    var match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (match) return match[1];
    // Maybe it's just the key itself
    if (/^[a-zA-Z0-9]{10,}$/.test(url.trim())) return url.trim();
    return null;
  };

  /** Make an authenticated Figma API request */
  function figmaFetch(path) {
    var token = SF.figmaState.token;
    if (!token) return Promise.reject(new Error('No Figma token provided'));

    var url = API_BASE + path;
    console.log('[Figma] Request:', url);

    return fetch(url, {
      method: 'GET',
      headers: { 'X-Figma-Token': token }
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          console.error('[Figma] API error:', res.status, body);
          var msg = (body && body.err) ? body.err : (body && body.message) ? body.message : '';
          if (res.status === 403) throw new Error(msg || 'Access denied — check your token and file permissions');
          if (res.status === 404) throw new Error(msg || 'File not found — check the URL');
          throw new Error(msg || 'Figma API error: ' + res.status);
        });
      }
      return res.json();
    });
  }

  // ── Core API ───────────────────────────────────────────

  // Node types that are valid inside a pure icon component
  var VECTOR_TYPES = {
    'VECTOR': true, 'BOOLEAN_OPERATION': true, 'LINE': true,
    'ELLIPSE': true, 'RECTANGLE': true, 'REGULAR_POLYGON': true,
    'STAR': true, 'GROUP': true, 'FRAME': true, 'COMPONENT': true
  };

  // Node types we can request from the Figma Images API as SVG output
  var EXPORTABLE_TYPES = {
    'COMPONENT': true,
    'COMPONENT_SET': true,
    'FRAME': true,
    'GROUP': true,
    'VECTOR': true,
    'BOOLEAN_OPERATION': true,
    'LINE': true,
    'ELLIPSE': true,
    'RECTANGLE': true,
    'REGULAR_POLYGON': true,
    'STAR': true
  };

  // Name patterns that indicate UI components (not icons)
  var UI_NAME_PATTERN = /\b(button|btn|header|footer|navbar|nav[\s_-]?bar|sidebar|card|input|text[\s_-]?field|text[\s_-]?area|dropdown|select|checkbox|radio|toggle|switch|tab|chip|badge|tag|tooltip|popover|modal|dialog|alert|banner|toast|snackbar|avatar|divider|separator|stepper|pagination|breadcrumb|menu[\s_-]?item|list[\s_-]?item|table|row|column|cell|form|label|placeholder|search[\s_-]?bar|toolbar|appbar|status[\s_-]?bar|loader|spinner|skeleton|progress|slider|carousel|accordion)\b/i;

  /**
   * Check whether a Figma COMPONENT node looks like an icon.
   * Icons are small, roughly square, pure-vector elements.
   * Non-icons: buttons, cards, inputs, illustrations, UI pieces.
   */
  function looksLikeIcon(node) {
    // Name-based exclusion — reject known UI component names
    var name = (node.name || '').toLowerCase();
    if (UI_NAME_PATTERN.test(name)) return false;

    var bb = node.absoluteBoundingBox;
    if (!bb) return true; // no bbox info — include by default

    var w = bb.width;
    var h = bb.height;

    // Icons are typically 8–128px (allow up to 128 for large icon sets)
    if (w > 128 || h > 128) return false;
    if (w < 4 || h < 4) return false;

    // Aspect ratio — icons are nearly square (allow 2:1 max)
    var ratio = Math.max(w, h) / Math.max(Math.min(w, h), 1);
    if (ratio > 2) return false;

    // Reject components whose children are not pure vector content
    if (!isVectorOnly(node)) return false;

    return true;
  }

  /**
   * Similar heuristic as looksLikeIcon but used for non-component node types
   * so we can include full icon sets built from frames/groups/vectors.
   */
  function looksLikeExportableIcon(node) {
    if (!node || !EXPORTABLE_TYPES[node.type]) return false;
    if (node.visible === false) return false;

    // Exclude obviously non-icon UI primitives by name.
    var nodeName = (node.name || '').toLowerCase();
    if (UI_NAME_PATTERN.test(nodeName)) return false;

    var bb = node.absoluteBoundingBox;
    if (!bb) return true;

    var w = bb.width;
    var h = bb.height;
    if (w > 128 || h > 128) return false;
    if (w < 4 || h < 4) return false;

    var ratio = Math.max(w, h) / Math.max(Math.min(w, h), 1);
    if (ratio > 2) return false;

    // For container nodes, keep only pure-vector trees.
    if ((node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT') && !isVectorOnly(node)) {
      return false;
    }

    return true;
  }

  /**
   * Check that a node tree contains ONLY vector-type children.
   * Returns false if any TEXT, INSTANCE, SLICE, or other non-vector node is found.
   */
  function isVectorOnly(node) {
    if (!node.children) return true;
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      if (!VECTOR_TYPES[child.type]) return false;
      if (!isVectorOnly(child)) return false;
    }
    return true;
  }

  /**
   * Recursively walk the Figma document tree and collect all
   * COMPONENT and COMPONENT_SET nodes that look like icons.
   */
  function collectComponents(node, parentFrame) {
    var results = [];
    var frameName = parentFrame || '';

    // Track the containing frame/group name for context
    if (node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'SECTION') {
      frameName = node.name || frameName;
    }

    if (node.type === 'COMPONENT' && looksLikeIcon(node)) {
      results.push({
        id: node.id,
        name: node.name || node.id,
        description: node.description || '',
        containingFrame: frameName
      });
    }

    // For COMPONENT_SET (variant groups), collect each variant child
    if (node.type === 'COMPONENT_SET' && node.children && looksLikeIcon(node)) {
      node.children.forEach(function (child) {
        if (child.type === 'COMPONENT' && looksLikeIcon(child)) {
          results.push({
            id: child.id,
            name: node.name + ' / ' + child.name,
            description: child.description || node.description || '',
            containingFrame: frameName
          });
        }
      });
      return results; // Don't recurse further into variant children
    }

    // Recurse into children
    if (node.children && node.children.length) {
      node.children.forEach(function (child) {
        results = results.concat(collectComponents(child, frameName));
      });
    }

    return results;
  }

  /**
   * Fetch all components from a Figma file.
   * Traverses the full document tree to find COMPONENT nodes.
   */
  SF.figmaFetchComponents = function () {
    var fs = SF.figmaState;
    fs.loading = true;
    fs.error = '';
    fs.components = [];
    fs.selected = {};
    SF.renderFigmaGrid();

    return figmaFetch('/files/' + fs.fileKey)
      .then(function (data) {
        fs.fileName = data.name || 'Untitled';
        $('#figmaFileName').text(fs.fileName);

        // Walk the full document tree for icon-like exportable nodes
        var list = collectComponents(data.document, '');

        // Also merge any published components from the metadata
        var publishedComps = data.components || {};
        var foundIds = {};
        list.forEach(function (c) { foundIds[c.id] = true; });

        Object.keys(publishedComps).forEach(function (nodeId) {
          if (foundIds[nodeId]) return;
          var comp = publishedComps[nodeId];
          list.push({
            id: nodeId,
            name: comp.name || nodeId,
            description: comp.description || '',
            containingFrame: comp.containing_frame ? comp.containing_frame.name : ''
          });
        });

        // Sort alphabetically
        list.sort(function (a, b) {
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        fs.components = list;
        fs.loading = false;
        $('#figmaCompCount').text(list.length);
        SF.renderFigmaGrid();

        if (list.length === 0) {
          fs.error = 'No components found in this file. Make sure the file contains component nodes (not just plain shapes).';
          SF.renderFigmaGrid();
          return;
        }

        // Fetch thumbnail previews for all components
        SF.figmaFetchThumbnails();

        // Auto-compare with current sprite icons
        SF.figmaCompare();
      })
      .catch(function (err) {
        fs.loading = false;
        fs.error = err.message || 'Failed to fetch file';
        SF.renderFigmaGrid();
      });
  };

  /**
   * Compare Figma components against current sprite icons.
   * Tags each component as isNew or isExisting, shows a diff banner,
   * and auto-selects new icons.
   */
  SF.figmaCompare = function () {
    var fs = SF.figmaState;
    var existingNames = {};
    state.icons.forEach(function (ic) {
      existingNames[ic.name.toLowerCase()] = true;
    });

    var newCount = 0;
    var existingCount = 0;

    fs.components.forEach(function (comp) {
      var cleanName = comp.name
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
      comp._cleanName = cleanName;
      if (existingNames[cleanName]) {
        comp._inSprite = true;
        existingCount++;
      } else {
        comp._inSprite = false;
        newCount++;
      }
    });

    var hasSprite = state.icons.length > 0;
    var $banner = $('#figmaDiffBanner');

    if (hasSprite && newCount > 0) {
      // Auto-select new icons and show filter on "new"
      fs.selected = {};
      fs.components.forEach(function (comp) {
        if (!comp._inSprite) {
          fs.selected[comp.id] = true;
        }
      });
      fs.filter = 'new';

      $banner.html(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>' +
          '<line x1="8" y1="12" x2="16" y2="12"/>' +
        '</svg>' +
        '<span><strong>' + newCount + ' new icon' + (newCount > 1 ? 's' : '') + '</strong> found that ' +
        (newCount > 1 ? 'are' : 'is') + ' not in your current sprite. ' +
        (newCount > 1 ? 'They have' : 'It has') + ' been auto-selected for import.</span>'
      ).removeClass('hidden').attr('class', 'figma-diff-banner figma-diff-banner--new');

      // Update filter tabs
      SF.updateFigmaFilterTabs(newCount, existingCount);
      SF.renderFigmaGrid();
    } else if (hasSprite && newCount === 0) {
      fs.filter = 'all';
      $banner.html(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
          '<polyline points="22 4 12 14.01 9 11.01"/>' +
        '</svg>' +
        '<span>All ' + existingCount + ' icons in this Figma file are already in your sprite. You\'re up to date!</span>'
      ).removeClass('hidden').attr('class', 'figma-diff-banner figma-diff-banner--ok');

      SF.updateFigmaFilterTabs(0, existingCount);
      SF.renderFigmaGrid();
    } else {
      // No sprite loaded — hide diff banner, show all
      fs.filter = 'all';
      $banner.addClass('hidden');
      $('#figmaFilterTabs').addClass('hidden');
    }
  };

  /** Update the filter tab labels */
  SF.updateFigmaFilterTabs = function (newCount, existingCount) {
    var total = newCount + existingCount;
    $('#figmaFilterAll .figma-filter-count').text(total);
    $('#figmaFilterNew .figma-filter-count').text(newCount);
    $('#figmaFilterExisting .figma-filter-count').text(existingCount);

    // Highlight active tab
    $('.figma-filter-tab').removeClass('active');
    if (SF.figmaState.filter === 'new') {
      $('#figmaFilterNew').addClass('active');
    } else if (SF.figmaState.filter === 'existing') {
      $('#figmaFilterExisting').addClass('active');
    } else {
      $('#figmaFilterAll').addClass('active');
    }

    $('#figmaFilterTabs').removeClass('hidden');
  };

  /**
   * Fetch PNG thumbnails for all discovered components.
   * Uses the Figma Images API in batches of 100 IDs.
   */
  SF.figmaFetchThumbnails = function () {
    var fs = SF.figmaState;
    var ids = fs.components.map(function (c) { return c.id; });
    if (ids.length === 0) return;

    var batches = [];
    for (var i = 0; i < ids.length; i += 100) {
      batches.push(ids.slice(i, i + 100));
    }

    var thumbMap = {};

    var batchPromises = batches.map(function (batch) {
      var idsParam = batch.join(',');
      return figmaFetch('/images/' + fs.fileKey + '?ids=' + idsParam + '&format=png&scale=2')
        .then(function (data) {
          if (data.images) {
            Object.keys(data.images).forEach(function (nid) {
              if (data.images[nid]) thumbMap[nid] = data.images[nid];
            });
          }
        })
        .catch(function (err) {
          console.warn('[Figma] Thumbnail batch failed:', err.message);
        });
    });

    Promise.all(batchPromises).then(function () {
      // Store thumbnail URLs on each component
      fs.components.forEach(function (comp) {
        if (thumbMap[comp.id]) {
          comp.thumbnailUrl = thumbMap[comp.id];
        }
      });

      // Update cards that are already in the DOM with real images
      fs.components.forEach(function (comp) {
        if (comp.thumbnailUrl) {
          var $card = $('.figma-card[data-figma-id="' + comp.id + '"]');
          if ($card.length) {
            $card.find('.figma-card-icon').html(
              '<img src="' + comp.thumbnailUrl + '" alt="' + SF.escapeAttr(comp.name) + '" />'
            );
          }
        }
      });
    });
  };

  /**
   * Export selected components as SVG and add them to the sprite.
   * Uses the Figma /images endpoint (format=svg) which returns download URLs.
   */
  SF.figmaImportSelected = function () {
    var fs = SF.figmaState;
    var ids = Object.keys(fs.selected);
    if (ids.length === 0) return;

    // Show loading
    $('#figmaImportBtn').prop('disabled', true).html(
      '<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>' +
      '</svg> Importing...'
    );

    console.log('[Figma] Starting import for', ids.length, 'components. IDs:', ids);

    // Step 1: Get SVG export URLs from Figma
    fetchSvgUrls(fs.fileKey, ids, 0)
      .then(function (svgUrls) {
        var urlIds = Object.keys(svgUrls);
        console.log('[Figma] Got', urlIds.length, 'SVG URLs');

        if (urlIds.length === 0) {
          throw new Error(
            'Figma returned no SVG download URLs. ' +
            'Make sure the selected icons are visible and not empty.'
          );
        }

        // Step 2: Download actual SVG content from each URL
        return downloadSvgs(svgUrls);
      })
      .then(function (results) {
        if (!results || results.length === 0) {
          throw new Error(
            'Could not download SVG content. The export URLs may have expired. Please try again.'
          );
        }
        console.log('[Figma] Successfully downloaded', results.length, 'SVGs');
        addImportedSvgs(results, fs);
      })
      .catch(function (err) {
        console.error('Figma import error:', err);
        SF.showToast('Import failed: ' + err.message);
        resetImportBtn();
      });
  };

  function defaultLibraryNameFromComponent(comp, index) {
    var raw = (comp && comp.name) ? String(comp.name) : ('icon_' + (index + 1));
    var safe = SF.cleanFileName(raw) || ('icon_' + (index + 1));
    return safe;
  }

  function collectSelectedComponentIds() {
    return Object.keys(SF.figmaState.selected || {}).filter(function (id) {
      return !!SF.figmaState.selected[id];
    });
  }

  SF.openFigmaLibraryNamesModal = function () {
    var fs = SF.figmaState;
    var ids = collectSelectedComponentIds();
    if (!ids.length) {
      SF.showToast('Select at least one Figma icon');
      return;
    }

    var rows = [];
    ids.forEach(function (id, index) {
      var comp = fs.components.find(function (c) { return c.id === id; }) || null;
      var sourceName = (comp && comp.name) ? String(comp.name) : ('Icon ' + (index + 1));
      var suggestedName = defaultLibraryNameFromComponent(comp, index);
      rows.push(
        '<div class="figma-library-name-row">' +
          '<div class="figma-library-name-label" title="' + SF.escapeAttr(sourceName) + '">' + SF.escapeAttr(sourceName) + '</div>' +
          '<input type="text" class="figma-library-name-input" data-figma-id="' + SF.escapeAttr(id) + '" value="' + SF.escapeAttr(suggestedName) + '" spellcheck="false" autocomplete="off">' +
        '</div>'
      );
    });

    $('#figmaLibraryNamesList').html(rows.join(''));
    $('#figmaLibraryNamesModal').removeClass('hidden');
    setTimeout(function () {
      $('#figmaLibraryNamesList .figma-library-name-input').first().trigger('focus').trigger('select');
    }, 60);
  };

  SF.closeFigmaLibraryNamesModal = function () {
    $('#figmaLibraryNamesModal').addClass('hidden');
  };

  SF.collectFigmaLibraryNames = function () {
    var namesById = {};
    $('#figmaLibraryNamesList .figma-library-name-input').each(function (index) {
      var id = String($(this).attr('data-figma-id') || '');
      if (!id) return;

      var fallback = 'icon_' + (index + 1);
      var typed = $.trim($(this).val() || '');
      var safe = SF.cleanFileName(typed || fallback) || fallback;
      namesById[id] = safe;
      $(this).val(safe);
    });
    return namesById;
  };

  function saveIconToLibraryAsync(iconName, svgText) {
    return new Promise(function (resolve) {
      if (typeof SF.saveSingleIconToLibrary !== 'function') {
        resolve({ ok: false, error: 'Library save is unavailable' });
        return;
      }

      SF.saveSingleIconToLibrary(iconName, svgText, {
        onSuccess: function () {
          resolve({ ok: true });
        },
        onError: function (err) {
          resolve({ ok: false, error: err || 'Save failed' });
        }
      });
    });
  }

  SF.figmaAddSelectedToLibrary = function (namesById) {
    var fs = SF.figmaState;
    var ids = collectSelectedComponentIds();
    if (!ids.length) {
      SF.showToast('Select at least one Figma icon');
      return;
    }

    var $confirmBtn = $('#figmaLibraryNamesConfirmBtn');
    var originalBtnText = $confirmBtn.text();
    $confirmBtn.prop('disabled', true).text('Adding...');

    fetchSvgUrls(fs.fileKey, ids, 0)
      .then(function (svgUrls) {
        var urlIds = Object.keys(svgUrls);
        if (urlIds.length === 0) {
          throw new Error('Figma returned no SVG download URLs for selected icons');
        }
        return downloadSvgs(svgUrls);
      })
      .then(function (results) {
        if (!results || results.length === 0) {
          throw new Error('Could not download selected SVGs');
        }

        var resultById = {};
        results.forEach(function (item) { resultById[item.id] = item; });

        var usedNames = {};
        var successCount = 0;
        var failCount = 0;
        var chain = Promise.resolve();

        ids.forEach(function (id, index) {
          chain = chain.then(function () {
            var item = resultById[id];
            if (!item || !item.svgText) {
              failCount += 1;
              return;
            }

            var comp = fs.components.find(function (c) { return c.id === id; }) || null;
            var requestedName = (namesById && namesById[id]) || defaultLibraryNameFromComponent(comp, index);
            var safeName = SF.cleanFileName(requestedName) || ('icon_' + (index + 1));
            var base = safeName;
            var n = 2;
            while (usedNames[safeName]) {
              safeName = base + '_' + n;
              n += 1;
            }
            usedNames[safeName] = true;

            return saveIconToLibraryAsync(safeName, item.svgText).then(function (res) {
              if (res.ok) successCount += 1;
              else failCount += 1;
            });
          });
        });

        return chain.then(function () {
          return { successCount: successCount, failCount: failCount };
        });
      })
      .then(function (summary) {
        if (summary.successCount > 0) {
          SF.closeFigmaLibraryNamesModal();
          SF.showToast('Added ' + summary.successCount + ' icon' + (summary.successCount === 1 ? '' : 's') + ' to Library' + (summary.failCount ? ' (' + summary.failCount + ' failed)' : ''));
        } else {
          SF.showToast('Could not add selected icons to Library');
        }
      })
      .catch(function (err) {
        SF.showToast('Add to Library failed: ' + (err && err.message ? err.message : 'Unknown error'));
      })
      .finally(function () {
        $confirmBtn.prop('disabled', false).text(originalBtnText || 'Add to Library');
      });
  };


  /**
   * Fetch SVG export URLs via the /images endpoint.
   * Retries up to 3 times (with delays) if Figma returns null URLs
   * (Figma sometimes needs time to render exports).
   */
  function fetchSvgUrls(fileKey, ids, retryCount) {
    var maxRetries = 3;
    var svgUrls = {};
    var batches = [];
    for (var i = 0; i < ids.length; i += 100) {
      batches.push(ids.slice(i, i + 100));
    }

    console.log('[Figma] fetchSvgUrls attempt', retryCount + 1, '— batches:', batches.length);

    return Promise.all(batches.map(function (batch) {
      var idsParam = batch.join(',');
      return figmaFetch('/images/' + fileKey + '?ids=' + idsParam + '&format=svg')
        .then(function (data) {
          console.log('[Figma] Images response keys:', data.images ? Object.keys(data.images).length : 0);
          if (data.images) {
            Object.keys(data.images).forEach(function (nid) {
              if (data.images[nid]) svgUrls[nid] = data.images[nid];
            });
          }
          if (data.err) {
            console.warn('[Figma] Images API error field:', data.err);
          }
        })
        .catch(function (err) {
          console.warn('[Figma] Images API batch error:', err.message);
        });
    })).then(function () {
      // If we got no URLs and have retries left, wait and try again
      if (Object.keys(svgUrls).length === 0 && retryCount < maxRetries) {
        var delay = (retryCount + 1) * 2000;
        console.log('[Figma] No SVG URLs received, retrying in', delay, 'ms...');
        return new Promise(function (resolve) { setTimeout(resolve, delay); })
          .then(function () { return fetchSvgUrls(fileKey, ids, retryCount + 1); });
      }
      return svgUrls;
    });
  }

  /**
   * Download actual SVG content from the URLs returned by the Images API.
   * Handles individual failures gracefully.
   */
  function downloadSvgs(svgUrls) {
    var urlIds = Object.keys(svgUrls);
    console.log('[Figma] Downloading', urlIds.length, 'SVG files...');

    return Promise.all(urlIds.map(function (nid) {
      var url = svgUrls[nid];
      return fetch(url)
        .then(function (res) {
          if (!res.ok) {
            console.warn('[Figma] SVG download failed for', nid, '— status:', res.status);
            return null;
          }
          return res.text();
        })
        .then(function (svgText) {
          if (!svgText) return null;
          // Validate it's actual SVG content
          if (svgText.indexOf('<svg') === -1) {
            console.warn('[Figma] Response for', nid, 'is not SVG:', svgText.substring(0, 100));
            return null;
          }
          return { id: nid, svgText: svgText };
        })
        .catch(function (err) {
          console.warn('[Figma] SVG download error for', nid, ':', err.message);
          return null;
        });
    })).then(function (arr) {
      return arr.filter(function (r) { return r !== null; });
    });
  }

  /**
   * Process downloaded SVGs and add them to the sprite.
   */
  function addImportedSvgs(results, fs) {
    var addedCount = 0;

    results.forEach(function (item) {
      var comp = fs.components.find(function (c) { return c.id === item.id; });
      var name = comp ? comp.name : item.id;
      var cleanName = name
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();

      var finalName = cleanName || 'icon';

      var icon = SF.parseSVGFile(item.svgText, finalName + '.svg');
      if (icon) {
        state.icons.push(icon);
        addedCount++;
      }
    });

    fs.selected = {};
    SF.renderFigmaGrid();
    SF.renderIconList();

    if (state.icons.length > 0) {
      var svgCode = SF.generateSVGSprite();
      var cssCode = SF.generateCSS();
      var dims = SF.calculateLayout();
      var previewHtml = SF.buildSpritePreview(dims);
      $('#spritePreview').html(previewHtml);
      $('#svgCode').text(svgCode);
      $('#cssCode').text(cssCode);
      $('#outputSection').removeClass('hidden');
    }

    resetImportBtn();

    if (addedCount > 0) {
      SF.showToast(addedCount + ' icon' + (addedCount > 1 ? 's' : '') + ' imported from Figma');
    } else {
      SF.showToast('No valid icons could be parsed from the exported SVGs');
    }
  }

  /** Reset the import button to its default state */
  function resetImportBtn() {
    $('#figmaImportBtn').prop('disabled', false).html(
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
        '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' +
      '</svg> Import Selected (<span id="figmaSelCount">0</span>)'
    );
    SF.updateFigmaSelCount();
  }

  // ── Render ─────────────────────────────────────────────

  /** Render the component grid inside the Figma modal */
  SF.renderFigmaGrid = function () {
    var fs = SF.figmaState;
    var $grid = $('#figmaGrid');
    $grid.empty();

    if (fs.loading) {
      $grid.html(
        '<div class="figma-status">' +
          '<svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>' +
          '</svg>' +
          '<span>Fetching components from Figma…</span>' +
        '</div>'
      );
      return;
    }

    if (fs.error) {
      $grid.html(
        '<div class="figma-status figma-status--error">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>' +
            '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
          '</svg>' +
          '<span>' + SF.escapeAttr(fs.error) + '</span>' +
        '</div>'
      );
      return;
    }

    if (fs.components.length === 0) {
      $grid.html(
        '<div class="figma-status">' +
          '<span>Enter a Figma file URL above and click Load to browse components.</span>' +
        '</div>'
      );
      return;
    }

    var search = fs.search;
    var existingNames = {};
    state.icons.forEach(function (ic) { existingNames[ic.name] = true; });

    // Build grouped structure: { frameName: [comp, ...] }
    var groups = {};
    var groupOrder = [];

    fs.components.forEach(function (comp) {
      // Search filter
      if (search) {
        var hay = (comp.name + ' ' + comp.containingFrame + ' ' + comp.description).toLowerCase();
        if (hay.indexOf(search) === -1) return;
      }

      // Diff filter
      var cleanName = comp._cleanName || comp.name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      var inSprite = comp._inSprite !== undefined ? comp._inSprite : !!existingNames[cleanName];

      if (fs.filter === 'new' && inSprite) return;
      if (fs.filter === 'existing' && !inSprite) return;

      var frame = comp.containingFrame || 'Ungrouped';
      if (!groups[frame]) {
        groups[frame] = [];
        groupOrder.push(frame);
      }
      groups[frame].push({ comp: comp, inSprite: inSprite });
    });

    var visibleCount = 0;

    groupOrder.forEach(function (frame) {
      var items = groups[frame];
      visibleCount += items.length;

      // Determine row selection state
      var selectableIds = [];
      var selectedInRow = 0;
      items.forEach(function (item) {
        if (!item.inSprite) {
          selectableIds.push(item.comp.id);
          if (fs.selected[item.comp.id]) selectedInRow++;
        }
      });
      var allSelected = selectableIds.length > 0 && selectedInRow === selectableIds.length;

      // Row header
      var headerHtml =
        '<div class="figma-row-header" data-frame="' + SF.escapeAttr(frame) + '">' +
          '<label class="figma-row-check-label">' +
            '<input type="checkbox" class="figma-row-checkbox"' + (allSelected ? ' checked' : '') +
              (selectableIds.length === 0 ? ' disabled' : '') + '>' +
            '<span class="figma-row-name">' + SF.escapeAttr(frame) + '</span>' +
            '<span class="figma-row-count">' + items.length + '</span>' +
          '</label>' +
        '</div>';
      $grid.append(headerHtml);

      // Icons in this group
      var $row = $('<div class="figma-row-icons"></div>');
      items.forEach(function (item) {
        var comp = item.comp;
        var alreadyAdded = item.inSprite;
        var isSelected = !!fs.selected[comp.id];

        var cardClasses = 'figma-card';
        if (isSelected) cardClasses += ' selected';
        if (alreadyAdded) cardClasses += ' already-added';
        if (!alreadyAdded) cardClasses += ' is-new';

        var html =
          '<div class="' + cardClasses + '" data-figma-id="' + comp.id + '">' +
            (alreadyAdded
              ? '<span class="figma-card-badge">Added</span>'
              : '<div class="figma-card-check">' +
                  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3">' +
                    '<polyline points="20 6 9 17 4 12"/>' +
                  '</svg>' +
                '</div>') +
            '<div class="figma-card-icon">' +
              (comp.thumbnailUrl
                ? '<img src="' + comp.thumbnailUrl + '" alt="' + SF.escapeAttr(comp.name) + '" />'
                : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                    '<rect x="5" y="3" width="14" height="18" rx="2"/>' +
                    '<line x1="9" y1="8" x2="15" y2="8"/>' +
                    '<line x1="9" y1="12" x2="15" y2="12"/>' +
                    '<line x1="9" y1="16" x2="12" y2="16"/>' +
                  '</svg>') +
            '</div>' +
            '<div class="figma-card-body">' +
              '<div class="figma-card-name" title="' + SF.escapeAttr(comp.name) + '">' + SF.escapeAttr(comp.name) + '</div>' +
            '</div>' +
          '</div>';

        $row.append(html);
      });
      $grid.append($row);
    });

    if (visibleCount === 0 && search) {
      $grid.html(
        '<div class="figma-status">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
          '</svg>' +
          '<span>No components match your search</span>' +
        '</div>'
      );
    }

    SF.updateFigmaSelCount();
  };

  /** Update the selected count badge */
  SF.updateFigmaSelCount = function () {
    var count = Object.keys(SF.figmaState.selected).length;
    $('#figmaSelCount').text(count);
    $('#figmaImportBtn').prop('disabled', count === 0);
    $('#figmaAddToLibraryBtn').prop('disabled', count === 0);
  };

  /** Open the Figma modal */
  SF.openFigmaModal = function () {
    var fs = SF.figmaState;
    $('#figmaToken').val(fs.token);
    $('#figmaUrl').val('');
    $('#figmaModal').removeClass('hidden');
    SF.renderFigmaGrid();
  };

  /** Close the Figma modal */
  SF.closeFigmaModal = function () {
    $('#figmaModal').addClass('hidden');
  };

})(window.SpriteForge, jQuery);
