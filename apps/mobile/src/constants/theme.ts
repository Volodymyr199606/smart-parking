export const colors = {
  primary: "#0f172a",
  primaryLight: "#1e293b",
  accent: "#2563eb",
  available: "#22c55e",
  occupied: "#ef4444",
  unknown: "#a3a3a3",
  warning: "#f59e0b",

  background: "#f8fafc",
  surface: "#ffffff",
  border: "#e2e8f0",

  textPrimary: "#0f172a",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  textOnDark: "#ffffff",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const font = {
  light: "300" as const,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,

  sizeXs: 12,
  sizeSm: 14,
  sizeMd: 16,
  sizeLg: 20,
  sizeXl: 24,
  sizeXxl: 32,
  sizeHero: 40,
} as const;
