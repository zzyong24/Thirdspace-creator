"use client";
import {ModelCapabilitySource} from "@/features/settings/model-capability-source";
/** 原选择入口复用同一来源表单，不提供全局覆盖开关。 */
export function AssistantEngineSelector(){return <ModelCapabilitySource/>;}
