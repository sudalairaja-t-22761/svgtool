/**
 * SpriteForge - Layout Calculation
 * Positions icons within the sprite sheet.
 */
(function (SF) {
  'use strict';

  var state = SF.state;

  /**
   * Calculate the position of each icon in the sprite
   * @returns {{width: number, height: number}} Total sprite dimensions
   */
  SF.calculateLayout = function () {
    var s = state.settings;

    // --- First pass: preserve positions for existing icons, track bounds ---
    var hasExisting = false;
    var maxExistingX = 0, maxExistingY = 0;

    // Per-row tracking: map of Y → { rightEdge, maxHeight }
    var existingRows = {};

    state.icons.forEach(function (icon) {
      if (icon.isExisting && icon.originalSpriteX !== undefined) {
        icon.spriteX = icon.originalSpriteX;
        icon.spriteY = icon.originalSpriteY;
        hasExisting = true;

        maxExistingX = Math.max(maxExistingX, icon.spriteX + icon.width);
        maxExistingY = Math.max(maxExistingY, icon.spriteY + icon.height);

        // Track per-row occupancy
        var rowKey = Math.round(icon.spriteY);
        if (!existingRows[rowKey]) {
          existingRows[rowKey] = { rightEdge: 0, maxHeight: 0 };
        }
        existingRows[rowKey].rightEdge = Math.max(
          existingRows[rowKey].rightEdge,
          icon.spriteX + icon.width
        );
        existingRows[rowKey].maxHeight = Math.max(
          existingRows[rowKey].maxHeight,
          icon.height
        );
      }
    });

    // --- Collect new icons and sort: group by dimensions (width×height) ---
    var newIcons = [];
    state.icons.forEach(function (icon, idx) {
      if (icon.isExisting && icon.originalSpriteX !== undefined) return;
      newIcons.push({ icon: icon, origIdx: idx });
    });

    // --- Determine maxWidth ---
    var maxWidth;
    if (state.originalSpriteWidth > 0) {
      // Update mode: respect the existing sprite's width
      maxWidth = state.originalSpriteWidth;
    } else if (s.maxSpriteWidth > 0) {
      // User explicitly set a max width
      maxWidth = s.maxSpriteWidth;
    } else if (newIcons.length > 1) {
      // Auto-calculate: create a balanced grid layout
      var totalIconWidth = 0;
      newIcons.forEach(function (entry) {
        totalIconWidth += entry.icon.width + s.spacing;
      });
      var cols = Math.ceil(Math.sqrt(newIcons.length));
      var avgWidth = totalIconWidth / newIcons.length;
      maxWidth = Math.max(Math.ceil(avgWidth * cols) + s.padding * 2, 450);
    } else {
      maxWidth = 0;
    }

    newIcons.sort(function (a, b) {
      // Primary: group by height (same-height icons row together neatly)
      if (a.icon.height !== b.icon.height) return a.icon.height - b.icon.height;
      // Secondary: group by width within same height
      if (a.icon.width !== b.icon.width) return a.icon.width - b.icon.width;
      // Tertiary: preserve original order
      return a.origIdx - b.origIdx;
    });

    // --- Find the best starting position ---
    // Try to fit on the last existing row if space allows
    var currentX, currentY, maxRowHeight;

    if (hasExisting) {
      // Find the last (bottommost) row
      var lastRowY = -1;
      Object.keys(existingRows).forEach(function (yStr) {
        var y = parseInt(yStr, 10);
        if (y > lastRowY) lastRowY = y;
      });

      var lastRow = existingRows[lastRowY];
      var spaceOnLastRow = maxWidth > 0
        ? (maxWidth - s.padding) - (lastRow.rightEdge + s.spacing)
        : Infinity;

      if (newIcons.length > 0 && spaceOnLastRow >= newIcons[0].icon.width) {
        // There's room on the last existing row — start there
        currentX = lastRow.rightEdge + s.spacing;
        currentY = lastRowY;
        maxRowHeight = lastRow.maxHeight;
      } else {
        // No room — start a new row below all existing content
        currentX = s.padding;
        currentY = maxExistingY + s.rowGap;
        maxRowHeight = 0;
      }
    } else {
      currentX = s.padding;
      currentY = s.padding;
      maxRowHeight = 0;
    }

    var maxX = maxExistingX;
    var newIconCount = 0;

    newIcons.forEach(function (entry) {
      var icon = entry.icon;

      // Wrap to next row if would exceed sprite width or row icon limit
      var wouldExceed = maxWidth > 0 && (currentX + icon.width) > (maxWidth - s.padding);
      var rowLimitReached = s.iconsPerRow > 0 && newIconCount > 0 && newIconCount % s.iconsPerRow === 0;

      if (wouldExceed || rowLimitReached) {
        currentX = s.padding;
        currentY += maxRowHeight + s.rowGap;
        maxRowHeight = 0;
      }

      icon.spriteX = currentX;
      icon.spriteY = currentY;

      currentX += icon.width + s.spacing;
      maxRowHeight = Math.max(maxRowHeight, icon.height);
      maxX = Math.max(maxX, icon.spriteX + icon.width);
      newIconCount++;
    });

    // --- Compute final dimensions ---
    var totalWidth = Math.ceil(Math.max(maxX + s.padding, 1));
    var totalHeight = Math.ceil(Math.max(currentY + maxRowHeight + s.padding, maxExistingY + s.padding, 1));

    // Preserve original sprite dimensions (only grow, never shrink)
    if (maxWidth > 0) totalWidth = Math.max(totalWidth, maxWidth);
    if (state.originalSpriteHeight > 0) totalHeight = Math.max(totalHeight, state.originalSpriteHeight);

    // Enforce minimum sprite width
    totalWidth = Math.max(totalWidth, 450);

    return { width: totalWidth, height: totalHeight };
  };

})(window.SpriteForge);
