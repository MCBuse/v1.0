import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
  imports: [UsersModule],
  providers: [TransactionsService, VerifiedEmailGuard],
  controllers: [TransactionsController],
})
export class TransactionsModule {}
