import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { ToggleFavoriteDto } from "./dto/toggle-favorite.dto";
import { ReportTemplatesService } from "./report-templates.service";

@Controller("report-templates")
export class ReportTemplatesController {
  constructor(private readonly templates: ReportTemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Patch(":id/favorite")
  setFavorite(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: ToggleFavoriteDto) {
    return this.templates.setFavorite(principal, id, dto.favorite);
  }
}
