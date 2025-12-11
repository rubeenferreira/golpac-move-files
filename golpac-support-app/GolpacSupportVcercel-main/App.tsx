
import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { DeviceList } from './components/DeviceList';
import { AuthPage } from './components/AuthPage';
import { UserManagement } from './components/UserManagement';
import { Device, ViewState, User } from './types';
import { INITIAL_USERS, MOCK_COMPANIES } from './constants';

const SESSION_KEY = 'golpac_session_user';
const ACTIVITY_KEY = 'golpac_last_active';
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

const App: React.FC = () => {
  const [isSessionChecking, setIsSessionChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  
  // App State
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [companies, setCompanies] = useState<string[]>(MOCK_COMPANIES);
  const [loading, setLoading] = useState(true);

  // Determine API Base URL
  // Logic: If the hostname ends with 'vercel.app', we are on the deployed infrastructure (preview or prod),
  // so we use relative paths ('') to hit the functions of THAT specific deployment.
  // Otherwise (localhost, 127.0.0.1, 192.168.x.x, custom domains), we point to the main production backend.
  const isVercelDeployment = typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app');
  const API_BASE = isVercelDeployment ? '' : 'https://golpac-support-vcercel.vercel.app';

  // --- Session Management ---

  // 1. Check for existing session on mount
  useEffect(() => {
    const restoreSession = () => {
      try {
        const storedUser = localStorage.getItem(SESSION_KEY);
        const lastActive = localStorage.getItem(ACTIVITY_KEY);

        if (storedUser && lastActive) {
          const now = Date.now();
          const lastActiveTime = parseInt(lastActive, 10);
          
          if (now - lastActiveTime < SESSION_TIMEOUT) {
            // Session is valid
            const user = JSON.parse(storedUser);
            setCurrentUser(user);
            setIsAuthenticated(true);
            // Update activity timestamp immediately
            localStorage.setItem(ACTIVITY_KEY, now.toString());
          } else {
            // Session expired
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(ACTIVITY_KEY);
          }
        }
      } catch (e) {
        console.error("Failed to restore session", e);
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setIsSessionChecking(false);
      }
    };

    restoreSession();
  }, []);

  // 2. Track user activity to keep session alive
  useEffect(() => {
    if (!isAuthenticated) return;

    const updateActivity = () => {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    };

    // Throttle updates to max once per 5 seconds
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const handleActivity = () => {
      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          updateActivity();
          throttleTimer = null;
        }, 5000);
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [isAuthenticated]);

  // --- Data Fetching ---

  const fetchDevices = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const targetUrl = `${API_BASE}/api/devices?_t=${Date.now()}`;
    try {
      // Add timestamp to prevent caching
      const response = await fetch(targetUrl);
      if (response.ok) {
          const data = await response.json();
          setDevices(data);
      } else {
          console.error(`Failed to fetch devices. URL: ${targetUrl} | Status: ${response.status}`);
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") === -1) {
              const text = await response.text();
              console.error("Received HTML instead of JSON. This usually means the API route was not found (404) or crashed.", text.substring(0, 100));
          }
      }
    } catch (error) {
      console.error(`Network error fetching devices from ${targetUrl}`, error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [API_BASE]);

  // Initial Data Fetch Effect
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchDevices(true);
  }, [isAuthenticated, fetchDevices]);

  // Auto-Refresh Effect (Every 10 seconds)
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const intervalId = setInterval(() => {
      fetchDevices(false); // Silent refresh
    }, 10000); // 10 seconds

    return () => clearInterval(intervalId);
  }, [isAuthenticated, fetchDevices]);

  // --- Handlers ---

  const handleLogin = async (username: string, pass: string): Promise<boolean> => {
    const user = users.find(u => u.username === username && u.password === pass);
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
      // Persist session
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setDevices([]);
    setCurrentView('dashboard');
    // Clear session
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
  };

  // Device Management
  const handleDeleteDevice = async (id: string) => {
    setDevices(prev => prev.filter(d => d.id !== id));
    try {
        await fetch(`${API_BASE}/api/devices?id=${id}`, { method: 'DELETE' });
    } catch (e) {
        console.error("Failed to delete device on server", e);
    }
  };

  const handleAssignDeviceCompany = async (id: string, company: string) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, company } : d));
    try {
      await fetch(`${API_BASE}/api/devices`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, company })
      });
    } catch (e) {
      console.error("Failed to update device group", e);
    }
  };

  // User Management Handlers
  const handleAddUser = (userData: Omit<User, 'id'>) => {
    const newUser: User = {
      ...userData,
      id: Math.random().toString(36).substr(2, 9)
    };
    setUsers([...users, newUser]);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    // If the currently logged in user is being updated, reflect changes immediately and update storage
    if (currentUser && currentUser.id === updatedUser.id) {
        setCurrentUser(updatedUser);
        localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
    }
  };

  const handleDeleteUser = (id: string) => {
    if (users.length <= 1) {
      alert("Cannot delete the last user.");
      return;
    }
    setUsers(users.filter(u => u.id !== id));
  };

  // Company Management
  const handleAddCompany = (name: string) => {
      if (!companies.includes(name)) {
          setCompanies([...companies, name]);
      }
  };

  const handleDeleteCompany = (name: string) => {
      setCompanies(companies.filter(c => c !== name));
  };

  // --- Rendering ---

  if (isSessionChecking) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 font-sans">
         <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4"></div>
         <p className="text-slate-500 text-sm font-medium animate-pulse">Restoring Session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage onLogin={handleLogin} />;
  }

  // Filter devices based on User Role
  const getVisibleDevices = () => {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin') return devices;
    return devices.filter(d => d.company === currentUser.company);
  };

  const visibleDevices = getVisibleDevices();
  const isReadOnly = currentUser?.role !== 'Admin';

  const renderContent = () => {
    if (loading) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 animate-in fade-in duration-700">
           <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
           <p className="animate-pulse font-medium">Synchronizing Fleet Data...</p>
        </div>
      );
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard devices={visibleDevices} />;
      case 'devices':
        return (
          <DeviceList 
            devices={visibleDevices} 
            companies={companies}
            onDeleteDevice={handleDeleteDevice}
            onAssignCompany={handleAssignDeviceCompany}
            onRefreshData={() => fetchDevices(false)}
            isReadOnly={isReadOnly}
          />
        );
      case 'users':
        return (
          <UserManagement 
            users={users} 
            companies={companies}
            currentUserRole={currentUser?.role}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onAddCompany={handleAddCompany}
            onDeleteCompany={handleDeleteCompany}
          />
        );
      default:
        return <div className="p-10 text-center">View not found</div>;
    }
  };

  return (
    <Layout 
      currentView={currentView} 
      onChangeView={setCurrentView}
      currentUser={currentUser?.username}
      onLogout={handleLogout}
    >
      <div className="h-full flex flex-col">
        {currentView !== 'users' && (
          <div className="mb-6 animate-in slide-in-from-top-4 duration-500">
             <h1 className="text-2xl font-bold text-slate-800">
               {currentView === 'dashboard' && 'Dashboard Overview'}
               {currentView === 'devices' && 'Device Management'}
             </h1>
             <p className="text-slate-500">
               {currentView === 'dashboard' && `Real-time metrics for ${currentUser?.role === 'Admin' ? 'all fleets' : currentUser?.company}.`}
               {currentView === 'devices' && `View ${isReadOnly ? '' : 'and manage'} devices for ${currentUser?.role === 'Admin' ? 'all companies' : currentUser?.company}.`}
             </p>
          </div>
        )}
        <div className="flex-1 min-h-0">
            {renderContent()}
        </div>
      </div>
    </Layout>
  );
};

export default App;
