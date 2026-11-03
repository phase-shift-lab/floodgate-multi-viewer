import { compareGames, rateLabel, replaceFinishedSlots, selectFeaturedGames } from './selection';
import type { GameSummary } from './types';

function game(id: string, black: string, white: string, blackRate: number | undefined, whiteRate: number | undefined, live = true, group = 'g', startedAt = id): GameSummary {
  return { id, black, white, blackRate, whiteRate, live, group, startedAt, csaPath: `${id}.csa` };
}

describe('featured game selection', () => {
  it('prefers games with actual moves, including when a zero-ply group is larger',()=>{
    const waiting={...game('waiting','A','B',5000,5000),moves:0};
    const running={...game('running','C','D',3000,3000),moves:2};
    expect(selectFeaturedGames([waiting,running],1)[0].id).toBe('running');
    expect(selectFeaturedGames([waiting,{...waiting,id:'waiting2'}, {...running,group:'other'}],1)[0].id).toBe('running');
  });
  it('excludes zero-move finished records but keeps genuine first-move waiting games',()=>{
    const ended={...game('ended','A','B',4000,4000,false),moves:0};
    const waiting={...game('waiting','C','D',3000,3000),moves:0};
    expect(selectFeaturedGames([ended,waiting],4)).toEqual([waiting]);
  });
  it('replaces confirmed finished slots in place without duplicates, protecting pins and manual views',()=>{
    const games=[game('ended','A','B',4000,4000,false),game('kept','C','D',3000,3000),game('new','E','F',3500,3500)];
    const slots=[{id:'ended',pinned:false},{id:'kept',pinned:false}];
    expect(replaceFinishedSlots(slots,games,new Set())).toEqual([{id:'new',pinned:false},slots[1]]);
    expect(replaceFinishedSlots(slots,games,new Set(['ended']))).toBe(slots);
    const pinned=[{id:'ended',pinned:true},slots[1]];
    expect(replaceFinishedSlots(pinned,games,new Set())).toBe(pinned);
    expect(replaceFinishedSlots(slots,games.slice(0,2),new Set())).toBe(slots);
    expect(replaceFinishedSlots(slots,[],new Set())).toBe(slots);
  });
  it('orders by lower rating, average, then newest start', () => {
    const values = [
      game('old', 'A', 'B', 3000, 3200, true, 'g', '2026-01-01'),
      game('new', 'C', 'D', 3000, 3200, true, 'g', '2026-01-02'),
      game('higher-floor', 'E', 'F', 3050, 3060, true, 'g', '2025-01-01'),
    ];
    expect(values.sort(compareGames).map((value) => value.id)).toEqual(['higher-floor', 'new', 'old']);
  });

  it('applies a light duplicate-player penalty and fills with recent finished games', () => {
    const values = [
      game('best', 'A', 'B', 3500, 3500),
      game('duplicate', 'A', 'C', 3490, 3490),
      game('diverse', 'D', 'E', 3300, 3300),
      game('finished', 'F', 'G', 3400, 3400, false, 'g', '2026-02-01'),
    ];
    expect(selectFeaturedGames(values, 4).map((value) => value.id)).toEqual(['best', 'duplicate', 'diverse', 'finished']);
  });

  it('uses the light duplicate penalty to break near-strength choices', () => {
    const values = [
      game('best', 'A', 'B', 3500, 3500),
      game('duplicate', 'A', 'C', 3490, 3490),
      game('diverse', 'D', 'E', 3480, 3480),
    ];
    expect(selectFeaturedGames(values, 3).map((value) => value.id)).toEqual(['best', 'diverse', 'duplicate']);
  });

  it('labels unavailable ratings explicitly', () => {
    expect(rateLabel(undefined)).toBe('レート不明');
  });
});
