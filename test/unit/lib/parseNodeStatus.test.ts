import { parseNodeStatus } from '../../../lib/types';

describe('parseNodeStatus', () => {
  it('should parse string temperatures to numbers', () => {
    const result = parseNodeStatus({
      stemp: '21.5',
      mtemp: '22.0',
      mode: 'auto',
      active: true,
    });

    expect(result.stemp).toBe(21.5);
    expect(result.mtemp).toBe(22.0);
    expect(typeof result.stemp).toBe('number');
    expect(typeof result.mtemp).toBe('number');
    expect(result.mode).toBe('auto');
    expect(result.active).toBe(true);
  });

  it('should handle integer temperature strings', () => {
    const result = parseNodeStatus({ stemp: '20', mtemp: '22' });
    expect(result.stemp).toBe(20);
    expect(result.mtemp).toBe(22);
  });

  it('should handle partial status (only some fields present)', () => {
    const result = parseNodeStatus({ stemp: '19.8' });
    expect(result.stemp).toBe(19.8);
    expect(result.mtemp).toBeUndefined();
    expect(result.mode).toBeUndefined();
  });

  it('should pass through boolean fields', () => {
    const result = parseNodeStatus({
      locked: true,
      presence: false,
      window_open: true,
      boost: false,
    });

    expect(result.locked).toBe(true);
    expect(result.presence).toBe(false);
    expect(result.window_open).toBe(true);
    expect(result.boost).toBe(false);
  });

  it('should handle empty input', () => {
    const result = parseNodeStatus({});
    expect(result).toEqual({});
  });

  it('should handle full real API response', () => {
    const rawApiResponse = {
      stemp: '21.5',
      mtemp: '22.0',
      mode: 'auto',
      active: true,
      units: 'C',
      sync_status: 'ok',
      error_code: '',
      locked: false,
      presence: true,
      window_open: false,
      boost: false,
      true_radiant_active: false,
      eco_temp: '18.0',
      comf_temp: '22.0',
      ice_temp: '7.0',
      power: '1500',
      duty: 50,
      act_duty: 45,
      pcb_temp: '35.2',
      power_pcb_temp: '40.1',
      boost_end_min: 0,
      boost_end_day: 0,
    };

    const result = parseNodeStatus(rawApiResponse);
    expect(result.stemp).toBe(21.5);
    expect(result.mtemp).toBe(22.0);
    expect(result.mode).toBe('auto');
    expect(result.active).toBe(true);
    expect(result.locked).toBe(false);
    expect(result.presence).toBe(true);
    expect(result.window_open).toBe(false);
    expect(result.boost).toBe(false);
  });

  it('should return undefined for empty string temps (BUG-3)', () => {
    const result = parseNodeStatus({ stemp: '', mtemp: '' });
    expect(result.stemp).toBeUndefined();
    expect(result.mtemp).toBeUndefined();
  });

  it('should return undefined for non-numeric temps like "N/A" (BUG-3)', () => {
    const result = parseNodeStatus({ stemp: 'N/A', mtemp: 'error' });
    expect(result.stemp).toBeUndefined();
    expect(result.mtemp).toBeUndefined();
  });

  it('should handle mixed valid and invalid temps', () => {
    const result = parseNodeStatus({ stemp: '21.5', mtemp: 'N/A' });
    expect(result.stemp).toBe(21.5);
    expect(result.mtemp).toBeUndefined();
  });
});
