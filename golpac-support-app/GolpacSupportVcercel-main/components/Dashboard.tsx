import React, { useMemo } from 'react';
import { Device, DeviceStatus, OSType } from '../types';
import { APP_LATEST_VERSION } from '../constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Activity, Server, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DashboardProps {
  devices: Device[];
}

export const Dashboard: React.FC<DashboardProps> = ({ devices }) => {
  
  const stats = useMemo(() => {
    return {
      total: devices.length,
      online: devices.filter(d => d.status === DeviceStatus.ONLINE).length,
      critical: devices.filter(d => d.status === DeviceStatus.CRITICAL).length,
      outdated: devices.filter(d => d.appVersion !== APP_LATEST_VERSION).length
    };
  }, [devices]);

  const osData = useMemo(() => {
    const counts: Record<string, number> = {};
    devices.forEach(d => {
      counts[d.os] = (counts[d.os] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [devices]);

  const statusData = useMemo(() => {
     const counts: Record<string, number> = {};
     devices.forEach(d => {
       counts[d.status] = (counts[d.status] || 0) + 1;
     });
     return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [devices]);

  const COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981'];
  const STATUS_COLORS: Record<string, string> = {
    [DeviceStatus.ONLINE]: '#22c55e',
    [DeviceStatus.OFFLINE]: '#94a3b8',
    [DeviceStatus.WARNING]: '#f59e0b',
    [DeviceStatus.CRITICAL]: '#ef4444',
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI Cards */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Installs</p>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
            <Server size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Active Online</p>
            <p className="text-2xl font-bold text-green-600">{stats.online}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg text-green-600">
            <Activity size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Critical Issues</p>
            <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg text-red-600">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Outdated Vers.</p>
            <p className="text-2xl font-bold text-orange-600">{stats.outdated}</p>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg text-orange-600">
            <ShieldCheck size={24} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Charts */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Operating System Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={osData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {osData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Device Status Overview</h3>
           <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip cursor={{fill: '#f1f5f9'}} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#cbd5e1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};