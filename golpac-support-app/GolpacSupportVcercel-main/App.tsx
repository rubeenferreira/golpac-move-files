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
            console.error("Failed to fetch devices");
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

  // User Management Handlers
  const handleAddUser = (userData: Omit<User, 'id'>) => {
    const newUser: User = {
      ...userData,
      id: Math.random().toString(36).substr(2, 9)
    };
    setUsers([...users, newUser]);
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
        return <Dashboard devices={devices} />;
      case 'devices':
        return <DeviceList devices={devices} onDeleteDevice={handleDeleteDevice} />;
      case 'users':
        return (
          <UserManagement 
            users={users} 
            companies={companies}
            onAddUser={handleAddUser}
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
               {currentView === 'dashboard' && 'Real-time metrics for your application deployments.'}
               {currentView === 'devices' && 'View and manage all computers with the Golpac app installed.'}
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