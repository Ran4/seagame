import {
  TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, WALKABLE,
  CrewState, ContextMenu, ContextMenuItem, TILE_ACTIONS, STATE_NAMES,
  Item, World, Command, Deck,
} from './types';

/** Build a context menu from a right-click. Returns ContextMenu, null (close menu), or undefined (no change). */
export function buildContextMenu(
  world: World,
  click: { x: number; y: number },
  hoveredItem: Item | null,
): ContextMenu | null | undefined {
  // Right-click in crew panel → show self-actions or close menu
  const panelX = CANVAS_WIDTH - 210;
  if (world.selectedActorId !== null && click.x >= panelX && click.x <= panelX + 200 && click.y >= 10) {
    const member = world.actors.find(c => c.id === world.selectedActorId);
    if (member) {
      const panelItems: ContextMenuItem[] = [];
      const clickedItem = hoveredItem && member.profile.inventory.includes(hoveredItem) ? hoveredItem : null;
      if (clickedItem) {
        const canDrink = member.state === CrewState.IDLE || member.state === CrewState.WALKING;
        const drinkLabel = `Drink ${clickedItem.name.toLowerCase()}`;
        panelItems.push({ label: canDrink ? drinkLabel : `${drinkLabel} (busy)`, targetState: CrewState.DRINKING, disabled: !canDrink, itemData: { barrelKey: '', itemName: clickedItem.name } });
      }
      if (panelItems.length > 0) {
        return {
          screenX: click.x + 16, screenY: click.y,
          tileX: 0, tileY: 0, deck: member.deck,
          items: panelItems, actorId: member.id,
        };
      }
    }
    return null;
  }

  // World right-click
  const worldX = click.x + world.camera.x;
  const worldY = click.y + world.camera.y;
  const anyNavigating = world.actors.some(c => c.state === CrewState.NAVIGATING);

  // Check if right-clicked a crew member
  let clickedCrew = null as typeof world.actors[0] | null;
  for (const member of world.actors) {
    if (member.deck !== world.activeDeck) continue;
    const dx = worldX - member.pixelX;
    const dy = worldY - member.pixelY;
    if (dx * dx + dy * dy < 14 * 14) {
      clickedCrew = member;
      break;
    }
  }

  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  const deck = world.decks[world.activeDeck];
  const items: ContextMenuItem[] = [];

  // Actor actions
  if (clickedCrew) {
    // Human-only actions: stop, go to deck, drink
    if (clickedCrew.actorType === 'human') {
      if (clickedCrew.state !== CrewState.IDLE) {
        items.push({ label: `Stop ${STATE_NAMES[clickedCrew.state].toLowerCase()}`, targetState: CrewState.IDLE });
      }
      for (let d = 0; d < world.decks.length; d++) {
        if (d !== clickedCrew.deck) {
          items.push({ label: `Go to ${world.decks[d].name}`, targetState: CrewState.WALKING, deckTarget: d });
        }
      }
      // Self-actions (right-click on selected crew)
      if (clickedCrew.id === world.selectedActorId) {
        // Dance
        const canDance = clickedCrew.state === CrewState.IDLE || clickedCrew.state === CrewState.WALKING;
        if (clickedCrew.state !== CrewState.DANCING) {
          items.push({ label: canDance ? 'Dance' : 'Dance (busy)', targetState: CrewState.DANCING, disabled: !canDance });
        }
        // Drink
        const seen = new Set<string>();
        for (const inv of clickedCrew.profile.inventory) {
          if (seen.has(inv.name)) continue;
          seen.add(inv.name);
          const canDrink = canDance;
          const drinkLabel = `Drink ${inv.name.toLowerCase()}`;
          items.push({ label: canDrink ? drinkLabel : `${drinkLabel} (busy)`, targetState: CrewState.DRINKING, disabled: !canDrink, itemData: { barrelKey: '', itemName: inv.name } });
        }
      }
    }
    // Interact submenu (requires a different actor selected)
    if (world.selectedActorId !== null && world.selectedActorId !== clickedCrew.id) {
      const selected = world.actors.find(c => c.id === world.selectedActorId);
      if (selected) {
        const submenu: ContextMenuItem[] = [];
        const clickedIsAnimal = clickedCrew.actorType !== 'human';
        const selectedIsHuman = selected.actorType === 'human';

        // Pet — human petting an animal
        if (selectedIsHuman && clickedIsAnimal) {
          const alreadyPetting = selected.state === CrewState.PETTING && selected.copulationTarget?.type === 'crew' && selected.copulationTarget.actorId === clickedCrew.id;
          submenu.push(alreadyPetting
            ? { label: 'Pet (already petting)', targetState: CrewState.PETTING, targetActorId: clickedCrew.id, disabled: true }
            : { label: 'Pet', targetState: CrewState.PETTING, targetActorId: clickedCrew.id });
        }

        // Human-human (or same-species) interactions
        if (!clickedIsAnimal && selectedIsHuman) {
          const selRelation = selected.relations.find(r => r.actorId === clickedCrew!.id);
          const targetRelation = clickedCrew.relations.find(r => r.actorId === selected.id);
          const selFriendship = selRelation?.friendship ?? 0;
          const selAttraction = selRelation?.attraction ?? 0;
          const targetAttraction = targetRelation?.attraction ?? 0;
          const eitherDrunk = selected.conditions.has('drunk') || clickedCrew.conditions.has('drunk');
          const bothDrunk = selected.conditions.has('drunk') && clickedCrew.conditions.has('drunk');
          const eitherTipsy = eitherDrunk || selected.conditions.has('tipsy') || clickedCrew.conditions.has('tipsy');
          let kissThreshold = eitherDrunk ? 32 : eitherTipsy ? 48 : 64;
          let copThreshold = bothDrunk ? 64 : eitherDrunk ? 80 : 128;
          if (selected.conditions.has('lustful')) {
            kissThreshold = Math.floor(kissThreshold / 2);
            copThreshold = Math.floor(copThreshold / 2);
          }
          const canKiss = selFriendship >= kissThreshold || selAttraction >= kissThreshold;
          const mutualAttraction = selAttraction >= copThreshold && targetAttraction >= copThreshold;
          const alreadyTalking = selected.state === CrewState.TALKING && selected.conversationPartnerId === clickedCrew.id;
          const alreadyKissing = selected.state === CrewState.KISSING && selected.copulationTarget?.type === 'crew' && selected.copulationTarget.actorId === clickedCrew.id;
          const alreadyCopulating = selected.state === CrewState.COPULATING && selected.copulationTarget?.type === 'crew' && selected.copulationTarget.actorId === clickedCrew.id;

          submenu.push(
            alreadyTalking
              ? { label: 'Converse (already talking)', targetState: CrewState.TALKING, targetActorId: clickedCrew.id, disabled: true }
              : { label: 'Converse', targetState: CrewState.TALKING, targetActorId: clickedCrew.id },
            alreadyKissing
              ? { label: 'Kiss (already kissing)', targetState: CrewState.KISSING, targetActorId: clickedCrew.id, disabled: true }
              : canKiss
                ? { label: 'Kiss', targetState: CrewState.KISSING, targetActorId: clickedCrew.id }
                : { label: 'Kiss (not friendly)', targetState: CrewState.KISSING, targetActorId: clickedCrew.id, disabled: true },
            alreadyCopulating
              ? { label: 'Copulate (already copulating)', targetState: CrewState.COPULATING, targetActorId: clickedCrew.id, disabled: true }
              : mutualAttraction
                ? { label: 'Copulate', targetState: CrewState.COPULATING, targetActorId: clickedCrew.id }
                : { label: 'Copulate (low attraction)', targetState: CrewState.COPULATING, targetActorId: clickedCrew.id, disabled: true },
          );
        }

        if (submenu.length > 0) {
          items.push({ label: 'Interact \u25B6', targetState: CrewState.IDLE, submenu });
        }
      }
    }
  }

  // Tile actions from the tile under the click (or under the crew member)
  let pendingBarrelItems: { items: Item[]; barrelKey: string } | undefined;
  if (tileY >= 0 && tileY < deck.height && tileX >= 0 && tileX < deck.width) {
    const tileType = deck.tiles[tileY][tileX];
    // Tile order actions only if a human crew member is selected
    const selectedActor = world.selectedActorId !== null ? world.actors.find(c => c.id === world.selectedActorId) : null;
    if (selectedActor && selectedActor.actorType === 'human' && !clickedCrew) {
      let tileActions = TILE_ACTIONS[tileType] ? [...TILE_ACTIONS[tileType]!] : undefined;
      if (tileType === TileType.MAST) {
        const hasConnection = world.decks.some((d, i) =>
          i !== world.activeDeck && tileY < d.height && tileX < d.width && d.tiles[tileY][tileX] === TileType.MAST
        );
        if (!hasConnection) {
          tileActions = undefined;
        } else if (world.activeDeck === 0) {
          tileActions = [{ label: 'Climb down', targetState: CrewState.IDLE }];
        }
      }
      // Only male crew can copulate with barrels
      if (tileActions && tileType === TileType.BARREL) {
        const selected = world.actors.find(c => c.id === world.selectedActorId);
        if (selected?.profile.sex !== 'M' || selected.conditions.has('dickless')) {
          tileActions = tileActions.filter(a => a.targetState !== CrewState.COPULATING);
        }
        // Barrel inventory shown as visual item grid on context menu
        const barrelKey = `${world.activeDeck}-${tileX}-${tileY}`;
        const barrelItemsList = world.barrelInventory.get(barrelKey);
        if (barrelItemsList && barrelItemsList.length > 0) {
          pendingBarrelItems = { items: barrelItemsList, barrelKey };
        }
      }
      // Dynamic lantern actions based on oil state
      if (tileType === TileType.LANTERN) {
        const lanternKey = `${world.activeDeck}-${tileX}-${tileY}`;
        const oil = world.lanternOil.get(lanternKey) ?? 0;
        if (oil <= 0) {
          tileActions = [{ label: 'Light', targetState: CrewState.LIGHTING_LANTERN }];
        } else {
          tileActions = [{ label: 'Extinguish', targetState: CrewState.EXTINGUISHING_LANTERN }];
        }
      }
      if (tileActions) items.push(...tileActions);
    }
    // "Open Map" on map table when someone is navigating
    if (tileType === TileType.MAP_TABLE && anyNavigating) {
      items.push({ label: 'Open Map', targetState: CrewState.NAVIGATING });
    }
  }

  if (items.length > 0 || pendingBarrelItems) {
    return {
      screenX: click.x + 16, screenY: click.y,
      tileX, tileY,
      deck: clickedCrew ? clickedCrew.deck : world.activeDeck,
      items,
      actorId: clickedCrew?.id,
      barrelItems: pendingBarrelItems,
    };
  }
  return undefined;
}

/** Process a click on the context menu. Returns item (clicked leaf), null (outside), or undefined (keep open). */
export function handleMenuClick(contextMenu: ContextMenu, click: { x: number; y: number }): ContextMenuItem | null | undefined {
  const itemW = 200;
  const itemH = 24;
  const pad = 4;

  // Barrel item grid dimensions (must match renderer)
  const bSlot = 28, bGap = 4, bCols = 5, bMargin = 10;
  let barrelGridH = 0, barrelSepH = 0;
  const bItems = contextMenu.barrelItems?.items;
  if (bItems && bItems.length > 0) {
    const bRows = Math.ceil(bItems.length / bCols);
    barrelGridH = bRows * (bSlot + bGap);
    barrelSepH = contextMenu.items.length > 0 ? 8 : 0;
  }

  const totalH = barrelGridH + barrelSepH + contextMenu.items.length * itemH + pad * 2;
  const textY0 = barrelGridH + barrelSepH; // offset for text items

  // Must match the clamping logic in renderer.drawContextMenu
  let mx = contextMenu.screenX;
  let my = contextMenu.screenY;
  if (mx + itemW > CANVAS_WIDTH) mx = mx - itemW - 4;
  if (my + totalH > CANVAS_HEIGHT) my = CANVAS_HEIGHT - totalH - 4;
  if (mx < 0) mx = 4;
  if (my < 0) my = 4;

  // Check barrel item "Take" flyout click (only when a slot is selected)
  if (bItems && bItems.length > 0) {
    const selSlot = contextMenu.selectedBarrelSlot;
    const clickPos = contextMenu.barrelSlotClickPos;
    if (selSlot !== undefined && selSlot >= 0 && selSlot < bItems.length && clickPos) {
      const flyW = 80;
      const flyH = itemH + pad * 2;
      let flyX = clickPos.x + 16;
      let flyY = clickPos.y;
      if (flyX + flyW > CANVAS_WIDTH) flyX = clickPos.x - flyW - 4;
      if (flyY + flyH > CANVAS_HEIGHT) flyY = CANVAS_HEIGHT - flyH - 2;
      if (click.x >= flyX && click.x <= flyX + flyW &&
          click.y >= flyY && click.y <= flyY + flyH) {
        const takeY = flyY + pad;
        if (click.y >= takeY && click.y <= takeY + itemH) {
          return {
            label: 'Take',
            targetState: CrewState.TAKING_ITEM,
            action: 'take_item',
            itemData: { barrelKey: contextMenu.barrelItems!.barrelKey, itemName: bItems[selSlot].name },
          };
        }
        return undefined;
      }
    }

    // Check barrel item slot clicks → select that slot (toggle)
    for (let i = 0; i < bItems.length; i++) {
      const col = i % bCols;
      const row = Math.floor(i / bCols);
      const sx = mx + bMargin + col * (bSlot + bGap);
      const sy = my + pad + row * (bSlot + bGap);
      if (click.x >= sx && click.x <= sx + bSlot &&
          click.y >= sy && click.y <= sy + bSlot) {
        if (selSlot === i) {
          contextMenu.selectedBarrelSlot = undefined;
        } else {
          contextMenu.selectedBarrelSlot = i;
          contextMenu.barrelSlotClickPos = { x: click.x, y: click.y };
        }
        return undefined;
      }
    }
  }

  // Check sub-submenu (level 3) clicks first (deepest first)
  for (let i = 0; i < contextMenu.items.length; i++) {
    const item = contextMenu.items[i];
    if (!item.submenu) continue;
    const parentY = my + pad + textY0 + i * itemH;
    const subX = mx + itemW;
    const subY = parentY;

    for (let j = 0; j < item.submenu.length; j++) {
      const subItem = item.submenu[j];
      if (!subItem.submenu) continue;
      const sjy = subY + pad + j * itemH;
      let sub2X = subX + itemW;
      const sub2Y = sjy;
      const sub2H = subItem.submenu.length * itemH + pad * 2;
      if (sub2X + itemW > CANVAS_WIDTH) sub2X = subX - itemW;

      if (click.x >= sub2X && click.x <= sub2X + itemW &&
          click.y >= sub2Y && click.y <= sub2Y + sub2H) {
        for (let k = 0; k < subItem.submenu.length; k++) {
          const sky = sub2Y + pad + k * itemH;
          if (click.y >= sky && click.y <= sky + itemH) {
            if (subItem.submenu[k].disabled) return undefined;
            return subItem.submenu[k];
          }
        }
        return undefined;
      }
    }
  }

  // Check submenu (level 2) clicks
  for (let i = 0; i < contextMenu.items.length; i++) {
    const item = contextMenu.items[i];
    if (!item.submenu) continue;
    const parentY = my + pad + textY0 + i * itemH;
    const subX = mx + itemW;
    const subY = parentY;
    const subH = item.submenu.length * itemH + pad * 2;

    if (click.x >= subX && click.x <= subX + itemW &&
        click.y >= subY && click.y <= subY + subH) {
      for (let j = 0; j < item.submenu.length; j++) {
        const sjy = subY + pad + j * itemH;
        if (click.y >= sjy && click.y <= sjy + itemH) {
          if (item.submenu[j].disabled) return undefined;
          if (item.submenu[j].submenu) return undefined;
          return item.submenu[j];
        }
      }
      return undefined;
    }
  }

  for (let i = 0; i < contextMenu.items.length; i++) {
    const iy = my + pad + textY0 + i * itemH;
    if (click.x >= mx && click.x <= mx + itemW &&
        click.y >= iy && click.y <= iy + itemH) {
      if (contextMenu.items[i].disabled) return undefined;
      if (contextMenu.items[i].submenu) return undefined;
      return contextMenu.items[i];
    }
  }
  return null;
}

/** Convert a menu item + context menu state into a Command. */
export function menuItemToCommand(contextMenu: ContextMenu, decks: Deck[], menuItem: ContextMenuItem): Command | null {
  // Take item from barrel
  if (menuItem.action === 'take_item' && menuItem.itemData) {
    return { name: 'TakeItem', barrelKey: menuItem.itemData.barrelKey, itemName: menuItem.itemData.itemName };
  }

  // Crew-crew interactions (Kiss, Copulate, Converse, Pet)
  if (menuItem.targetActorId !== undefined) {
    const actorId = menuItem.targetActorId;
    switch (menuItem.targetState) {
      case CrewState.KISSING: return { name: 'Kiss', actorId };
      case CrewState.COPULATING: return { name: 'Copulate', actorId };
      case CrewState.TALKING: return { name: 'Converse', actorId };
      case CrewState.PETTING: return { name: 'Pet', actorId };
      default: return null;
    }
  }

  // Actor self-actions (Stop, Drink, GoToDeck)
  if (contextMenu.actorId !== undefined) {
    if (menuItem.deckTarget !== undefined) {
      return { name: 'GoToDeck', deck: menuItem.deckTarget };
    }
    if (menuItem.targetState === CrewState.DRINKING) {
      return { name: 'Drink', itemName: menuItem.itemData?.itemName ?? 'Grog ration' };
    }
    if (menuItem.targetState === CrewState.DANCING) {
      return { name: 'Dance' };
    }
    // Stop action
    return { name: 'Stop' };
  }

  // Tile-targeted actions
  let targetDeck = contextMenu.deck;
  const clickedTile = decks[contextMenu.deck].tiles[contextMenu.tileY]?.[contextMenu.tileX];
  // Mast/stairs: resolve connected deck
  if (clickedTile === TileType.MAST || clickedTile === TileType.STAIRS) {
    for (let d = 0; d < decks.length; d++) {
      if (d === contextMenu.deck) continue;
      const other = decks[d];
      if (contextMenu.tileY < other.height && contextMenu.tileX < other.width &&
          (clickedTile === TileType.STAIRS
            ? WALKABLE.has(other.tiles[contextMenu.tileY][contextMenu.tileX])
            : other.tiles[contextMenu.tileY][contextMenu.tileX] === TileType.MAST)) {
        targetDeck = d;
        break;
      }
    }
  }

  const tileX = contextMenu.tileX;
  const tileY = contextMenu.tileY;

  switch (menuItem.targetState) {
    case CrewState.COPULATING: return { name: 'CopulateBarrel', deck: contextMenu.deck, x: tileX, y: tileY };
    case CrewState.SLEEPING: return { name: 'Sleep', deck: targetDeck, x: tileX, y: tileY };
    case CrewState.EATING: return { name: 'Eat', deck: targetDeck, x: tileX, y: tileY };
    case CrewState.STEERING: return { name: 'Steer', deck: targetDeck, x: tileX, y: tileY };
    case CrewState.MANNING_CANNON: return { name: 'ManCannon', deck: targetDeck, x: tileX, y: tileY };
    case CrewState.NAVIGATING: return { name: 'Navigate', deck: targetDeck, x: tileX, y: tileY };
    case CrewState.LOOKOUT: return { name: 'Lookout', deck: targetDeck, x: tileX, y: tileY };
    case CrewState.LIGHTING_LANTERN: return { name: 'LightLantern', deck: targetDeck, x: tileX, y: tileY };
    case CrewState.EXTINGUISHING_LANTERN: return { name: 'ExtinguishLantern', deck: targetDeck, x: tileX, y: tileY };
  }

  // Stairs/mast "go to" — GoTo on the connected deck
  if (menuItem.targetState === CrewState.IDLE && (clickedTile === TileType.STAIRS || clickedTile === TileType.MAST)) {
    return { name: 'GoTo', x: contextMenu.tileX, y: contextMenu.tileY, deck: targetDeck };
  }

  return null;
}
