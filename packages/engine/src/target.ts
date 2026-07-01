/**
 * Output targets (DESIGN.md -> "broader output"). A tool's web/TS files can be
 * emitted for several targets. web + pwa are fully offline-buildable here; native
 * targets (android/ios/desktop) return a needs-user marker naming the toolchain,
 * since those builds require external SDKs (and iOS a Mac).
 */

export type BuildTarget = "web" | "pwa" | "android" | "ios" | "desktop";

export interface TargetResult {
  readonly target: BuildTarget;
  readonly files: Readonly<Record<string, string>>;
  /** Set when this target needs an external toolchain we can't run offline. */
  readonly needsUser?: string;
}

export interface TargetMeta {
  readonly name?: string;
  readonly themeColor?: string;
}

const NATIVE_TOOLCHAINS: Readonly<Record<string, string>> = {
  android: "packaging for Android needs the Android SDK (offline once cached)",
  ios: "packaging for iOS needs a Mac + Xcode (Apple restriction)",
  desktop: "packaging a desktop app needs the Rust + Tauri toolchain",
};

export function emitTarget(
  target: BuildTarget,
  files: Readonly<Record<string, string>>,
  meta: TargetMeta = {},
): TargetResult {
  if (target === "web") return { target, files };

  if (target === "pwa") {
    const name = meta.name ?? "Maker Tool";
    const theme = meta.themeColor ?? "#16161a";
    const out: Record<string, string> = { ...files };
    out["manifest.webmanifest"] = JSON.stringify(
      {
        name,
        short_name: name,
        start_url: ".",
        display: "standalone",
        background_color: theme,
        theme_color: theme,
        icons: [],
      },
      null,
      2,
    );
    out["sw.js"] =
      "self.addEventListener('install', () => self.skipWaiting());\n" +
      "self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));\n" +
      "self.addEventListener('fetch', () => {});\n";
    if (typeof out["index.html"] === "string") {
      out["index.html"] = injectPwa(out["index.html"], theme);
    }
    return { target, files: out };
  }

  // Native targets: hand back the web files + name the required toolchain.
  return { target, files, needsUser: NATIVE_TOOLCHAINS[target] };
}

function injectPwa(html: string, theme: string): string {
  const head =
    `<link rel="manifest" href="manifest.webmanifest">` +
    `<meta name="theme-color" content="${theme}">` +
    `<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js')</script>`;
  return html.includes("</head>")
    ? html.replace("</head>", head + "</head>")
    : head + html;
}
