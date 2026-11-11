import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { CreateSavedSearchDto, UpdateSavedSearchDto } from "./dto/saved-search.dto";
import { SavedSearchesService } from "./saved-searches.service";

@Controller("saved-searches")
export class SavedSearchesController {
  constructor(private readonly searches: SavedSearchesService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.searches.list(principal);
  }

  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateSavedSearchDto) {
    return this.searches.create(principal, dto);
  }

  @Patch(":id")
  update(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateSavedSearchDto) {
    return this.searches.update(principal, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.searches.remove(principal, id);
  }
}
