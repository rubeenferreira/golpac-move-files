import React, { useState, useMemo } from 'react';
import { Device, AppUsageStat, WebUsageStat } from '../types';
import { Badge } from './ui/Badge';
import { Search, Monitor, Calendar, Hash, Trash2, Building2, Edit2, X, ChevronDown, ChevronUp, Clock, Globe, PieChart as PieChartIcon, LayoutGrid, Filter, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

interface DeviceListProps {
  devices: Device[];
  companies: string[];
  onDeleteDevice: (id: string) => void;
  onAssignCompany: (id: string, company: string) => void;
  onRefreshData: () => Promise<void>;
  isReadOnly?: boolean;
}

// Helper to format decimal minutes into H m s
const formatDuration = (minutes: number) => {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
};

// Mock Data Generator (Fallback only)
const generateMockData = (os: string, dateRange: string) => {
  const isMac = os === 'macOS';
  
  const apps: AppUsageStat[] = isMac ? [
    { name: 'Xcode', usageMinutes: 340, percentage: 45, color: '#0ea5e9' },
    { name: 'Chrome', usageMinutes: 180, percentage: 24, color: '#8b5cf6' },
    { name: 'Slack', usageMinutes: 120, percentage: 16, color: '#f59e0b' },
    { name: 'Terminal', usageMinutes: 80, percentage: 10, color: '#64748b' },
    { name: 'Zoom', usageMinutes: 40, percentage: 5, color: '#10b981' },
  ] : [
    { name: 'Teams', usageMinutes: 240, percentage: 35, color: '#6366f1' },
    { name: 'Outlook', usageMinutes: 180, percentage: 26, color: '#0ea5e9' },
    { name: 'Excel', usageMinutes: 120, percentage: 18, color: '#10b981' },
    { name: 'Edge', usageMinutes: 90, percentage: 13, color: '#3b82f6' },
    { name: 'PowerPoint', usageMinutes: 50, percentage: 8, color: '#f97316' },
  ];

  const websites: WebUsageStat[] = [
    { domain: 'jira.atlassian.net', visits: 142, category: 'Productivity' },
    { domain: 'github.com', visits: 89, category: 'Dev' },
    { domain: 'stackoverflow.com', visits: 64, category: 'Dev' },
    { domain: 'figma.com', visits: 45, category: 'Design' },
    { domain: 'docs.google.com', visits: 32, category: 'Productivity' },
  ];

  return { apps, websites };
};

const COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#f97316', '#64748b'];

const ExpandedDeviceView: React.FC<{ device: Device; onRefresh: () => Promise<void> }> = ({ device, onRefresh }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // Logic to determine if we have real data or should simulate
    const hasRealData = (device.appUsage && device.appUsage.length > 0) || (device.webUsage && device.webUsage.length > 0);

    const { apps, websites } = useMemo(() => {
        if (hasRealData) {
            // Process App Usage
            let realApps = (device.appUsage || []).map((app, idx) => ({
                ...app,
                // Assign color if missing
                color: app.color || COLORS[idx % COLORS.length]
            }));

            // Auto-calculate percentages if the installer didn't send them
            const totalMinutes = realApps.reduce((sum, item) => sum + (item.usageMinutes || 0), 0);
            if (totalMinutes > 0) {
                realApps = realApps.map(app => ({
                    ...app,
                    // If percentage is 0 or missing, calculate it
                    percentage: app.percentage || Math.round((app.usageMinutes / totalMinutes) * 100)
                }));
            }

            const realWebs = device.webUsage || [];
            return { apps: realApps, websites: realWebs };
        } else {
            // Fallback to mock data based on OS
            return generateMockData(device.os, date);
        }
    }, [device, date, hasRealData]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await onRefresh();
        // Artificial delay for UX visibility
        setTimeout(() => setIsRefreshing(false), 500);
    };

    return (
        <div className="bg-slate-50 p-6 border-t border-slate-100 shadow-inner animate-in slide-in-from-top-2 duration-300">
            
            {/* Controls Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                        <LayoutGrid size={16} className="text-brand-500"/>
                        Usage Analytics
                    </h3>
                    <p className="text-xs text-slate-500">
                        {hasRealData ? 'Live reported data' : `Simulated report for ${device.hostname}`}
                    </p>
                </div>
                
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <button 
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={`p-1.5 rounded-md transition-all duration-300 ${isRefreshing ? 'text-brand-500 rotate-180' : 'text-slate-400 hover:text-brand-600 hover:bg-slate-50'}`}
                        title="Refresh Analytics"
                    >
                        <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    <Calendar size={16} className="text-slate-400" />
                    <span className="text-xs font-medium text-slate-600 hidden sm:inline">Date:</span>
                    <input 
                        type="date" 
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        // If we have real data, we disable date picking for now as we only show latest snapshot
                        disabled={hasRealData} 
                        className={`text-sm text-slate-700 focus:outline-none border-none bg-transparent ${hasRealData ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* App Usage Chart */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <PieChartIcon size={18} className="text-purple-500" />
                        Most Used Apps (Duration)
                    </h4>
                    {apps.length > 0 ? (
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="h-48 w-48 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={apps}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        paddingAngle={5}
                                        dataKey="percentage"
                                    >
                                        {apps.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex-1 w-full">
                            <ul className="space-y-3">
                                {apps.map((app, idx) => (
                                    <li key={idx} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: app.color }} />
                                            <span className="font-medium text-slate-700">{app.name}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-500">
                                            <span className="text-xs flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded tabular-nums">
                                                <Clock size={10} /> {formatDuration(app.usageMinutes)}
                                            </span>
                                            <span className="font-bold w-12 text-right">{app.percentage.toFixed(0)}%</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-slate-400 text-sm italic">
                            No app usage data recorded.
                        </div>
                    )}
                </div>

                {/* Web Usage List */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Globe size={18} className="text-blue-500" />
                        Most Viewed Websites
                    </h4>
                    {websites.length > 0 ? (
                    <div className="overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                                <tr>
                                    <th className="px-3 py-2">Domain</th>
                                    <th className="px-3 py-2">Category</th>
                                    <th className="px-3 py-2 text-right">Visits</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {websites.map((site, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-3 font-medium text-slate-700 flex items-center gap-2">
                                            <img 
                                                src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`} 
                                                alt="" 
                                                className="w-4 h-4 opacity-70"
                                            />
                                            {site.domain}
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                {site.category || 'General'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                                            {site.visits}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-slate-400 text-sm italic">
                            No web usage data recorded.
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export const DeviceList: React.FC<DeviceListProps> = ({ 
    devices, 
    companies, 
    onDeleteDevice, 
    onAssignCompany, 
    onRefreshData,
    isReadOnly = false 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('');
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);

  const filteredDevices = devices.filter(d => {
    const matchesSearch = d.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.ipAddress.includes(searchTerm) ||
    (d.company && d.company.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCompany = selectedCompanyFilter === '' || d.company === selectedCompanyFilter;

    return matchesSearch && matchesCompany;
  });

  const toggleExpand = (id: string) => {
      setExpandedDeviceId(prev => prev === id ? null : id);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Filter */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Monitor size={20} className="text-slate-500"/>
            {isReadOnly ? 'Assigned Devices' : 'All Devices'}
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Company Filter Dropdown */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Filter size={16} className="text-slate-400" />
                </div>
                <select
                    value={selectedCompanyFilter}
                    onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                    className="pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 w-full sm:w-48 appearance-none bg-white text-slate-700"
                >
                    <option value="">All Companies</option>
                    {companies.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronDown size={14} className="text-slate-400" />
                </div>
            </div>

            {/* Search Input */}
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
                <tr>
                    <th className="px-4 py-3 w-8"></th> {/* Expansion Chevron */}
                    <th className="px-6 py-3">Hostname</th>
                    <th className="px-6 py-3">Group / Company</th>
                    <th className="px-6 py-3">User</th>
                    <th className="px-6 py-3">OS</th>
                    <th className="px-6 py-3">App Ver.</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Last Seen</th>
                    {!isReadOnly && <th className="px-6 py-3 text-right">Actions</th>}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredDevices.map((device) => (
                    <React.Fragment key={device.id}>
                        <tr 
                            className={`transition-colors cursor-pointer ${expandedDeviceId === device.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                            onClick={() => toggleExpand(device.id)}
                        >
                            <td className="px-4 py-3 text-slate-400">
                                {expandedDeviceId === device.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </td>
                            <td className="px-6 py-3 font-medium text-slate-900">{device.hostname}</td>
                            <td className="px-6 py-3">
                                {device.company ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                        <Building2 size={10} />
                                        {device.company}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 text-xs italic">Unassigned</span>
                                )}
                            </td>
                            <td className="px-6 py-3 text-slate-600">{device.userName}</td>
                            <td className="px-6 py-3">
                                <div className="flex items-center gap-2">
                                    <Badge status={device.os} />
                                    <span className="text-slate-400 text-xs hidden lg:inline">{device.osVersion}</span>
                                </div>
                            </td>
                            <td className="px-6 py-3 text-slate-600">
                                <div className="flex items-center gap-1">
                                    <Hash size={12} className="text-slate-400" />
                                    {device.appVersion}
                                </div>
                            </td>
                            <td className="px-6 py-3">
                                <Badge status={device.status} />
                            </td>
                            <td className="px-6 py-3 text-slate-500">
                                <div className="flex items-center gap-2">
                                    <Calendar size={14} className="text-slate-400"/>
                                    <span className="text-xs whitespace-nowrap">{new Date(device.lastSeen).toLocaleDateString()}</span>
                                </div>
                            </td>
                            {!isReadOnly && (
                                <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-end gap-1">
                                        <button 
                                            onClick={() => setEditingDevice(device)}
                                            className="text-slate-400 hover:text-brand-600 p-1.5 hover:bg-brand-50 rounded-lg transition-colors"
                                            title="Edit Group Assignment"
                                        >
                                            <Edit2 size={16} />
                                        </button>
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
                                    </div>
                                </td>
                            )}
                        </tr>
                        {expandedDeviceId === device.id && (
                            <tr>
                                <td colSpan={isReadOnly ? 8 : 9} className="p-0">
                                    <ExpandedDeviceView device={device} onRefresh={onRefreshData} />
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
                ))}
                {filteredDevices.length === 0 && (
                    <tr>
                        <td colSpan={isReadOnly ? 8 : 9} className="px-6 py-12 text-center text-slate-400">
                            {devices.length === 0 
                                ? "No devices found assigned to your company." 
                                : `No devices found matching your filters.`}
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-slate-100 text-xs text-slate-400 bg-slate-50">
        Showing {filteredDevices.length} of {devices.length} devices
      </div>

      {/* Group Assignment Modal */}
      {!isReadOnly && editingDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingDevice(null)} />
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm relative z-10 animate-in zoom-in-95 duration-200">
                   <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                       <h3 className="font-bold text-slate-800">Assign Group</h3>
                       <button onClick={() => setEditingDevice(null)} className="text-slate-400 hover:text-slate-600">
                           <X size={18} />
                       </button>
                   </div>
                   <div className="p-6">
                       <p className="text-sm text-slate-500 mb-4">
                           Assign <span className="font-semibold text-slate-800">{editingDevice.hostname}</span> to a company group:
                       </p>
                       <div className="space-y-3">
                           {companies.map(company => (
                               <button
                                   key={company}
                                   onClick={() => {
                                       onAssignCompany(editingDevice.id, company);
                                       setEditingDevice(null);
                                   }}
                                   className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                       editingDevice.company === company 
                                       ? 'bg-brand-50 border-brand-200 text-brand-700 ring-1 ring-brand-200' 
                                       : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                   }`}
                               >
                                   <Building2 size={16} />
                                   <span className="font-medium">{company}</span>
                                   {editingDevice.company === company && (
                                       <span className="ml-auto text-xs bg-brand-200 text-brand-800 px-2 py-0.5 rounded-full">Current</span>
                                   )}
                               </button>
                           ))}
                           <button
                               onClick={() => {
                                   onAssignCompany(editingDevice.id, '');
                                   setEditingDevice(null);
                               }}
                               className="w-full text-xs text-slate-400 hover:text-red-500 mt-2 py-2"
                           >
                               Remove from group
                           </button>
                       </div>
                   </div>
              </div>
          </div>
      )}
    </div>
  );
};