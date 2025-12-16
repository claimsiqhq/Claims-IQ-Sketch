/**
 * Adaptive Layout Component
 *
 * This component automatically switches between mobile and desktop layouts
 * based on the device screen size:
 *
 * - Mobile (<640px) and Tablet (640-1024px): Uses MobileLayout with bottom navigation
 * - Desktop (>1024px): Uses DesktopLayout with sidebar navigation
 *
 * The layouts are defined in:
 * - ./layouts/MobileLayout.tsx - Mobile-optimized with bottom nav
 * - ./layouts/DesktopLayout.tsx - Desktop sidebar layout
 * - ./layouts/index.tsx - The main adaptive Layout component
 */

import AdaptiveLayout, { type LayoutProps } from "./layouts";

export default function Layout(props: LayoutProps) {
  return <AdaptiveLayout {...props} />;
}

// Re-export layout components and hooks for direct access
export { MobileLayout, DesktopLayout, useDeviceMode, useLayoutMode } from "./layouts";
