import { apiJson } from "./client";

export type DashboardStats = {
  totalStudents: number;
  totalClasses: number;
  checkInsToday: number;
  checkOutsToday: number;
  presentToday: number;
};

export type DashboardData = {
  activeYear: {
    id: number;
    name: string;
    isActive: boolean;
    startDate: string | null;
    endDate: string | null;
  } | null;
  stats: DashboardStats;
};

export async function getDashboard() {
  return apiJson<DashboardData>("/dashboard");
}

export function attendanceRate(stats: DashboardStats) {
  if (!stats.totalStudents) return 0;
  return Math.round((stats.presentToday / stats.totalStudents) * 100);
}
