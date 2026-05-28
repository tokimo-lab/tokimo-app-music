import type { LucideIcon } from "lucide-react";

export function AppIcon({
  icon: Icon,
  className,
  color,
  size = 20,
}: {
  icon: LucideIcon | string;
  className?: string;
  color?: string;
  size?: number;
}) {
  if (typeof Icon === "string") {
    return (
      <span
        className={className}
        style={{ backgroundColor: color, width: size, height: size }}
      />
    );
  }
  return <Icon className={className} color={color} size={size} />;
}
