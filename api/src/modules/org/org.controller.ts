import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import {
  CreateDepartmentDto,
  CreateEmployeeDto,
  CreateProjectDto,
  CreateSectionDto,
  ListEmployeesQuery,
  UpdateDepartmentDefaultsDto,
  UpdateDepartmentDto,
  UpdateEmployeeDto,
  UpdateProjectDto,
  UpdateSectionDto,
} from "./dto/org.dto";
import { OrgService } from "./org.service";

@Controller("org")
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get("tree")
  tree() {
    return this.org.tree();
  }

  @Get("projects")
  projects() {
    return this.org.projects();
  }

  @Get("employees")
  employees(@CurrentUser() principal: Principal, @Query() query: ListEmployeesQuery) {
    return this.org.employees(principal, query.page ?? 1, query.pageSize ?? 50);
  }

  @Get("departments/:id/defaults")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  departmentDefaults(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.org.departmentDefaults(principal, id);
  }

  @Put("departments/:id/defaults")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  putDepartmentDefaults(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateDepartmentDefaultsDto) {
    return this.org.putDepartmentDefaults(principal, id, dto.value);
  }

  @Post("departments")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  createDepartment(@CurrentUser() principal: Principal, @Body() dto: CreateDepartmentDto) {
    return this.org.createDepartment(principal, dto);
  }

  @Patch("departments/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  updateDepartment(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateDepartmentDto) {
    return this.org.updateDepartment(principal, id, dto);
  }

  @Delete("departments/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  deleteDepartment(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.org.deleteDepartment(principal, id);
  }

  @Post("sections")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  createSection(@CurrentUser() principal: Principal, @Body() dto: CreateSectionDto) {
    return this.org.createSection(principal, dto);
  }

  @Patch("sections/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  updateSection(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateSectionDto) {
    return this.org.updateSection(principal, id, dto);
  }

  @Delete("sections/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  deleteSection(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.org.deleteSection(principal, id);
  }

  @Post("projects")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  createProject(@CurrentUser() principal: Principal, @Body() dto: CreateProjectDto) {
    return this.org.createProject(principal, dto);
  }

  @Patch("projects/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  updateProject(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.org.updateProject(principal, id, dto);
  }

  @Delete("projects/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  deleteProject(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.org.deleteProject(principal, id);
  }

  @Post("employees")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  createEmployee(@CurrentUser() principal: Principal, @Body() dto: CreateEmployeeDto) {
    return this.org.createEmployee(principal, dto);
  }

  @Patch("employees/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  updateEmployee(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateEmployeeDto) {
    return this.org.updateEmployee(principal, id, dto);
  }

  @Delete("employees/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER)
  deleteEmployee(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.org.deleteEmployee(principal, id);
  }
}
