// OWNER: t1a (wave 1). The `as` prop, typed: a component's own props plus the
// rendered element's props (including React 19's ref-as-a-prop), minus clashes.
import type { ComponentProps, ElementType } from 'react';

export type PolymorphicProps<T extends ElementType, Own = object> = Own & { as?: T } & Omit<ComponentProps<T>, keyof Own | 'as'>;
