import { IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateUploadIntentDto {
  @IsString() @MinLength(1) @MaxLength(255) filename!: string;
  @IsString() @MinLength(1) @MaxLength(255) declaredMimeType!: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) sizeBytes!: number;
}
