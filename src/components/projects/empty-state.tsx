import { SearchX } from "lucide-react";

type EmptyStateProps = {
  message?: string;
};

export function EmptyState({
  message = "No projects found",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <SearchX size={48} className="mb-4 text-muted-foreground" />
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  );
}
