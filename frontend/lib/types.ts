export type PlanItem = { title: string; lat: number; lon: number };
export type PlanResponse = {
  date: string; budget: string; interests: string; location: string;
  center: { lat: number; lon: number };
  items: PlanItem[];
};
