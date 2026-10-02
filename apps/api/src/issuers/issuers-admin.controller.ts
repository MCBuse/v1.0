import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { IssuersService } from './issuers.persistence.service';

@ApiTags('issuer-admin')
@Controller('admin/issuer')
export class IssuersAdminController {
  constructor(private readonly issuersService: IssuersService) {}

  @Get('submissions')
  @ApiOperation({ summary: 'Review queue for staff users' })
  getReviewQueue(@CurrentUser() user: { id: string }) {
    return this.issuersService.getReviewQueue(user.id);
  }

  @Get('submissions/:id')
  @ApiOperation({ summary: 'Get a single submission in a reviewer context' })
  getSubmission(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.issuersService.getReviewSubmission(user.id, id);
  }

  @Post('submissions/:id/decision')
  @ApiOperation({ summary: 'Approve or reject a submission' })
  decideSubmission(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.issuersService.decideSubmission(user.id, id, dto);
  }
}
