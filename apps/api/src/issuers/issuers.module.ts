import { Module } from '@nestjs/common';
import { IssuersService } from './issuers.persistence.service';
import { IssuersController } from './issuers.controller';
import { IssuersAdminController } from './issuers-admin.controller';
import { RegistryController } from './registry.controller';

@Module({
  controllers: [IssuersController, IssuersAdminController, RegistryController],
  providers: [IssuersService],
  exports: [IssuersService],
})
export class IssuersModule {}
