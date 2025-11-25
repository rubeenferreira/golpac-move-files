import React, { useState } from 'react';
import { Device } from '../types';
import { Badge } from './ui/Badge';
import { Search, Monitor, Calendar, Hash, Trash2 } from 'lucide-react';

interface DeviceListProps {
  devices: Device[];
  onDeleteDevice: (id: string) => void;
}

export const DeviceList: React.FC<DeviceListProps> = ({ devices, onDeleteDevice }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDevices = devices.filter(d => 
    d.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.ipAddress.includes(searchTerm)
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Filter */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Monitor size={20} className="text-slate-500"/>
            All Devices
        </h2>
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
                type="text"
                placeholder="Search hostname, user..."
                className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 w-full sm:w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
                <tr>
                    <th className="px-6 py-3">Hostname</th>
                    <th className="px-6 py-3">User</th>
                    <th className="px-6 py-3">OS</th>
                    <th className="px-6 py-3">App Ver.</th>
                    <th className="px-6 py-3">IP Address</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Last Seen</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredDevices.map((device) => (
                    <tr key={device.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-900">{device.hostname}</td>
                        <td className="px-6 py-3 text-slate-600">{device.userName}</td>
                        <td className="px-6 py-3">
                            <Badge status={device.os} />
                            <span className="ml-2 text-slate-400 text-xs">{device.osVersion}</span>
                        </td>
                        <td className="px-6 py-3 text-slate-600 flex items-center gap-1">
                           <Hash size={12} className="text-slate-400" />
                           {device.appVersion}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-slate-500">{device.ipAddress}</td>
                        <td className="px-6 py-3">
                            <Badge status={device.status} />
                        </td>
                        <td className="px-6 py-3 text-slate-500 flex items-center gap-2">
                            <Calendar size={14} className="text-slate-400"/>
                            {new Date(device.lastSeen).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-right">
                             <button 
                                onClick={() => {
                                    if(confirm('Are you sure you want to remove this device?')) {
                                        onDeleteDevice(device.id);
                                    }
                                }}
                                className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                title="Remove Device"
                             >
                                 <Trash2 size={16} />
                             </button>
                        </td>
                    </tr>
                ))}
                {filteredDevices.length === 0 && (
                    <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                            No devices found matching "{searchTerm}"
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-slate-100 text-xs text-slate-400 bg-slate-50">
        Showing {filteredDevices.length} of {devices.length} devices
      </div>
    </div>
  );
};