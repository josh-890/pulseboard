import { cn } from "@/lib/utils";

type PersonAvatarProps = {
  firstName: string;
  lastName: string;
  avatarColor: string;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

export function PersonAvatar({
  firstName,
  lastName,
  avatarColor,
  size = "md",
}: PersonAvatarProps) {
  const initials = `${firstName[0]}${lastName[0]}`;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizeClasses[size],
      )}
      style={{ backgroundColor: avatarColor }}
    >
      {initials}
    </div>
  );
}
