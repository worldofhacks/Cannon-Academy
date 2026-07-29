/**
 * A-007 — the sea chart's state, as a pure selector.
 *
 * The chart is the hub every other screen routes through, and its whole job is deciding which
 * islands a captain may enter. That decision is a function of captain state plus the island
 * catalog, so it lives here and not in JSX — a fog rule buried in a component is a fog rule
 * nobody can test.
 */
import { describe, expect, it } from 'vitest';

import { emptyCaptain, type Captain } from '../../src/stores/player';
import { chartNodes, requirementText } from '../../src/services/chart';

const captain = (over: Partial<Captain> = {}): Captain => ({ ...emptyCaptain(), ...over });

describe('A-007 sea chart', () => {
  it('spec(A-007:AC-1) exactly the unlocked islands are enterable; the rest are fogged', () => {
    const nodes = chartNodes(captain({ unlockedIslands: ['port_sumwich'] }));
    const open = nodes.filter((n) => !n.fogged).map((n) => n.island.id);
    expect(open).toEqual(['port_sumwich']);
    expect(nodes.filter((n) => n.fogged)).toHaveLength(4);
  });

  it('spec(A-007:AC-2) an island whose predecessor is uncleared stays fogged regardless of band', () => {
    // A 4-5 captain has a high band but has cleared nothing — grade must not open the map.
    const nodes = chartNodes(captain({ gradeBand: 'g4_5', unlockedIslands: ['port_sumwich'] }));
    const reef = nodes.find((n) => n.island.id === 'fraction_reef');
    expect(reef?.fogged).toBe(true);
  });

  it('spec(A-007:AC-3) a fogged island states its requirement in words a child can read', () => {
    const nodes = chartNodes(captain({ unlockedIslands: ['port_sumwich'] }));
    const products = nodes.find((n) => n.island.id === 'isla_products');
    expect(products?.fogged).toBe(true);
    const text = requirementText(products!);
    expect(text).toBeTruthy();
    // Names the place they must clear, not an id and not a skill code.
    expect(text).toContain('Port Sumwich');
    expect(text).not.toMatch(/[a-z]+_[a-z]/);
  });

  it('spec(A-007:AC-3) an unlocked island has no requirement text to show', () => {
    const nodes = chartNodes(captain({ unlockedIslands: ['port_sumwich'] }));
    const sumwich = nodes.find((n) => n.island.id === 'port_sumwich');
    expect(requirementText(sumwich!)).toBeNull();
  });

  it('spec(A-007:AC-4) the captain node is marked at the current island', () => {
    const nodes = chartNodes(captain({ unlockedIslands: ['port_sumwich'], currentIsland: 'port_sumwich' }));
    expect(nodes.filter((n) => n.isCurrent)).toHaveLength(1);
    expect(nodes.find((n) => n.isCurrent)?.island.id).toBe('port_sumwich');
  });

  it('spec(A-007:AC-4) no island is marked current when the captain has none', () => {
    expect(chartNodes(captain()).filter((n) => n.isCurrent)).toHaveLength(0);
  });

  it('spec(A-007:AC-1) nodes come back in catalog order, so the map never reshuffles', () => {
    const ids = chartNodes(captain({ unlockedIslands: ['port_sumwich'] })).map((n) => n.island.id);
    expect(ids).toEqual(['port_sumwich', 'isla_products', 'quotient_cove', 'fraction_reef', 'grandline']);
  });

  it('spec(A-007:AC-5) a fresh captain sees every island fogged rather than an empty map', () => {
    const nodes = chartNodes(captain());
    expect(nodes).toHaveLength(5);
    expect(nodes.every((n) => n.fogged)).toBe(true);
  });
});
