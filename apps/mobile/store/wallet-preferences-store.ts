import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AddedStablecoin {
  ticker: string;
  name: string;
  network: string;
  symbol: string;
  addedAt: number;
}

interface WalletPreferencesState {
  addedStablecoins: AddedStablecoin[];
  addStablecoin: (coin: Omit<AddedStablecoin, 'addedAt'>) => void;
  removeStablecoin: (ticker: string) => void;
  isAdded: (ticker: string) => boolean;
}

export const useWalletPreferences = create<WalletPreferencesState>()(
  persist(
    (set, get) => ({
      addedStablecoins: [],

      addStablecoin: (coin) => {
        const exists = get().addedStablecoins.find((c) => c.ticker === coin.ticker);
        if (exists) return;

        set((state) => ({
          addedStablecoins: [
            ...state.addedStablecoins,
            { ...coin, addedAt: Date.now() },
          ],
        }));
      },

      removeStablecoin: (ticker) => {
        set((state) => ({
          addedStablecoins: state.addedStablecoins.filter(
            (c) => c.ticker !== ticker,
          ),
        }));
      },

      isAdded: (ticker) => {
        return get().addedStablecoins.some((c) => c.ticker === ticker);
      },
    }),
    {
      name: 'wallet-preferences',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
