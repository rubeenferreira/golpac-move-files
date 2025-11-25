
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { DeviceList } from './components/DeviceList';
import { AuthPage } from './components/AuthPage';
import { UserManagement } from './components/UserManagement';
import { Device, ViewState, User } from './types';
import { INITIAL_USERS, MOCK_COMPANIES } from './constants';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  
  // App State
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [companies, setCompanies] = useState<string[]>(MOCK_COMPANIES);
  const [loading, setLoading] = useState(true);

  // Initial Data Fetch Effect
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchDevices = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/devices');
        if (response.ok) {
            const data = await response.json();
            setDevices(data);
        } else {
            console.error("Failed to fetch devices. Status:", response.status);
            // If the response is HTML (often 404/500 pages), log text for debug
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") === -1) {
                const text = await response.text();
                console.error("Received HTML instead of JSON:", text.substring(0, 100));
            }
        }
      } catch (error) {
        console.error("Failed to fetch devices", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, [isAuthenticated]);

  // Auth Handlers
  const handleLogin = async (username: string, pass: string): Promise<boolean> => {
    const user = users.find(u => u.username === username && u.password === pass);
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setDevices([]);
    setCurrentView('dashboard');
  };

  // Device Management
  const handleDeleteDevice = async (id: string) => {
    // Optimistic UI update
    setDevices(prev => prev.filter(d => d.id !== id));
    try {
        await fetch(`/api/devices?id=${id}`, { method: 'DELETE' });
    } catch (e) {
        console.error("Failed to delete device on server", e);
    }
  };

  const handleAssignDeviceCompany = async (id: string, company: string) => {
    // Optimistic UI update
    setDevices(prev => prev.map(d => d.id === id ? { ...d, company } : d));
    try {
      await fetch('/api/devices', {
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
    // If the currently logged in user is being updated, reflect changes immediately
    if (currentUser && currentUser.id === updatedUser.id) {
        setCurrentUser(updatedUser);
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

  if (!isAuthenticated) {
    return <AuthPage onLogin={handleLogin} />;
  }

  // --- Logic to filter devices based on User Role ---
  // If Admin, see all. If User, see only their company's devices.
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
