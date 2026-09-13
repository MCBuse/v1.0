import { useDataScreen, useOperation } from '@/lib/api';
import type { CreateMerchantInvoiceInput, MerchantInvoice, MerchantProduct, MerchantProfile } from './models';
import { merchantRepository } from './repository';

export function useMerchantProfile() {
  return useDataScreen<MerchantProfile>({ queryKey: ['merchant-profile'], queryFn: () => merchantRepository.getProfile(), retry: false });
}

export function useMerchantProducts(enabled = true) {
  return useDataScreen<MerchantProduct[]>({ queryKey: ['merchant-products'], queryFn: () => merchantRepository.listProducts(), enabled });
}

export function useMerchantInvoices(status: 'open' | 'history', enabled = true) {
  return useDataScreen<MerchantInvoice[]>({ queryKey: ['merchant-invoices', status], queryFn: () => merchantRepository.listInvoices(status), enabled, refetchInterval: status === 'open' ? 5_000 : false });
}

export function useMerchantInvoice(id: string | undefined) {
  return useDataScreen<MerchantInvoice>({
    queryKey: ['merchant-invoice', id], queryFn: () => merchantRepository.getInvoice(id!), enabled: Boolean(id),
    refetchInterval: (query) => ['pending', 'processing'].includes(query.state.data?.status ?? '') ? 2_500 : false,
  });
}

export function useCreateMerchantInvoice() {
  return useOperation<CreateMerchantInvoiceInput, MerchantInvoice>({ mutationFn: (input) => merchantRepository.createInvoice(input), invalidateKeys: [['merchant-invoices'], ['merchant-products']] });
}

export function useCancelMerchantInvoice() {
  return useOperation<string, MerchantInvoice>({ mutationFn: (id) => merchantRepository.cancelInvoice(id), invalidateKeys: [['merchant-invoices'], ['merchant-invoice'], ['merchant-products']] });
}
