"use client";

// OWNER: T1b (wave 1). The shadcn chart layer, restyled — dashboard §7.
// Charts themselves are track T10's (src/components/charts/**).
//
// Dark only: a config colour is written once, no light/dark pair. Axis labels
// are 11px mono in --chart-axis; grid lines are the graticule (--chart-grid);
// reference lines are --chart-reference (--ink-7, meaning-bearing). The
// tooltip is the tooltip spec (--ink-2 on --rule-2, 2px radius, no shadow) with
// tabular mono values. Numbers: precision is chosen by the KIND of value, never
// by whether a value happens to be an integer. A series is a "rate" (scores,
// rates, fractions: always 3 decimals, 0 prints "0.000") unless its config says
// format: "count" (whole numbers, 0 decimals). Pass valueFormatter for money
// (4dp), latency (1dp + unit) and the rest. The container fades in
// over 180ms — the only mount animation a chart gets. No donuts, pies, radars
// or count-ups.
import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type { TooltipValueType } from "recharts";
import { cn } from "@/lib/utils";

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;
type TooltipNameType = number | string;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    /** A token reference: "var(--chart-proven)". Dark only. */
    color?: string;
    /** How the tooltip prints this series. Default "rate" (3 decimals); "count" prints whole numbers. */
    format?: ChartValueFormat;
  }
>;

export type ChartValueFormat = "rate" | "count";

type ChartContextProps = { config: ChartConfig };

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a <ChartContainer />");
  return context;
}

/**
 * The default tooltip number format. Precision depends on the kind of value,
 * so it never varies inside one series: a "rate" is always 3 decimals (0 and 1
 * print "0.000" and "1.000"), a "count" is always 0 decimals.
 */
export function formatChartValue(value: TooltipValueType, format: ChartValueFormat = "rate"): string {
  if (typeof value === "number") return value.toFixed(format === "count" ? 0 : 3);
  if (Array.isArray(value)) return value.map((v) => formatChartValue(v as TooltipValueType, format)).join(" – ");
  return String(value);
}

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
  initialDimension?: { width: number; height: number };
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div data-slot="chart" data-chart={chartId} className={cn("ui-chart flex aspect-video justify-center", className)} {...props}>
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colours = Object.entries(config).filter(([, item]) => item.color);
  if (!colours.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${colours.map(([key, item]) => `  --color-${key}: ${item.color};`).join("\n")}\n}`,
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  valueFormatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
    /** Overrides the per-series `format` from ChartConfig for every row. */
    valueFormatter?: (value: TooltipValueType) => string;
  } & Omit<RechartsPrimitive.DefaultTooltipContentProps<TooltipValueType, TooltipNameType>, "accessibilityLayer">) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) return null;
    const [item] = payload;
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value = !labelKey && typeof label === "string" ? (config[label]?.label ?? label) : itemConfig?.label;
    if (labelFormatter) return <div className={cn("ui-chart-tooltip__label", labelClassName)}>{labelFormatter(value, payload)}</div>;
    if (!value) return null;
    return <div className={cn("ui-chart-tooltip__label", labelClassName)}>{value}</div>;
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

  if (!active || !payload?.length) return null;

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div data-slot="chart-tooltip" className={cn("ui-chart-tooltip", className)}>
      {!nestLabel ? tooltipLabel : null}
      {payload
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          const indicatorColor = color ?? item.payload?.fill ?? item.color;
          return (
            <div key={index} className="ui-chart-tooltip__row">
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : !hideIndicator ? (
                    <span
                      className="ui-chart-tooltip__swatch"
                      data-indicator={indicator}
                      style={{ "--ui-swatch": indicatorColor } as React.CSSProperties}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="min-w-0">
                    {nestLabel ? tooltipLabel : null}
                    <span>{itemConfig?.label ?? item.name}</span>
                  </span>
                  {item.value != null ? <span className="ui-chart-tooltip__value">{valueFormatter ? valueFormatter(item.value) : formatChartValue(item.value, itemConfig?.format)}</span> : null}
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & { hideIcon?: boolean; nameKey?: string } & RechartsPrimitive.DefaultLegendContentProps) {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div data-slot="chart-legend" className={cn("ui-chart-legend", verticalAlign === "top" ? "pb-3" : "pt-3", className)}>
      {payload
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          return (
            <div key={index} className="ui-chart-legend__item">
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <span className="ui-chart-tooltip__swatch" style={{ "--ui-swatch": item.color } as React.CSSProperties} aria-hidden="true" />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
}

function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null) return undefined;
  const payloadPayload =
    "payload" in payload && typeof payload.payload === "object" && payload.payload !== null ? payload.payload : undefined;
  let configLabelKey: string = key;
  if (key in payload && typeof payload[key as keyof typeof payload] === "string") {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (payloadPayload && key in payloadPayload && typeof payloadPayload[key as keyof typeof payloadPayload] === "string") {
    configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string;
  }
  return configLabelKey in config ? config[configLabelKey] : config[key];
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle };
