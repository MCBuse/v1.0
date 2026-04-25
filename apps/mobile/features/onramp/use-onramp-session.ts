import { useMutation } from '@tanstack/react-query';
import { onrampSessionRepository } from './session-repository';
import type { CreateOnrampSessionInput, CreateOnrampSessionResponse } from './session-models';

export function useOnrampSession() {
  return useMutation<CreateOnrampSessionResponse, Error, CreateOnrampSessionInput>({
    mutationFn: (input) => onrampSessionRepository.createSession(input),
  });
}
