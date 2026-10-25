import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ChangeDetailResponse,
  ChangeListResponse,
  ChangeRunEvidence,
  ChangeStatusResponse,
} from '@repo/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MerchantService } from '../data-capture/merchant.service';
import { ChangeReadService, type ChangeMerchant } from './change-read.service';
import { ListChangesDto } from './dto/list-changes.dto';

/**
 * Merchant Changes API (plan §7). JWT comes from the global guard. Owners
 * only: anyone else gets 404, as does another merchant's case or run. Static
 * routes are declared before `:changeId`.
 */
@ApiTags('merchant-changes')
@ApiBearerAuth('access-token')
@Controller('merchants/me/changes')
export class ChangeController {
  constructor(
    private readonly merchants: MerchantService,
    private readonly changes: ChangeReadService,
  ) {}

  private async owner(userId: string): Promise<ChangeMerchant> {
    try {
      return await this.merchants.requireMerchant(userId);
    } catch (error) {
      if (error instanceof ForbiddenException) throw new NotFoundException();
      throw error;
    }
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List detected changes' })
  async list(
    @CurrentUser() user: { id: string },
    @Query() query: ListChangesDto,
  ): Promise<ChangeListResponse> {
    return this.changes.list(await this.owner(user.id), query);
  }

  @Get('status')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Changes availability, freshness and readiness' })
  async status(
    @CurrentUser() user: { id: string },
  ): Promise<ChangeStatusResponse> {
    return this.changes.status(await this.owner(user.id));
  }

  @Get('runs/:runId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Bounded calculation evidence for one analysis' })
  async run(
    @CurrentUser() user: { id: string },
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<ChangeRunEvidence> {
    return this.changes.run(await this.owner(user.id), runId);
  }

  @Get(':changeId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'One change with history, trail and evidence' })
  async detail(
    @CurrentUser() user: { id: string },
    @Param('changeId', ParseUUIDPipe) changeId: string,
  ): Promise<ChangeDetailResponse> {
    return this.changes.detail(await this.owner(user.id), changeId);
  }
}
