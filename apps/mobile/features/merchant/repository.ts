import { http } from '@/lib/api';
import {
  merchantInvoice,
  merchantInvoicePage,
  merchantProductPage,
  merchantProfile,
  type CreateMerchantInvoiceInput,
  type MerchantInvoice,
  type MerchantProduct,
  type MerchantProfile,
} from './models';

export const merchantRepository = {
  async getProfile(): Promise<MerchantProfile> {
    return merchantProfile.parse(await http.get<unknown>('/merchants/me'));
  },
  async listProducts(): Promise<MerchantProduct[]> {
    return merchantProductPage.parse(await http.get<unknown>('/merchants/me/products', { params: { status: 'active', page: 1, pageSize: 100 } })).items;
  },
  async listInvoices(status: 'open' | 'history'): Promise<MerchantInvoice[]> {
    return merchantInvoicePage.parse(await http.get<unknown>('/merchants/me/invoices', { params: { status, page: 1, pageSize: 100 } })).items;
  },
  async getInvoice(id: string): Promise<MerchantInvoice> {
    return merchantInvoice.parse(await http.get<unknown>(`/merchants/me/invoices/${id}`));
  },
  async createInvoice(input: CreateMerchantInvoiceInput): Promise<MerchantInvoice> {
    return merchantInvoice.parse(await http.post<unknown>('/merchants/me/invoices', input));
  },
  async cancelInvoice(id: string): Promise<MerchantInvoice> {
    return merchantInvoice.parse(await http.post<unknown>(`/merchants/me/invoices/${id}/cancel`));
  },
};
