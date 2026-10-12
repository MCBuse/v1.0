import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { IssuersService } from './issuers.persistence.service';

@ApiTags('issuer')
@Controller('issuer')
export class IssuersController {
  constructor(private readonly issuersService: IssuersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current issuer account and organizations' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.issuersService.getProfile(user.id);
  }

  @Get('submissions')
  @ApiOperation({ summary: 'List the current issuer organization submissions' })
  listSubmissions(@CurrentUser() user: { id: string }) {
    return this.issuersService.listSubmissions(user.id);
  }

  @Post('submissions')
  @ApiOperation({ summary: 'Create a draft stablecoin submission' })
  createSubmission(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.issuersService.createSubmission(user.id, dto);
  }

  @Get('submissions/:id')
  @ApiOperation({ summary: 'Fetch a single submission for the issuer' })
  getSubmission(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.issuersService.getSubmission(user.id, id);
  }

  @Patch('submissions/:id')
  @ApiOperation({ summary: 'Update a draft stablecoin submission' })
  updateSubmission(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.issuersService.updateSubmission(user.id, id, dto);
  }

  @Post('submissions/:id/submit')
  @ApiOperation({ summary: 'Submit a draft for review' })
  submitForReview(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.issuersService.submitForReview(user.id, id);
  }
}
