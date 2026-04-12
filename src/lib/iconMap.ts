import {
  Zap, Cpu, BatteryCharging, Radio, Gauge, Power,
  ToggleLeft, Droplets, Cable, Wrench, Cog, Waves, ShieldOff,
  Package, CircuitBoard, Plug, Thermometer, Lightbulb, Settings,
  Box
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const iconMap: Record<string, LucideIcon> = {
  Zap,
  Cpu,
  BatteryCharging,
  Radio,
  Gauge,
  Power,
  ToggleLeft,
  Droplets,
  Cable,
  Wrench,
  Cog,
  Waves,
  ShieldOff,
  Package,
  CircuitBoard,
  Plug,
  Thermometer,
  Lightbulb,
  Settings,
  Box,
};

export function getIconComponent(iconName: string): LucideIcon {
  return iconMap[iconName] || Package;
}
