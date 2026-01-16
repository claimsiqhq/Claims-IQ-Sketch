/**
 * Flow UI Style Constants
 * 
 * Shared colors, spacing, and style utilities for flow-related components.
 * Adapted for web/Tailwind CSS (not React Native).
 */

// Flow status colors
export const flowColors = {
  // Status colors
  complete: '#10b981',      // Green-500
  inProgress: '#3b82f6',    // Blue-500
  pending: '#6b7280',       // Gray-500
  skipped: '#f59e0b',       // Amber-500
  error: '#ef4444',         // Red-500
  
  // UI colors (using Tailwind semantic colors)
  background: 'hsl(var(--background))',
  cardBackground: 'hsl(var(--card))',
  border: 'hsl(var(--border))',
  textPrimary: 'hsl(var(--foreground))',
  textSecondary: 'hsl(var(--muted-foreground))',
  
  // Accent
  primary: 'hsl(var(--primary))',
  primaryLight: 'hsl(var(--primary) / 0.1)',
};

// Spacing scale (Tailwind-based)
export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
};

// Typography scale
export const flowTypography = {
  title: 'text-2xl font-bold text-foreground',
  subtitle: 'text-lg font-semibold text-foreground',
  body: 'text-base text-foreground leading-relaxed',
  caption: 'text-sm text-muted-foreground',
  label: 'text-xs font-medium text-muted-foreground uppercase tracking-wide',
};

// Status badge configurations
export const statusBadgeConfig = {
  complete: {
    className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-800',
    icon: 'check-circle',
    label: 'Complete',
  },
  in_progress: {
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    icon: 'clock',
    label: 'In Progress',
  },
  pending: {
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    icon: 'circle',
    label: 'Pending',
  },
  skipped: {
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    icon: 'skip-forward',
    label: 'Skipped',
  },
  error: {
    className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-200 dark:border-red-800',
    icon: 'alert-circle',
    label: 'Error',
  },
};

// Helper function to get status color class
export function getStatusColor(status: 'complete' | 'in_progress' | 'pending' | 'skipped' | 'error'): string {
  return statusBadgeConfig[status]?.className || statusBadgeConfig.pending.className;
}

// Helper function to get status label
export function getStatusLabel(status: 'complete' | 'in_progress' | 'pending' | 'skipped' | 'error'): string {
  return statusBadgeConfig[status]?.label || 'Unknown';
}
