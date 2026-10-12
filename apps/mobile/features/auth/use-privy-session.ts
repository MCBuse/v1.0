import {
  useEmbeddedSolanaWallet,
  usePrivy,
  type PrivyEmbeddedSolanaWalletProvider,
} from '@privy-io/expo';
import { useCallback, useEffect, useRef, useState } from 'react';

import { authSession } from '@/lib/api';
import { useAppStore } from '@/store/app-store';

import { authRepository } from './repository';

type Status = 'idle' | 'creating-wallet' | 'exchanging' | 'success' | 'error';

/**
 * Bridges Privy login state with our backend session.
 *
 * After the user logs in via Privy, this hook:
 *   1. Ensures an embedded Solana wallet exists (creates one if missing).
 *   2. Pulls the Privy access token.
 *   3. Exchanges it at `/auth/privy-login` for our app's access/refresh tokens.
 *   4. Writes those tokens to the session and flips `isAuthenticated`.
 *
 * Idempotent — safe to call repeatedly; will no-op once exchange is complete.
 */
export function usePrivySession() {
  const { user, isReady, getAccessToken } = usePrivy();
  const { wallets, create } = useEmbeddedSolanaWallet();

  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const exchangedFor = useRef<string | null>(null); // privyUserId we've already exchanged for
  const autoExchangeStartedFor = useRef<string | null>(null);
  const exchangeInFlight = useRef(false);

  const exchange = useCallback(async () => {
    if (!user || !isReady) return;
    if (exchangedFor.current === user.id) return; // already done in this session
    if (exchangeInFlight.current) return;

    exchangeInFlight.current = true;
    try {
      // 1. Make sure we have a Solana wallet.
      let pubkey = wallets?.[0]?.publicKey;
      if (!pubkey) {
        if (!create) {
          throw new Error('Privy create() is unavailable; ensure Solana is enabled in the dashboard');
        }
        setStatus('creating-wallet');
        const created = (await create()) as unknown as
          | PrivyEmbeddedSolanaWalletProvider
          | { publicKey?: string }
          | undefined;
        pubkey =
          (created && 'publicKey' in created ? created.publicKey : undefined) ??
          wallets?.[0]?.publicKey;
        if (!pubkey) {
          throw new Error('Wallet creation did not return a public key');
        }
      }

      // 2. Get the Privy access token.
      const privyAccessToken = await getAccessToken();
      if (!privyAccessToken) {
        throw new Error('Privy did not return an access token');
      }

      // 3. Exchange with backend.
      setStatus('exchanging');
      const linkedEmail = user.linked_accounts?.find((a) => a.type === 'email')?.address;
      const linkedPhone = user.linked_accounts?.find((a) => a.type === 'phone')?.phoneNumber;

      const tokens = await authRepository.privyLogin({
        privyAccessToken,
        solanaPubkey: pubkey,
        email: linkedEmail,
        phone: linkedPhone,
      });

      // 4. Activate session.
      await authSession.set(tokens);
      setIsAuthenticated(true);
      exchangedFor.current = user.id;
      setStatus('success');
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
    } finally {
      exchangeInFlight.current = false;
    }
  }, [user, isReady, wallets, create, getAccessToken, setIsAuthenticated]);

  // Auto-exchange once when Privy reports a user. Manual retry handles failures.
  useEffect(() => {
    if (!user) {
      autoExchangeStartedFor.current = null;
      return;
    }
    if (!isReady || exchangedFor.current === user.id) return;
    if (autoExchangeStartedFor.current === user.id) return;

    autoExchangeStartedFor.current = user.id;
    void exchange();
  }, [isReady, user, exchange]);

  return {
    status,
    error,
    retry: exchange,
    hasPrivyUser: Boolean(user),
    isReady,
  };
}
