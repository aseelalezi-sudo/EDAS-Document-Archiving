import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useApp } from "../store";
import { restoreSession } from "../lib/session";
import { AuthShell } from "./auth-login";

function callbackParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  return hash.includes("?") ? new URLSearchParams(hash.slice(hash.indexOf("?") + 1)) : params;
}

export function AuthCallback() {
  const { t } = useApp();
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = callbackParams();
    const error = params.get("error");
    if (error) {
      setReason(params.get("error_description") ?? error);
      setFailed(true);
      return;
    }
    // The API exchanges the authorization code and sets the session cookie, so reaching this route
    // without an error only needs a session check to land the user back in the app.
    void restoreSession().then((profile) => {
      if (profile) window.location.replace(`${window.location.origin}${window.location.pathname}#/dashboard`);
      else setFailed(true);
    });
  }, []);

  return (
    <AuthShell>
      <div className="rounded-2xl border border-ink-200/70 bg-white p-8 text-center shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-600 dark:bg-navy-500/10 dark:text-navy-300">
          <ShieldCheck className="h-6 w-6" />
        </span>
        {failed ? (
          <>
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-300">{t("auth.callback.failed")}</p>
            {reason && <p className="mt-2 text-xs font-medium text-ink-500 dark:text-ink-400">{t("auth.callback.reason", { reason })}</p>}
            <Link
              to="/login"
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-navy-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-navy-700"
            >
              {t("auth.back")}
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-ink-600 dark:text-ink-300">{t("auth.callback.loading")}</p>
            <div className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-navy-500" />
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
