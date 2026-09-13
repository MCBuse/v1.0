import {
  Body,
  Controller,
  Delete,
  Get,
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
import { UpdateMerchantConsentDto } from './dto/update-merchant-consent.dto';
import { MerchantService } from './merchant.service';
import { MerchantInventoryService } from './merchant-inventory.service';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { UpdateMerchantProductDto } from './dto/update-merchant-product.dto';
import { AdjustMerchantProductStockDto } from './dto/adjust-merchant-product-stock.dto';
import { CreateMerchantInvoiceDto } from './dto/create-merchant-invoice.dto';
import { ListMerchantProductsDto } from './dto/list-merchant-products.dto';
import { ListMerchantInvoicesDto } from './dto/list-merchant-invoices.dto';

@ApiTags('merchants')
@ApiBearerAuth('access-token')
@Controller('merchants/me')
export class MerchantController {
  constructor(
    private readonly merchants: MerchantService,
    private readonly inventory: MerchantInventoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user merchant profile' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.merchants.getMe(user.id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get merchant EUR sales and balance summary' })
  getSummary(
    @CurrentUser() user: { id: string },
    @Query('period') period = '30d',
  ) {
    return this.merchants.getSummary(user.id, period);
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
}
