import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class ListProjectsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(["createdAt", "updatedAt", "name"])
  sortBy: "createdAt" | "updatedAt" | "name" = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection: "asc" | "desc" = "desc";

  @IsOptional()
  @IsIn(["active", "archived", "all"])
  status: "active" | "archived" | "all" = "active";
}
