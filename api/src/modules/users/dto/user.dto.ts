import { UserRole, UserStatus } from "@prisma/client";
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  requirePasswordChange?: boolean;

  @IsOptional()
  @IsBoolean()
  requireTwoFactor?: boolean;
}

export class UpdateSelfDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  jobTitleEn?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
