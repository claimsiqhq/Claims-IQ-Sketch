import { useDeviceMode, useLayoutMode } from "@/contexts/DeviceModeContext";
import MobileLayout from "./MobileLayout";
import DesktopLayout from "./DesktopLayout";

export { MobileLayout, DesktopLayout };

export interface LayoutProps {
  children: React.ReactNode;
  hideNav?: boolean; // For full-screen modes
  forceMobile?: boolean; // Force mobile layout
  forceDesktop?: boolean; // Force desktop layout
}

/**
 * Adaptive Layout Component
 *
 * Automatically switches between mobile and desktop layouts
 * based on the device mode (screen size + touch capability).
 *
 * - Mobile (<640px) and Tablet (640-1024px): Uses MobileLayout with bottom nav
 * - Desktop (>1024px): Uses DesktopLayout with sidebar nav
 */
export default function Layout({
  children,
  hideNav = false,
  forceMobile = false,
  forceDesktop = false
}: LayoutProps) {
  const { layoutMode, isTouchDevice, screenWidth } = useDeviceMode();

  // Determine which layout to use
  let useDesktop = layoutMode === "desktop";

  // Allow forced overrides
  if (forceMobile) useDesktop = false;
  if (forceDesktop) useDesktop = true;

  // Use desktop layout
  if (useDesktop) {
    return <DesktopLayout>{children}</DesktopLayout>;
  }

  // Use mobile layout
  return <MobileLayout hideNav={hideNav}>{children}</MobileLayout>;
}

// Re-export for convenience
export { useDeviceMode, useLayoutMode } from "@/contexts/DeviceModeContext";
