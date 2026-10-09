import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewDecisionDto {
  @IsString()
  @IsNotEmpty()
  decision: 'approved' | 'rejected' | 'changes_requested';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];
}
