import { describe, expect, it } from 'vitest';
import { equipmentLabel, minutesLabel, restLabel, restPhrase } from './labels';

describe('minutesLabel', () => {
  it('shows minutes under an hour', () => {
    expect(minutesLabel(30)).toBe('30 min');
    expect(minutesLabel(58)).toBe('58 min');
  });

  it('shows hours and minutes above an hour', () => {
    expect(minutesLabel(70)).toBe('1h 10m');
    expect(minutesLabel(64)).toBe('1h 4m');
  });

  it('drops the minutes on a whole hour', () => {
    expect(minutesLabel(60)).toBe('1h');
    expect(minutesLabel(120)).toBe('2h');
  });
});

describe('restLabel', () => {
  it('shows seconds under a minute', () => {
    expect(restLabel(30)).toBe('30s');
    expect(restLabel(45)).toBe('45s');
  });

  it('shows mm:ss at a minute and over', () => {
    expect(restLabel(60)).toBe('1:00');
    expect(restLabel(90)).toBe('1:30');
    expect(restLabel(120)).toBe('2:00');
    expect(restLabel(125)).toBe('2:05');
  });
});

describe('restPhrase', () => {
  it('reads as a phrase', () => {
    expect(restPhrase(90)).toBe('rest 1:30');
    expect(restPhrase(30)).toBe('rest 30s');
  });

  it('says no rest rather than "rest 0s"', () => {
    expect(restPhrase(0)).toBe('no rest');
  });
});

describe('equipmentLabel', () => {
  it('spells out hyphenated equipment ids', () => {
    expect(equipmentLabel('trap-bar')).toBe('Trap bar');
    expect(equipmentLabel('med-ball')).toBe('Med ball');
    expect(equipmentLabel('barbell')).toBe('Barbell');
  });
});
