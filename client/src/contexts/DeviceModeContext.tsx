import React, { createContext, useContext, useEffect, useState, useMemo } from "react";

// Device mode types
export type DeviceMode = "mobile" | "tablet" | "desktop";
export type LayoutMode = "mobile" | "desktop"; // Simplified for layout decisions

// Breakpoints (in pixels)
const BREAKPOINTS = {
  mobile: 640,    // < 640px = mobile phone
  tablet: 1024,   // 640-1024px = tablet
  desktop: 1024,  // > 1024px = desktop
} as const;

interface DeviceModeContextType {
  // Detailed device mode
  deviceMode: DeviceMode;

  // Simplified layout mode (for layout component decisions)
  layoutMode: LayoutMode;

  // Individual checks
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;

  // Touch capability
  isTouchDevice: boolean;

  // Screen dimensions
  screenWidth: number;
  screenHeight: number;

  // Orientation
  isLandscape: boolean;
  isPortrait: boolean;

  // Helper to check if current mode matches
  isMode: (mode: DeviceMode | DeviceMode[]) => boolean;
}

const DeviceModeContext = createContext<DeviceModeContextType | undefined>(undefined);

function getDeviceMode(width: number): DeviceMode {
  if (width < BREAKPOINTS.mobile) return "mobile";
  if (width < BREAKPOINTS.desktop) return "tablet";
  return "desktop";
}

function getLayoutMode(deviceMode: DeviceMode): LayoutMode {
  // Tablets use mobile layout in portrait, desktop in landscape
  // For simplicity, we'll treat tablets as mobile layout
  return deviceMode === "desktop" ? "desktop" : "mobile";
}

function checkTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is IE-specific
    navigator.msMaxTouchPoints > 0
  );
}

export function DeviceModeProvider({ children }: { children: React.ReactNode }) {
  const [screenWidth, setScreenWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const [screenHeight, setScreenHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 768
  );
  const [isTouchDevice, setIsTouchDevice] = useState(() => checkTouchDevice());

  useEffect(() => {
    // Check touch capability
    setIsTouchDevice(checkTouchDevice());

    // Handle resize
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };

    // Initial set
    handleResize();

    // Listen for resize events
    window.addEventListener("resize", handleResize);

    // Also listen for orientation changes on mobile
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const value = useMemo<DeviceModeContextType>(() => {
    const deviceMode = getDeviceMode(screenWidth);
    const layoutMode = getLayoutMode(deviceMode);

    return {
      deviceMode,
      layoutMode,
      isMobile: deviceMode === "mobile",
      isTablet: deviceMode === "tablet",
      isDesktop: deviceMode === "desktop",
      isTouchDevice,
      screenWidth,
      screenHeight,
      isLandscape: screenWidth > screenHeight,
      isPortrait: screenWidth <= screenHeight,
      isMode: (mode: DeviceMode | DeviceMode[]) => {
        if (Array.isArray(mode)) {
          return mode.includes(deviceMode);
        }
        return deviceMode === mode;
      },
    };
  }, [screenWidth, screenHeight, isTouchDevice]);

  return (
    <DeviceModeContext.Provider value={value}>
      {children}
    </DeviceModeContext.Provider>
  );
}

export function useDeviceMode(): DeviceModeContextType {
  const context = useContext(DeviceModeContext);
  if (context === undefined) {
    throw new Error("useDeviceMode must be used within a DeviceModeProvider");
  }
  return context;
}

// Convenience hook for layout-level decisions
export function useLayoutMode(): LayoutMode {
  const { layoutMode } = useDeviceMode();
  return layoutMode;
}

// Convenience hook for checking if we're on mobile/tablet
export function useIsMobileLayout(): boolean {
  const { layoutMode } = useDeviceMode();
  return layoutMode === "mobile";
}
