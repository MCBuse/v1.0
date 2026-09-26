import { Transform } from 'class-transformer';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantService } from '../data-capture/merchant.service';
import { CreditEvidenceService } from './credit-evidence.service';
import {
  CreditAnalystGuard,
  CreditAccessService,
} from './credit-access.service';
import { StaffCreditService } from './staff-credit.service';
import { ScoringClient } from './scoring-client';
class ProfileDto {
  @IsObject() data: Record<string, unknown>;
}
class ConsentDto {
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.active)
  @IsBoolean()
  active: boolean;
}
class PilotDto {
  @IsOptional() @IsUUID() merchantId?: string;
  @IsOptional() @IsString() @MaxLength(40) exampleId?: string;
}
class HistoryDto {
  @IsOptional() @IsUUID() merchantId?: string;
}
@Controller('merchants/me')
@UseGuards(JwtAuthGuard)
export class MerchantCreditController {
  constructor(
    private readonly merchants: MerchantService,
    private readonly evidence: CreditEvidenceService,
  ) {}
  @Get('credit-profile') async profile(@CurrentUser() u: { id: string }) {
    return this.evidence.profile(
      (await this.merchants.requireMerchant(u.id)).merchantId,
    );
  }
  @Patch('credit-profile') async save(
    @CurrentUser() u: { id: string },
    @Body() dto: ProfileDto,
  ) {
    return this.evidence.saveProfile(
      (await this.merchants.requireMerchant(u.id)).merchantId,
      dto.data,
    );
  }
  /** George's activity-derived inputs, as a run would compute them now. */
  @Get('credit-inputs') async inputs(@CurrentUser() u: { id: string }) {
    return this.evidence.preview(
      (await this.merchants.requireMerchant(u.id)).merchantId,
    );
  }
  @Get('credit-pilot-consent') async consent(@CurrentUser() u: { id: string }) {
    return this.evidence.consent(
      (await this.merchants.requireMerchant(u.id)).merchantId,
    );
  }
  @Post('credit-pilot-consent') async updateConsent(
    @CurrentUser() u: { id: string },
    @Body() dto: ConsentDto,
  ) {
    return this.evidence.setConsent(
      (await this.merchants.requireMerchant(u.id)).merchantId,
      u.id,
      dto.active,
    );
  }
}
@Controller('staff')
@UseGuards(JwtAuthGuard, CreditAnalystGuard)
export class StaffCreditController {
  constructor(
    private readonly staff: StaffCreditService,
    private readonly access: CreditAccessService,
    private readonly scoring: ScoringClient,
  ) {}
  @Get('me') me() {
    return { permission: 'credit_analyst' };
  }
  @Get('credit-assessments/merchants') merchants(
    @CurrentUser() u: { id: string },
  ) {
    return this.staff.merchants(u.id);
  }
  @Get('credit-assessments/model') async metadata(
    @CurrentUser() u: { id: string },
  ) {
    await this.access.audit(u.id, 'credit.model.read');
    try {
      return await this.scoring.metadata();
    } catch {
      throw new ServiceUnavailableException(
        'Scoring service temporarily unavailable',
      );
    }
  }
  @Get('credit-assessments') history(
    @CurrentUser() u: { id: string },
    @Query() q: HistoryDto,
  ) {
    return this.staff.history(u.id, q.merchantId);
  }
  @Post('credit-assessments') run(
    @CurrentUser() u: { id: string },
    @Body() dto: PilotDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.staff.run(u.id, dto, key);
  }
  @Get('credit-assessments/:id') detail(
    @CurrentUser() u: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staff.detail(u.id, id);
  }
}
