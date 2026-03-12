import { CANVAS_WIDTH, CANVAS_HEIGHT, ContextMenu } from '../types';
import { RenderContext } from './context';
import { drawItemSlot } from './ui';

export function drawContextMenu(rc: RenderContext, menu: ContextMenu, mousePos: { x: number; y: number }): void {
  const ctx = rc.ctx;
  const itemW = 200;
  const itemH = 24;
  const pad = 4;

  // Barrel item grid dimensions
  const bSlot = 28, bGap = 4, bCols = 5, bMargin = 10;
  let barrelGridH = 0, barrelSepH = 0;
  const bItems = menu.barrelItems?.items;
  if (bItems && bItems.length > 0) {
    const bRows = Math.ceil(bItems.length / bCols);
    barrelGridH = bRows * (bSlot + bGap);
    barrelSepH = menu.items.length > 0 ? 8 : 0;
  }

  const totalH = barrelGridH + barrelSepH + menu.items.length * itemH + pad * 2;
  const textY0 = barrelGridH + barrelSepH; // offset for text items

  // Position next to the tile, clamped to canvas
  let mx = menu.screenX;
  let my = menu.screenY;
  if (mx + itemW > CANVAS_WIDTH) mx = mx - itemW - 4;
  if (my + totalH > CANVAS_HEIGHT) my = CANVAS_HEIGHT - totalH - 4;
  if (mx < 0) mx = 4;
  if (my < 0) my = 4;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(mx, my, itemW, totalH);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, itemW - 1, totalH - 1);

  // Barrel item slots
  if (bItems && bItems.length > 0) {
    for (let i = 0; i < bItems.length; i++) {
      const col = i % bCols;
      const row = Math.floor(i / bCols);
      const sx = mx + bMargin + col * (bSlot + bGap);
      const sy = my + pad + row * (bSlot + bGap);
      drawItemSlot(rc, sx, sy, bSlot, bItems[i]);

      // Highlight selected slot
      if (menu.selectedBarrelSlot === i) {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 0.5, sy + 0.5, bSlot - 1, bSlot - 1);
      }
    }

    // Separator before text items
    if (menu.items.length > 0) {
      const sepY = my + pad + barrelGridH + barrelSepH / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(mx + 4, sepY);
      ctx.lineTo(mx + itemW - 4, sepY);
      ctx.stroke();
    }

    // "Take" popup for selected barrel item (positioned at click, like crew inventory)
    const selSlot = menu.selectedBarrelSlot;
    const clickPos = menu.barrelSlotClickPos;
    if (selSlot !== undefined && selSlot >= 0 && selSlot < bItems.length && clickPos) {
      const flyW = 80;
      const flyH = itemH + pad * 2;
      let flyX = clickPos.x + 16;
      let flyY = clickPos.y;
      if (flyX + flyW > CANVAS_WIDTH) flyX = clickPos.x - flyW - 4;
      if (flyY + flyH > CANVAS_HEIGHT) flyY = CANVAS_HEIGHT - flyH - 2;

      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(flyX, flyY, flyW, flyH);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(flyX + 0.5, flyY + 0.5, flyW - 1, flyH - 1);

      const takeY = flyY + pad;
      if (mousePos.x >= flyX && mousePos.x <= flyX + flyW &&
          mousePos.y >= takeY && mousePos.y <= takeY + itemH) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(flyX + 1, takeY, flyW - 2, itemH);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Take', flyX + 10, takeY + 16);
    }
  }

  // Text items (offset below barrel grid)
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < menu.items.length; i++) {
    const iy = my + pad + textY0 + i * itemH;

    const item = menu.items[i];

    // Hover highlight (skip for disabled items)
    if (!item.disabled && mousePos.x >= mx && mousePos.x <= mx + itemW &&
        mousePos.y >= iy && mousePos.y <= iy + itemH) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(mx + 1, iy, itemW - 2, itemH);
    }

    ctx.fillStyle = item.disabled ? '#666666' : '#ffffff';
    ctx.fillText(item.label, mx + 10, iy + 16);

    // Separator
    if (i < menu.items.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.moveTo(mx + 4, iy + itemH);
      ctx.lineTo(mx + itemW - 4, iy + itemH);
      ctx.stroke();
    }
  }

  // Draw submenu for hovered parent
  for (let i = 0; i < menu.items.length; i++) {
    const item = menu.items[i];
    if (!item.submenu) continue;

    const parentY = my + pad + textY0 + i * itemH;
    const subX = mx + itemW;
    const subY = parentY;
    const subH = item.submenu.length * itemH + pad * 2;

    const overParent = mousePos.x >= mx && mousePos.x <= mx + itemW &&
                       mousePos.y >= parentY && mousePos.y <= parentY + itemH;
    const overSub = mousePos.x >= subX && mousePos.x <= subX + itemW &&
                    mousePos.y >= subY && mousePos.y <= subY + subH;
    if (!overParent && !overSub) continue;

    // Submenu background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(subX, subY, itemW, subH);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(subX + 0.5, subY + 0.5, itemW - 1, subH - 1);

    for (let j = 0; j < item.submenu.length; j++) {
      const sjy = subY + pad + j * itemH;
      const subItem = item.submenu[j];

      const overSubItem = mousePos.x >= subX && mousePos.x <= subX + itemW &&
          mousePos.y >= sjy && mousePos.y <= sjy + itemH;

      // Check if mouse is over this item's sub-submenu panel
      let overSub2 = false;
      if (subItem.submenu) {
        let s2x = subX + itemW;
        if (s2x + itemW > CANVAS_WIDTH) s2x = subX - itemW;
        const s2y = sjy;
        const s2h = subItem.submenu.length * itemH + pad * 2;
        overSub2 = mousePos.x >= s2x && mousePos.x <= s2x + itemW &&
                   mousePos.y >= s2y && mousePos.y <= s2y + s2h;
      }

      if (!subItem.disabled && overSubItem) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(subX + 1, sjy, itemW - 2, itemH);
      }

      ctx.fillStyle = subItem.disabled ? '#666666' : '#ffffff';
      ctx.fillText(subItem.label, subX + 10, sjy + 16);

      if (j < item.submenu.length - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(subX + 4, sjy + itemH);
        ctx.lineTo(subX + itemW - 4, sjy + itemH);
        ctx.stroke();
      }

      // Draw level-3 sub-submenu
      if (subItem.submenu && (overSubItem || overSub2)) {
        let sub2X = subX + itemW;
        if (sub2X + itemW > CANVAS_WIDTH) sub2X = subX - itemW;
        const sub2Y = sjy;
        const sub2H = subItem.submenu.length * itemH + pad * 2;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(sub2X, sub2Y, itemW, sub2H);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(sub2X + 0.5, sub2Y + 0.5, itemW - 1, sub2H - 1);

        for (let k = 0; k < subItem.submenu.length; k++) {
          const sky = sub2Y + pad + k * itemH;
          const sub2Item = subItem.submenu[k];

          if (!sub2Item.disabled && mousePos.x >= sub2X && mousePos.x <= sub2X + itemW &&
              mousePos.y >= sky && mousePos.y <= sky + itemH) {
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(sub2X + 1, sky, itemW - 2, itemH);
          }

          ctx.fillStyle = sub2Item.disabled ? '#666666' : '#ffffff';
          ctx.fillText(sub2Item.label, sub2X + 10, sky + 16);

          if (k < subItem.submenu.length - 1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.beginPath();
            ctx.moveTo(sub2X + 4, sky + itemH);
            ctx.lineTo(sub2X + itemW - 4, sky + itemH);
            ctx.stroke();
          }
        }
      }
    }
  }
}
