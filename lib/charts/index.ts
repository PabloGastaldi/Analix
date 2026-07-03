// chartType -> Recharts component decision table + result mapping/formatting
// helpers (design §3). Pure units; framework-specific rendering lives in
// components/dashboard/ (Work Unit 7).
export { chartComponentFor, type ChartComponentKey } from "./chartComponentFor";
export { mapEncoding, type ResolvedEncoding } from "./mapEncoding";
export { formatValue } from "./formatValue";
export {
  classifyChartData,
  type ChartDataClassification,
} from "./classifyChartData";
