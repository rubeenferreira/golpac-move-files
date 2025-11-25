
export enum DeviceStatus {
  ONLINE = 'Online',
  OFFLINE = 'Offline',
  WARNING = 'Warning',
  CRITICAL = 'Critical'
}

export enum OSType {
  WINDOWS = 'Windows',
  MACOS = 'macOS',
  LINUX = 'Linux',
  UNKNOWN = 'Unknown'
}

export interface Device {
  id: string;
  hostname: string;
  os: OSType;
  osVersion: string;
  appVersion: string;
  ipAddress: string;
  lastSeen: string; // ISO Date string
  status: DeviceStatus;
  userId: string;
  userName: string;
  company?: string; // The group/company assignment
  appUsage?: AppUsageStat[];
  webUsage?: WebUsageStat[];
}

export interface FleetStats {
  totalDevices: number;
  activeOnline: number;
  outdatedVersions: number;
  criticalIssues: number;
}

export type UserRole = 'Admin' | 'User';

export interface User {
  id: string;
  username: string;
  password: string; // In a real app, this would be hashed
  role: UserRole;
  company: string;
}

export type ViewState = 'dashboard' | 'devices' | 'users';

// New Interfaces for Expanded View
export interface AppUsageStat {
  name: string;
  usageMinutes: number;
  percentage: number;
  color: string;
}

export interface WebUsageStat {
  domain: string;
  visits: number;
  category: string;
}
