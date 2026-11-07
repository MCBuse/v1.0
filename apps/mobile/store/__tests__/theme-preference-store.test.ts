// jest-expo/web rewrites `react-native` imports to these react-native-web deep paths.
jest.mock('react-native-web/dist/exports/Appearance', () => ({
  __esModule: true,
  default: { setColorScheme: jest.fn() },
}));
jest.mock('react-native-web/dist/exports/Platform', () => ({
  __esModule: true,
  default: { OS: 'ios' },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import { Appearance } from 'react-native';
import { resolveIsDark, useThemePreference } from '../theme-preference-store';

describe('resolveIsDark', () => {
  it.each([
    ['system', 'dark', true],
    ['system', 'light', false],
    ['system', 'unspecified', false],
    ['light', 'dark', false],
    ['dark', 'light', true],
    ['dark', 'unspecified', true],
  ] as const)('mode=%s system=%s -> %s', (mode, system, expected) => {
    expect(resolveIsDark(mode, system)).toBe(expected);
  });
});

describe('setMode', () => {
  it('stores the mode and overrides the native scheme', () => {
    useThemePreference.getState().setMode('dark');
    expect(useThemePreference.getState().mode).toBe('dark');
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith('dark');

    useThemePreference.getState().setMode('system');
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith('unspecified');
  });
});
