import { UserX } from "lucide-react";

type EmptyStateProps = {
  message?: string;
};

export function EmptyState({
  message = "No people found",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <UserX size={48} className="mb-4 text-muted-foreground" />
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  );
}
