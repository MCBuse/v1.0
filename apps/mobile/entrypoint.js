// Privy + Solana require these polyfills loaded BEFORE any other code.
// Keep this order; do not move imports into _layout.tsx.
import 'react-native-get-random-values';
import '@ethersproject/shims';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

import 'expo-router/entry';
