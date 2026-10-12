import { http } from '@/lib/api';

import {
  IssuerProfile,
  RegistryEntry,
  Submission,
  type CreateSubmissionInput,
  type UpdateSubmissionInput,
} from './models';

export const scoinStoreRepository = {
  async getRegistry(): Promise<RegistryEntry[]> {
    const data = await http.get('/registry/stablecoins');
    return RegistryEntry.array().parse(data);
  },

  async getIssuerProfile(): Promise<IssuerProfile> {
    const data = await http.get('/issuer/me');
    return IssuerProfile.parse(data);
  },

  async getSubmissions(): Promise<Submission[]> {
    const data = await http.get('/issuer/submissions');
    return Submission.array().parse(data);
  },

  async getSubmission(id: string): Promise<Submission> {
    const data = await http.get(`/issuer/submissions/${id}`);
    return Submission.parse(data);
  },

  async createSubmission(input: CreateSubmissionInput): Promise<Submission> {
    const data = await http.post('/issuer/submissions', input);
    return Submission.parse(data);
  },

  async updateSubmission(
    id: string,
    input: UpdateSubmissionInput,
  ): Promise<Submission> {
    const data = await http.patch(`/issuer/submissions/${id}`, input);
    return Submission.parse(data);
  },

  async submitForReview(id: string): Promise<Submission> {
    const data = await http.post(`/issuer/submissions/${id}/submit`, {});
    return Submission.parse(data);
  },
};
