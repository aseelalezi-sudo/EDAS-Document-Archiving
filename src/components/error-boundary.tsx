import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";
import { translations } from "../i18n";

function text(lang: "ar" | "en", key: string) {
  return (translations[lang] as Record<string, string>)[key] ?? (translations.ar as Record<string, string>)[key] ?? key;
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const lang: "ar" | "en" = typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ar";

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6 dark:bg-ink-950">
        <div className="w-full max-w-md rounded-3xl border border-ink-200/70 bg-white p-8 text-center shadow-sm dark:border-ink-800 dark:bg-ink-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-500 dark:bg-rose-500/15">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="mt-4 font-display text-xl font-extrabold text-ink-900 dark:text-white">{text(lang, "err.title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{text(lang, "err.sub")}</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={this.retry}
              className="inline-flex items-center gap-2 rounded-xl bg-navy-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-navy-800"
            >
              <RotateCcw className="h-4 w-4" />
              {text(lang, "err.retry")}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2 text-sm font-bold text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
            >
              <RefreshCw className="h-4 w-4" />
              {text(lang, "err.reload")}
            </button>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-6 max-h-40 overflow-auto rounded-xl bg-ink-100 p-3 text-start text-xs text-rose-600 dark:bg-ink-950 dark:text-rose-400">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
