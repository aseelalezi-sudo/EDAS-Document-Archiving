import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { CreateTaskCommentDto } from "./dto/create-task-comment.dto";
import { CreateTaskDto } from "./dto/create-task.dto";
import { ListTasksQuery } from "./dto/list-tasks.query";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() principal: Principal, @Query() query: ListTasksQuery) {
    return this.tasks.list(principal, query);
  }

  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateTaskDto) {
    return this.tasks.create(principal, dto);
  }

  @Patch(":id")
  update(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(principal, id, dto);
  }

  @Post(":id/complete")
  complete(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.tasks.complete(principal, id);
  }

  @Get(":id/comments")
  comments(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.tasks.listComments(principal, id);
  }

  @Post(":id/comments")
  addComment(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: CreateTaskCommentDto) {
    return this.tasks.addComment(principal, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.tasks.remove(principal, id);
  }
}
