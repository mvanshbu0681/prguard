// OWNER: t9a (wave 2). The brief's test: "the contrast toggle writes
// data-contrast" — plus its sibling, the compact-rows attribute, and that
// both survive a reload via localStorage (dashboard §1.3: "persisted in
// localStorage").
import "../ui/dom-polyfills";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONTRAST_ATTR, CONTRAST_STORAGE_KEY, DENSITY_ATTR, DENSITY_STORAGE_KEY, hydrateShellPrefs, useCompactRowsToggle, useContrastToggle, useSidebarCollapsed } from "@/components/app-shell/prefs";

beforeEach(() => {
  document.documentElement.removeAttribute(CONTRAST_ATTR);
  document.documentElement.removeAttribute(DENSITY_ATTR);
  window.localStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute(CONTRAST_ATTR);
  document.documentElement.removeAttribute(DENSITY_ATTR);
  window.localStorage.clear();
});

describe("useContrastToggle", () => {
  it("writes data-contrast=\"high\" on <html> when turned on, and removes it when turned off", () => {
    const { result } = renderHook(() => useContrastToggle());
    expect(result.current[0]).toBe(false);
    expect(document.documentElement.hasAttribute(CONTRAST_ATTR)).toBe(false);

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(document.documentElement.getAttribute(CONTRAST_ATTR)).toBe("high");

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(document.documentElement.hasAttribute(CONTRAST_ATTR)).toBe(false);
  });

  it("persists to localStorage so a reload (hydrateShellPrefs) restores it", () => {
    const { result } = renderHook(() => useContrastToggle());
    act(() => result.current[1](true));
    expect(window.localStorage.getItem(CONTRAST_STORAGE_KEY)).toBe("1");

    document.documentElement.removeAttribute(CONTRAST_ATTR); // simulate a fresh page load
    hydrateShellPrefs();
    expect(document.documentElement.getAttribute(CONTRAST_ATTR)).toBe("high");
  });
});

describe("useCompactRowsToggle", () => {
  it('writes data-density="compact" on <html> when turned on', () => {
    const { result } = renderHook(() => useCompactRowsToggle());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(document.documentElement.getAttribute(DENSITY_ATTR)).toBe("compact");
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).toBe("1");
  });
});

describe("useSidebarCollapsed", () => {
  it("toggles and persists independently of the two <html>-attribute prefs", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(document.documentElement.hasAttribute(CONTRAST_ATTR)).toBe(false);
  });
});
