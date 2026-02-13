export type ActivityItem = {
  id: string;
  title: string;
  time: string;
  type: "deploy" | "note" | "task";
};
