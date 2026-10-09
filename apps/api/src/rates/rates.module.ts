import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { RatesService } from './rates.service';
import { RatesController } from './rates.controller';

@Module({
  // Bounded: onModuleInit awaits the first rate fetch, so a hanging upstream
  // would otherwise block the whole API from booting.
  imports: [HttpModule.register({ timeout: 5000 })],
  controllers: [RatesController],
  providers: [RatesService],
  exports: [RatesService],
})
export class RatesModule {}
