import {
  TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, WALKABLE,
  CrewState, ContextMenu, ContextMenuItem, TILE_ACTIONS, STATE_NAMES,
  Item, World, Command, Deck, computeMenuWidth,
} from './types';
import { getObjectHp, getObjectMaxHp, CANNON_RANGE, BOARD_RANGE } from './combat';
import { tentacleAt } from './monster';
import { availableGoods, buyPrice, sellableInventory } from './trade';
import { activeContracts } from './contracts';
import { hasTreasureMap } from './treasure';

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
    // NPCs can't be commanded — skip standard crew actions
    const clickedIsNPCDirect = clickedCrew.statuses.has('npc');
    // Human-only actions: stop, go to deck, drink
    if (clickedCrew.actorType === 'human' && !clickedIsNPCDirect) {
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
        const clickedIsNPC = clickedCrew.statuses.has('npc');
        const selectedIsNPC = selected.statuses.has('npc');

        // NPC interactions — simplified: Talk and Buy (for bartender), Pet for animal NPCs
        if (clickedIsNPC && selectedIsHuman && !selectedIsNPC) {
          const npcData = clickedCrew.statuses.get('npc') as { role: string } | null;
          // Animal NPC (cat): Pet
          if (clickedIsAnimal) {
            const alreadyPetting = selected.state === CrewState.PETTING && selected.copulationTarget?.type === 'crew' && selected.copulationTarget.actorId === clickedCrew.id;
            submenu.push(alreadyPetting
              ? { label: `Pet ${clickedCrew.profile.name} (petting)`, targetState: CrewState.PETTING, targetActorId: clickedCrew.id, disabled: true }
              : { label: `Pet ${clickedCrew.profile.name}`, targetState: CrewState.PETTING, targetActorId: clickedCrew.id });
          } else {
            // Human NPC: Talk
            const alreadyTalking = selected.state === CrewState.TALKING && selected.conversationPartnerId === clickedCrew.id;
            submenu.push(alreadyTalking
              ? { label: `Talk to ${clickedCrew.profile.name} (talking)`, targetState: CrewState.TALKING, targetActorId: clickedCrew.id, disabled: true }
              : { label: `Talk to ${clickedCrew.profile.name}`, targetState: CrewState.TALKING, targetActorId: clickedCrew.id });
            // Bartender: buy grog (now costs gold — see game.ts handler)
            if (npcData?.role === 'bartender') {
              submenu.push({ label: 'Buy grog', targetState: CrewState.IDLE, action: 'buy_grog', targetActorId: clickedCrew.id });
            }
            // Merchant: real Buy ▶ / Sell ▶ trading (FEATURE 7)
            if (npcData?.role === 'merchant') {
              // Buy submenu — one entry per available good with its price.
              const buySub: ContextMenuItem[] = availableGoods(world).map(g => ({
                label: `${g.name} — ${buyPrice(world, g)}g`,
                targetState: CrewState.IDLE,
                action: 'buy_good',
                itemData: { barrelKey: '', itemName: g.name },
                disabled: world.gold < buyPrice(world, g),
              }));
              submenu.push({ label: 'Buy ▶', targetState: CrewState.IDLE, submenu: buySub });

              // Sell submenu — one entry per sellable holding.
              const sellable = sellableInventory(world);
              const sellSub: ContextMenuItem[] = sellable.length > 0
                ? sellable.map(s => ({
                    label: `${s.name} (x${s.quantity}) — ${s.unitPrice}g`,
                    targetState: CrewState.IDLE,
                    action: 'sell_item',
                    itemData: { barrelKey: '', itemName: s.name },
                  }))
                : [{ label: 'Nothing to sell', targetState: CrewState.IDLE, disabled: true }];
              submenu.push({ label: 'Sell ▶', targetState: CrewState.IDLE, submenu: sellSub });
            }
            // Innkeeper: recruit sailor + take contracts (FEATURE 7)
            if (npcData?.role === 'innkeeper') {
              const alreadyRecruited = world.actors.some(a => a.statuses.has('recruited_this_visit'));
              submenu.push(alreadyRecruited
                ? { label: 'Recruit sailor (already recruited)', targetState: CrewState.IDLE, action: 'recruit_sailor', disabled: true }
                : { label: 'Recruit sailor', targetState: CrewState.IDLE, action: 'recruit_sailor', targetActorId: clickedCrew.id });

              // Take contract submenu — one entry per available offer.
              const contractSub: ContextMenuItem[] = world.contractOffers.length > 0
                ? world.contractOffers.map(c => ({
                    label: `${c.description} — ${c.reward}g`,
                    targetState: CrewState.IDLE,
                    action: 'take_contract',
                    itemData: { barrelKey: String(c.id), itemName: '' },
                  }))
                : [{ label: 'No contracts available', targetState: CrewState.IDLE, disabled: true }];
              submenu.push({ label: 'Take contract ▶', targetState: CrewState.IDLE, submenu: contractSub });
            }
            // Townsfolk also gossip about active contracts (lets player review them).
            if (npcData?.role === 'townsfolk') {
              const active = activeContracts(world);
              if (active.length > 0) {
                submenu.push({ label: 'Review contracts', targetState: CrewState.IDLE, action: 'review_contracts', targetActorId: clickedCrew.id });
              }
            }
          }
        }

        // Pet — human petting an animal (non-NPC)
        if (!clickedIsNPC && selectedIsHuman && !selectedIsNPC && clickedIsAnimal) {
          const alreadyPetting = selected.state === CrewState.PETTING && selected.copulationTarget?.type === 'crew' && selected.copulationTarget.actorId === clickedCrew.id;
          submenu.push(alreadyPetting
            ? { label: 'Pet (already petting)', targetState: CrewState.PETTING, targetActorId: clickedCrew.id, disabled: true }
            : { label: 'Pet', targetState: CrewState.PETTING, targetActorId: clickedCrew.id });
        }

        // Human-human (or same-species) interactions (not NPCs)
        if (!clickedIsNPC && !selectedIsNPC && !clickedIsAnimal && selectedIsHuman) {
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

  // Corpse right-click: "Bury X at sea" (requires human selected)
  if (world.selectedActorId !== null && !clickedCrew) {
    const selected = world.actors.find(c => c.id === world.selectedActorId);
    if (selected && selected.actorType === 'human') {
      for (const corpse of world.corpses) {
        if (corpse.deck !== world.activeDeck) continue;
        const cdx = worldX - corpse.pixelX;
        const cdy = worldY - corpse.pixelY;
        if (cdx * cdx + cdy * cdy < 14 * 14) {
          items.push({
            label: `Bury ${corpse.name} at sea`,
            targetState: CrewState.IDLE,
            action: 'bury_at_sea',
            corpseActorId: corpse.actorId,
          });
          break;
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
      // Manual cannon volley — when manning/right-clicking a cannon with an enemy in range.
      if (tileType === TileType.CANNON && world.enemyShip && world.enemyShip.distance <= CANNON_RANGE) {
        items.push({ label: 'Fire Cannon', targetState: CrewState.IDLE, action: 'fire_cannon' });
      }
      // Board the enemy — when an enemy ship has closed to boarding range.
      if (world.enemyShip && world.enemyShip.distance <= BOARD_RANGE) {
        items.push({ label: `Board the ${world.enemyShip.name}`, targetState: CrewState.IDLE, action: 'board_enemy' });
      }
      // Fight the tentacle — when a kraken tentacle is on, or adjacent to, the clicked tile.
      {
        let tentacleTile: { x: number; y: number } | null = null;
        const DIRS = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of DIRS) {
          if (tentacleAt(world, world.activeDeck, tileX + dx, tileY + dy)) {
            tentacleTile = { x: tileX + dx, y: tileY + dy };
            break;
          }
        }
        if (tentacleTile) {
          items.push({
            label: 'Fight the tentacle',
            targetState: CrewState.FIGHTING,
            action: 'fight_tentacle',
            itemData: { barrelKey: `${world.activeDeck}-${tentacleTile.x}-${tentacleTile.y}`, itemName: '' },
          });
        }
      }
      // Repair — BREACH tiles, or damaged HULL / objects (current HP < max).
      const isBreach = tileType === TileType.BREACH;
      const isDamaged = getObjectMaxHp(tileType) > 0 &&
        getObjectHp(world, world.activeDeck, tileX, tileY) < getObjectMaxHp(tileType);
      if (isBreach || isDamaged) {
        const hasWood = selectedActor.profile.inventory.some(i => i.name === 'Wood') ||
          Array.from(world.barrelInventory.values()).some(items2 => items2.some(i => i.name === 'Wood'));
        items.push(hasWood
          ? { label: isBreach ? 'Repair breach' : 'Repair', targetState: CrewState.REPAIRING }
          : { label: 'Repair (no wood)', targetState: CrewState.REPAIRING, disabled: true });
      }
      if (tileActions) items.push(...tileActions);
    }
    // "Open Map" on map table when someone is navigating
    if (tileType === TileType.MAP_TABLE && anyNavigating) {
      items.push({ label: 'Open Map', targetState: CrewState.NAVIGATING });
    }
    // FEATURE 8 — "Use Map" on the map table when a human is selected and the ship holds
    // a treasure map. Reading it reveals the target island + drops a marker.
    if (tileType === TileType.MAP_TABLE) {
      const selectedActor = world.selectedActorId !== null ? world.actors.find(c => c.id === world.selectedActorId) : null;
      if (selectedActor && selectedActor.actorType === 'human' && !selectedActor.statuses.has('npc') && !clickedCrew) {
        if (hasTreasureMap(world)) {
          items.push({ label: 'Use treasure map', targetState: CrewState.IDLE, action: 'use_map' });
        }
      }
    }
    // "Leave harbor" on gangplank when docked
    if (tileType === TileType.GANGPLANK && world.docking.phase === 'docked') {
      const hasSteerer = world.actors.some(c => c.state === CrewState.STEERING);
      if (hasSteerer) {
        items.push({ label: 'Leave harbor', targetState: CrewState.IDLE, action: 'leave_harbor' });
      } else {
        items.push({ label: 'Leave harbor (missing helmsman)', targetState: CrewState.IDLE, action: 'leave_harbor', disabled: true });
      }
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
  const itemH = 24;
  const pad = 4;

  // Barrel item grid dimensions (must match renderer)
  const bSlot = 28, bGap = 4, bCols = 5, bMargin = 10;
  const barrelMinW = contextMenu.barrelItems?.items?.length ? bMargin * 2 + bCols * (bSlot + bGap) - bGap : 0;
  const itemW = computeMenuWidth(contextMenu.items.map(i => i.label), barrelMinW);
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
    const subW = computeMenuWidth(item.submenu.map(s => s.label));
    const parentY = my + pad + textY0 + i * itemH;
    const subX = mx + itemW;
    const subY = parentY;

    for (let j = 0; j < item.submenu.length; j++) {
      const subItem = item.submenu[j];
      if (!subItem.submenu) continue;
      const sub2W = computeMenuWidth(subItem.submenu.map(s => s.label));
      const sjy = subY + pad + j * itemH;
      let sub2X = subX + subW;
      const sub2Y = sjy;
      const sub2H = subItem.submenu.length * itemH + pad * 2;
      if (sub2X + sub2W > CANVAS_WIDTH) sub2X = subX - sub2W;

      if (click.x >= sub2X && click.x <= sub2X + sub2W &&
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
    const subW = computeMenuWidth(item.submenu.map(s => s.label));
    const parentY = my + pad + textY0 + i * itemH;
    const subX = mx + itemW;
    const subY = parentY;
    const subH = item.submenu.length * itemH + pad * 2;

    if (click.x >= subX && click.x <= subX + subW &&
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
  // Bury corpse at sea
  if (menuItem.action === 'bury_at_sea' && menuItem.corpseActorId !== undefined) {
    return { name: 'BuryAtSea', corpseActorId: menuItem.corpseActorId };
  }

  // Take item from barrel
  if (menuItem.action === 'take_item' && menuItem.itemData) {
    return { name: 'TakeItem', barrelKey: menuItem.itemData.barrelKey, itemName: menuItem.itemData.itemName };
  }

  // FEATURE 8 — treasure map / shore expedition actions
  if (menuItem.action === 'use_map') {
    return { name: 'UseMap' };
  }
  if (menuItem.action === 'send_expedition') {
    return { name: 'SendExpedition' };
  }

  // Combat actions
  if (menuItem.action === 'fire_cannon') {
    return { name: 'FireCannon' };
  }
  if (menuItem.action === 'board_enemy') {
    return { name: 'BoardEnemy' };
  }
  // Fight a kraken tentacle — coords carried in itemData.barrelKey ("deck-x-y").
  if (menuItem.action === 'fight_tentacle' && menuItem.itemData) {
    const [d, tx, ty] = menuItem.itemData.barrelKey.split('-').map(Number);
    return { name: 'Fight', deck: d, x: tx, y: ty };
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
    case CrewState.FISHING: return { name: 'Fish', deck: targetDeck, x: tileX, y: tileY };
    case CrewState.REPAIRING: return { name: 'Repair', deck: contextMenu.deck, x: tileX, y: tileY };
  }

  // Stairs/mast "go to" — GoTo on the connected deck
  if (menuItem.targetState === CrewState.IDLE && (clickedTile === TileType.STAIRS || clickedTile === TileType.MAST)) {
    return { name: 'GoTo', x: contextMenu.tileX, y: contextMenu.tileY, deck: targetDeck };
  }

  return null;
}
