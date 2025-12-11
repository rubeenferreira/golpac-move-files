import { Device, User } from './types';

// The device list is now empty by default, waiting for API data.
export const MOCK_DEVICES: Device[] = [];

export const APP_LATEST_VERSION = '2.4.1';

export const MOCK_COMPANIES = [
  'Golpac Internal',
  'Acme Logistics',
  'Global Shipping Co.',
  'FastTrack Delivery',
  'Oceanic Transport'
];

export const INITIAL_USERS: User[] = [
  {
    id: '1',
    username: 'admin',
    password: 'golpac-admin',
    role: 'Admin',
    company: 'Golpac Internal'
  }
];