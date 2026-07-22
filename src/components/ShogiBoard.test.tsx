import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BoardState } from '../domain/types';
import { ShogiBoard } from './ShogiBoard';

const state: BoardState = {
  squares: {},
  hands: {
    '+': { HI: 1, FU: 3 },
    '-': { KA: 2 },
  },
  turn: '+',
  ply: 42,
};

describe('ShogiBoard held pieces', () => {
  it('renders held pieces as accessible piece tiles with counts', () => {
    render(<ShogiBoard state={state} flipped={false} />);

    const topHand = screen.getByRole('group', { name: '後手の持駒' });
    const bottomHand = screen.getByRole('group', { name: '先手の持駒' });

    const topBishop = within(topHand).getByRole('listitem', { name: '後手の角 2枚' });
    const bottomRook = within(bottomHand).getByRole('listitem', { name: '先手の飛 1枚' });
    const bottomPawn = within(bottomHand).getByRole('listitem', { name: '先手の歩 3枚' });

    expect(topBishop).toHaveTextContent('角×2');
    expect(bottomRook).toHaveTextContent('飛');
    expect(bottomPawn).toHaveTextContent('歩×3');
    expect(topBishop.querySelector('.hand-count-row .hand-count')).toHaveTextContent(/^×2$/);
    expect(bottomPawn.querySelector('.hand-count-row .hand-count')).toHaveTextContent(/^×3$/);
    expect(bottomRook.querySelector('.hand-count')).toBeNull();
    expect(topBishop.querySelector('.hand-piece')).toHaveClass('upside');
    expect(topBishop.querySelector('.hand-count')).not.toHaveClass('upside');
    expect(bottomRook.querySelector('.hand-piece')).not.toHaveClass('upside');
  });

  it('swaps hand ownership when the board is flipped', () => {
    render(<ShogiBoard state={state} flipped />);

    const topHand = screen.getByRole('group', { name: '先手の持駒' });
    const bottomHand = screen.getByRole('group', { name: '後手の持駒' });

    expect(within(topHand).getByRole('listitem', { name: '先手の歩 3枚' })).toBeInTheDocument();
    expect(within(bottomHand).getByRole('listitem', { name: '後手の角 2枚' })).toBeInTheDocument();
    expect(topHand.querySelector('.hand-piece')).toHaveClass('upside');
  });
});
