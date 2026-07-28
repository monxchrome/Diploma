import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class RetrievalFiltersDto {
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) knowledgeBaseIds?: string[];
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) documentIds?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageStart?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageEnd?: number;
  @IsOptional() @IsString() createdAfter?: string;
  @IsOptional() @IsString() createdBefore?: string;
}

export class RetrievalRequestDto {
  @IsString() @MaxLength(4000) query!: string;
  @IsOptional() @IsEnum(["DENSE", "SPARSE", "HYBRID"]) mode?: "DENSE" | "SPARSE" | "HYBRID";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) topK?: number;
  @IsOptional() @ValidateNested() @Type(() => RetrievalFiltersDto) filters?: RetrievalFiltersDto;
}

export class FeedbackDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
