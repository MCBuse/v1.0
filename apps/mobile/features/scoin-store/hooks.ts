import { useDataScreen, useOperation } from '@/lib/api/hooks';

import type {
  CreateSubmissionInput,
  IssuerProfile,
  RegistryEntry,
  Submission,
  UpdateSubmissionInput,
} from './models';
import { scoinStoreRepository } from './repository';

const KEYS = {
  registry: ['scoin-store', 'registry'] as const,
  issuerProfile: ['scoin-store', 'issuer-profile'] as const,
  submissions: ['scoin-store', 'submissions'] as const,
  submission: (id: string) => ['scoin-store', 'submission', id] as const,
};

export function useRegistry() {
  return useDataScreen<RegistryEntry[]>({
    queryKey: [...KEYS.registry],
    queryFn: () => scoinStoreRepository.getRegistry(),
  });
}

export function useIssuerProfile() {
  return useDataScreen<IssuerProfile>({
    queryKey: [...KEYS.issuerProfile],
    queryFn: () => scoinStoreRepository.getIssuerProfile(),
  });
}

export function useSubmissions() {
  return useDataScreen<Submission[]>({
    queryKey: [...KEYS.submissions],
    queryFn: () => scoinStoreRepository.getSubmissions(),
  });
}

export function useSubmission(id: string) {
  return useDataScreen<Submission>({
    queryKey: [...KEYS.submission(id)],
    queryFn: () => scoinStoreRepository.getSubmission(id),
    enabled: !!id,
  });
}

export function useCreateSubmission() {
  return useOperation<CreateSubmissionInput, Submission>({
    mutationFn: (input) => scoinStoreRepository.createSubmission(input),
    invalidateKeys: [[...KEYS.submissions], [...KEYS.issuerProfile]],
  });
}

export function useUpdateSubmission(id: string) {
  return useOperation<UpdateSubmissionInput, Submission>({
    mutationFn: (input) => scoinStoreRepository.updateSubmission(id, input),
    invalidateKeys: [
      [...KEYS.submissions],
      [...KEYS.submission(id)],
      [...KEYS.issuerProfile],
    ],
  });
}

export function useSubmitForReview(id: string) {
  return useOperation<void, Submission>({
    mutationFn: () => scoinStoreRepository.submitForReview(id),
    invalidateKeys: [
      [...KEYS.submissions],
      [...KEYS.submission(id)],
      [...KEYS.issuerProfile],
    ],
  });
}
