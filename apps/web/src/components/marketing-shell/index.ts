// OWNER: t8a (wave 3). The marketing chrome: everything around the nine
// sections wave 3 builds in app/(marketing)/_sections/**. Consumed by
// app/(marketing)/layout.tsx.
export { Nav } from "./Nav";
export { ScrollProgress } from "./ScrollProgress";
export { SkipLink } from "./SkipLink";
export { MobileMenu, type MobileMenuProps } from "./MobileMenu";
export { useActiveSection, type UseActiveSectionOptions } from "./useActiveSection";
export { useNavScrolled } from "./useNavScrolled";
export {
  ACCURACY_SECTION_ID,
  MARKETING_SECTIONS,
  MARKETING_SECTION_IDS,
  NAV_LINKS,
  RUN_SECTION_ID,
  type MarketingSection,
  type NavLink,
} from "./sections";
