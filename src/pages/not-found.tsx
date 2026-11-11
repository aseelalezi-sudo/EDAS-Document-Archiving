import { useNavigate } from "react-router-dom";
import { Compass, LayoutDashboard, ArrowRight } from "lucide-react";
import { useApp } from "../store";
import { Button, EmptyState } from "../components/ui";

export function NotFound() {
  const { t } = useApp();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10">
      <div className="w-full max-w-lg">
        <p className="text-center font-display text-6xl font-black tracking-tight text-navy-200 dark:text-navy-500/40">404</p>
        <EmptyState
          icon={<Compass className="h-8 w-8" />}
          variant="search"
          title={t("nf.title")}
          description={t("nf.sub")}
          action={
            <div className="flex items-center gap-2">
              <Button onClick={() => navigate("/dashboard")}>
                <LayoutDashboard className="h-4 w-4" />
                {t("nf.home")}
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                {t("nf.back")}
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}
