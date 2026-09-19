import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  StreamableFile,
  ServiceUnavailableException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateMerchantPaymentRequestDto } from './dto/create-merchant-payment-request.dto';
import { ListMerchantTransactionsDto } from './dto/list-merchant-transactions.dto';
import { ListMerchantPaymentRequestsDto } from './dto/list-merchant-payment-requests.dto';
import { UpdateMerchantConsentDto } from './dto/update-merchant-consent.dto';
import { MerchantService } from './merchant.service';
import { MerchantInventoryService } from './merchant-inventory.service';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { UpdateMerchantProductDto } from './dto/update-merchant-product.dto';
import { AdjustMerchantProductStockDto } from './dto/adjust-merchant-product-stock.dto';
import { CreateMerchantInvoiceDto } from './dto/create-merchant-invoice.dto';
import { ListMerchantProductsDto } from './dto/list-merchant-products.dto';
import { ListMerchantInvoicesDto } from './dto/list-merchant-invoices.dto';
import { CreateMerchantCashSaleDto, VoidMerchantCashSaleDto } from './dto/create-merchant-cash-sale.dto';
import { ListMerchantAnalyticsDto } from './dto/list-merchant-analytics.dto';
import { MerchantActivityService } from './merchant-activity.service';
import { MerchantImportService } from './merchant-import.service';
import { MerchantFinanceService } from './merchant-finance.service';
import { CreateMerchantFinancePackageDto, EmailMerchantFinancePackageDto } from './dto/merchant-finance.dto';
import { UpdateMerchantProfileDto } from './dto/update-merchant-profile.dto';
import { MerchantEvidenceAttachmentService } from './merchant-evidence-attachment.service';
import { MerchantInsightsService } from '../analytics-intelligence/merchant-insights.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('merchants')
@ApiBearerAuth('access-token')
@Controller('merchants/me')
export class MerchantController {
  constructor(
    private readonly merchants: MerchantService,
    private readonly inventory: MerchantInventoryService,
    private readonly activity: MerchantActivityService,
    private readonly imports: MerchantImportService,
    private readonly finance: MerchantFinanceService,
    private readonly attachments: MerchantEvidenceAttachmentService,
    private readonly insights: MerchantInsightsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user merchant profile' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.merchants.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update current merchant business profile' })
  updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateMerchantProfileDto) {
    return this.merchants.updateProfile(user.id, dto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get compact merchant workspace summary' })
  async getSummary(
    @CurrentUser() user: { id: string },
    @Query('period') period = '30d',
  ) {
    if (period !== '30d')
      throw new BadRequestException('Only period=30d is supported');
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86_400_000);
    const [summary, analytics, lowStockProductCount, readiness] = await Promise.all([
      this.merchants.getSummary(user.id, period),
      this.activity.analytics(user.id, from, now),
      this.inventory.lowStockCount(user.id),
      this.merchants.getReadiness(user.id),
    ]);
    return {
      ...summary,
      recordedToday: analytics.today.sales,
      recordedSaleCountToday: analytics.today.saleCount,
      recordedAverageSaleToday: analytics.today.averageSale,
      topProductToday: analytics.today.topProduct,
      peakSellingHourToday: analytics.today.peakSellingHour,
      recorded30Days: analytics.totalRecordedSales,
      recordedSaleCount30Days: analytics.saleCount,
      recordedAverageSale: analytics.averageSale,
      recordedDailyTrend: analytics.dailyTrend,
      recordedHourlyRhythm: analytics.hourlyRhythm,
      lowStockProductCount,
      readinessStage: readiness.stage,
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List merchant-facing receipts' })
  listTransactions(
    @CurrentUser() user: { id: string },
    @Query() query: ListMerchantTransactionsDto,
  ) {
    return this.merchants.listTransactions(user.id, query);
  }

  @Post('payment-requests')
  @ApiOperation({
    summary: 'Create a EUR-denominated merchant payment request',
  })
  createPaymentRequest(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateMerchantPaymentRequestDto,
  ) {
    return this.merchants.createPaymentRequest(user.id, dto);
  }

  @Get('payment-requests')
  @ApiOperation({ summary: 'List fast merchant payment requests and their status' })
  listPaymentRequests(
    @CurrentUser() user: { id: string },
    @Query() query: ListMerchantPaymentRequestsDto,
  ) {
    return this.merchants.listPaymentRequests(user.id, query);
  }

  @Get('payment-requests/:id')
  @ApiOperation({ summary: 'Get a merchant payment request state' })
  getPaymentRequest(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.merchants.getPaymentRequest(user.id, id);
  }

  @Get('products')
  @ApiOperation({ summary: 'List merchant inventory products' })
  listProducts(
    @CurrentUser() user: { id: string },
    @Query() query: ListMerchantProductsDto,
  ) {
    return this.inventory.listProducts(user.id, query);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create an inventory product' })
  createProduct(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateMerchantProductDto,
  ) {
    return this.inventory.createProduct(user.id, dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update or archive an inventory product' })
  updateProduct(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantProductDto,
  ) {
    return this.inventory.updateProduct(user.id, id, dto);
  }

  @Post('products/:id/stock-adjustments')
  @ApiOperation({ summary: 'Adjust physical on-hand product stock' })
  adjustProductStock(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustMerchantProductStockDto,
  ) {
    return this.inventory.adjustStock(user.id, id, dto);
  }

  @Get('products/:id/analytics')
  @ApiOperation({ summary: 'Get product sales analytics from recorded digital and cash sales' })
  getProductAnalytics(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Query('period') period?: string) {
    return this.activity.productAnalytics(user.id, id, period === '7d' ? 7 : 30);
  }

  @Post('products/:id/image')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Upload or replace a product image' })
  setProductImage(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() image: Express.Multer.File,
  ) {
    return this.inventory.setProductImage(user.id, id, image);
  }

  @Delete('products/:id/image')
  @ApiOperation({ summary: 'Remove a product image' })
  deleteProductImage(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventory.deleteProductImage(user.id, id);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List itemised merchant invoices' })
  listInvoices(
    @CurrentUser() user: { id: string },
    @Query() query: ListMerchantInvoicesDto,
  ) {
    return this.inventory.listInvoices(user.id, query);
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Create an itemised inventory invoice' })
  createInvoice(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateMerchantInvoiceDto,
  ) {
    return this.inventory.createInvoice(user.id, dto);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get an itemised merchant invoice' })
  getInvoice(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventory.getInvoice(user.id, id);
  }

  @Post('invoices/:id/cancel')
  @ApiOperation({ summary: 'Cancel a pending invoice and release inventory' })
  cancelInvoice(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventory.cancelInvoice(user.id, id);
  }

  @Get('consents')
  getConsent(@CurrentUser() user: { id: string }) {
    return this.merchants.getConsent(user.id);
  }

  @Post('consents')
  updateConsent(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateMerchantConsentDto,
  ) {
    return this.merchants.updateConsent(user.id, dto.active);
  }

  @Get('evidence-readiness')
  getReadiness(@CurrentUser() user: { id: string }) {
    return this.merchants.getReadiness(user.id);
  }

  @Get('activity')
  @ApiOperation({ summary: 'List combined verified payments and recorded cash sales' })
  listActivity(@CurrentUser() user: { id: string }, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('source') source?: string, @Query('environment') environment?: string) {
    if (source && source !== 'mcbuse_payment' && source !== 'merchant_cash') throw new BadRequestException('Unsupported activity source');
    if (environment && !['live', 'test', 'synthetic', 'unknown'].includes(environment)) throw new BadRequestException('Unsupported activity environment');
    return this.activity.listActivity(user.id, Math.max(1, Number(page) || 1), Math.min(100, Math.max(1, Number(pageSize) || 20)), { source: source as 'mcbuse_payment' | 'merchant_cash' | undefined, environment: environment as 'live' | 'test' | 'synthetic' | 'unknown' | undefined });
  }

  @Post('cash-sales')
  @ApiOperation({ summary: 'Record a merchant-declared cash sale' })
  createCashSale(@CurrentUser() user: { id: string }, @Body() dto: CreateMerchantCashSaleDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.activity.createCashSale(user.id, dto, idempotencyKey ?? '');
  }

  @Post('cash-sales/:id/void')
  @ApiOperation({ summary: 'Void a recorded cash sale and restore stock once when applicable' })
  voidCashSale(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidMerchantCashSaleDto) {
    return this.activity.voidCashSale(user.id, id, dto.reason);
  }

  @Post('cash-sales/:id/attachment')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Attach one private JPEG, PNG, or PDF support document to a cash sale' })
  uploadCashSaleAttachment(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.attachments.upload(user.id, id, file);
  }

  @Get('cash-sales/:id/attachment')
  @ApiOperation({ summary: 'Download a private cash-sale support document' })
  async downloadCashSaleAttachment(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) {
    const file = await this.attachments.download(user.id, id);
    return new StreamableFile(file.contents, { type: file.contentType, disposition: `attachment; filename="${file.originalName}"` });
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get recorded merchant sales analytics' })
  getAnalytics(@CurrentUser() user: { id: string }, @Query() query: ListMerchantAnalyticsDto) {
    if (this.config.get<string>('MERCHANT_GENERAL_ANALYTICS_ENABLED') === 'false') throw new ServiceUnavailableException('General Analytics is temporarily unavailable');
    const now = new Date(); const periodDays = query.period === '7d' ? 7 : query.period === '90d' ? 90 : 30;
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - periodDays * 86_400_000);
    const to = query.to ? new Date(query.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to || to.getTime() - from.getTime() > 366 * 86_400_000) throw new BadRequestException('Invalid analytics period');
    return this.activity.analytics(user.id, from, to, { source: query.source, environment: query.environment });
  }

  @Get('insights')
  @ApiOperation({ summary: 'Get the latest calculated merchant business insights' })
  getInsights(@CurrentUser() user: { id: string }) {
    return this.insights.getForUser(user.id);
  }

  @Get('credit-assessment')
  @ApiOperation({ summary: 'Get the versioned, demonstration evidence-readiness assessment' })
  async getCreditAssessment(@CurrentUser() user: { id: string }) {
    const to = new Date(); const from = new Date(to.getTime() - 30 * 86_400_000);
    const [readiness, activity, reconciliation] = await Promise.all([this.merchants.getReadiness(user.id), this.activity.analytics(user.id, from, to), this.imports.listReconciliation(user.id)]);
    return { modelId: 'readiness-rules', modelVersion: 'readiness-rules-v1', assessedAt: to.toISOString(), stage: readiness.stage, readiness, businessActivity: activity, paymentReliability: { finalizedPayments: readiness.measured.finalizedPayments, finalityPercent: readiness.measured.finalityPercent, captureQualityPercent: readiness.measured.captureQualityPercent }, evidenceSources: activity.sourceCoverage, payoutReconciliation: reconciliation, limitations: [readiness.disclaimer, 'This demonstration checks evidence completeness. It is not a credit score or lending decision.'] };
  }

  @Post('imports/:kind/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Preview an inventory or settlement CSV/XLSX import' })
  previewImport(@CurrentUser() user: { id: string }, @Param('kind') kind: 'inventory' | 'settlement', @Body('sourceName') sourceName: string, @Body('applyStockSnapshot') applyStockSnapshot: string | undefined, @UploadedFile() file: Express.Multer.File) {
    if (kind !== 'inventory' && kind !== 'settlement') throw new BadRequestException('Unsupported import type');
    return this.imports.preview(user.id, kind, sourceName, file, applyStockSnapshot === 'true');
  }

  @Post('imports/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Preview an inventory or settlement CSV/XLSX import' })
  previewImportByKind(
    @CurrentUser() user: { id: string },
    @Body('kind') kind: string,
    @Body('sourceName') sourceName: string,
    @Body('applyStockSnapshot') applyStockSnapshot: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (kind !== 'inventory' && kind !== 'settlement')
      throw new BadRequestException('Unsupported import type');
    return this.imports.preview(
      user.id,
      kind,
      sourceName,
      file,
      applyStockSnapshot === 'true',
    );
  }

  @Post('imports/:id/mapping')
  @ApiOperation({ summary: 'Map uploaded import columns before validation and commit' })
  updateImportMapping(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body('fieldMap') fieldMap: Record<string, string>) {
    if (!fieldMap || typeof fieldMap !== 'object') throw new BadRequestException('A column mapping is required');
    return this.imports.updateMapping(user.id, id, fieldMap);
  }

  @Get('imports')
  @ApiOperation({ summary: 'List merchant import history without raw uploaded content' })
  listImports(@CurrentUser() user: { id: string }) { return this.imports.listImports(user.id); }

  @Post('imports/:id/commit')
  @ApiOperation({ summary: 'Commit a validated merchant import' })
  commitImport(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') idempotencyKey?: string) { return this.imports.commit(user.id, id, idempotencyKey); }

  @Get('reconciliation')
  @ApiOperation({ summary: 'List imported payout reconciliation records' })
  reconciliation(@CurrentUser() user: { id: string }) { return this.imports.listReconciliation(user.id); }

  @Post('finance-packages')
  @ApiOperation({ summary: 'Create an immutable merchant financial evidence package' })
  createFinancePackage(@CurrentUser() user: { id: string }, @Body() dto: CreateMerchantFinancePackageDto, @Headers('idempotency-key') idempotencyKey?: string) { return this.finance.createPackage(user.id, dto.periodDays ?? 30, dto.demonstrationData ?? false, idempotencyKey ?? ''); }

  @Get('finance-packages/:id')
  @ApiOperation({ summary: 'Get a financial evidence package snapshot' })
  getFinancePackage(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) { return this.finance.getPackage(user.id, id); }

  @Get('finance-packages/:id/pdf')
  @ApiOperation({ summary: 'Download the financial evidence package PDF' })
  async downloadFinancePdf(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) { return new StreamableFile(await this.finance.pdf(user.id, id), { type: 'application/pdf', disposition: `attachment; filename="mcbuse-evidence-${id}.pdf"` }); }

  @Get('finance-packages/:id/data')
  @ApiOperation({ summary: 'Download the financial evidence package source data ZIP' })
  async downloadFinanceData(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) { return new StreamableFile(await this.finance.zip(user.id, id), { type: 'application/zip', disposition: `attachment; filename="mcbuse-evidence-${id}.zip"` }); }

  @Post('finance-packages/:id/email')
  @ApiOperation({ summary: 'Send an evidence package through configured SMTP' })
  emailFinancePackage(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EmailMerchantFinancePackageDto, @Headers('idempotency-key') idempotencyKey?: string) { return this.finance.email(user.id, id, dto.recipientEmail, dto.institutionName, dto.confirmed, idempotencyKey ?? ''); }
}
