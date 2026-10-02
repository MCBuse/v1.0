import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { IssuersService } from './issuers.persistence.service';

@ApiTags('registry')
@Controller('registry')
export class RegistryController {
  constructor(private readonly issuersService: IssuersService) {}

  @Public()
  @Get('stablecoins')
  @ApiOperation({ summary: 'List only approved stablecoin registry entries' })
  getPublicRegistry() {
    return this.issuersService.getPublicRegistry();
  }
}
