// Adapted from Obytes: demo navigation/bottom-sheet providers removed.
import type { ReactElement } from 'react';
import { render, userEvent } from '@testing-library/react-native';

export function setup(ui: ReactElement) {
  return { user: userEvent.setup(), ...render(ui) };
}

export * from '@testing-library/react-native';
