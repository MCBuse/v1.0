import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { OperationsHealthController } from './operations-health.controller';
import { OperationsHealthService } from './operations-health.service';

@Module({
  imports: [ConfigModule],
  controllers: [HealthController, OperationsHealthController],
  providers: [OperationsHealthService],
  exports: [OperationsHealthService],
})
export class HealthModule {}
