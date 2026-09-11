/**
 * Library entry point. Re-exports the config types consumers author
 * form definitions against. Runner logic lands in later increments.
 */

export * from "./types";
export * from "./errors";
export { loadFormConfig, loadFormConfigs, validateFormConfig } from "./config";

export const VERSION = "0.1.0";
