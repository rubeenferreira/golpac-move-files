import React from 'react';
import { DeviceStatus } from '../../types';

interface BadgeProps {
  status: DeviceStatus | string;
}

export const Badge: React.FC<BadgeProps> = ({ status }) => {
  let colorClass = 'bg-gray-100 text-gray-800';

  switch (status) {
    case DeviceStatus.ONLINE:
      colorClass = 'bg-green-100 text-green-800 border border-green-200';
      break;
    case DeviceStatus.OFFLINE:
      colorClass = 'bg-slate-100 text-slate-600 border border-slate-200';
      break;
    case DeviceStatus.WARNING:
      colorClass = 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      break;
    case DeviceStatus.CRITICAL:
      colorClass = 'bg-red-100 text-red-800 border border-red-200';
      break;
    default:
        // Handle generic strings if needed (e.g. OS types)
        if (status === 'Windows') colorClass = 'bg-blue-50 text-blue-700 border border-blue-100';
        if (status === 'macOS') colorClass = 'bg-purple-50 text-purple-700 border border-purple-100';
        if (status === 'Linux') colorClass = 'bg-orange-50 text-orange-700 border border-orange-100';
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
};